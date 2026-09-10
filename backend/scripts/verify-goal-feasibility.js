/**
 * ¿La app dice "te da" cuando no te da?
 *
 *   node scripts/verify-goal-feasibility.js
 *
 * Siembra usuarios descartables con un ingreso y un gasto conocidos y comprueba
 * las cinco situaciones que el veredicto tiene que distinguir. Las tres que
 * importan de verdad son la 3, la 4 y la 5: dos metas que solas entran y juntas
 * no, un depósito a una meta contado como gasto (que haría que ahorrar reduzca
 * tu capacidad de ahorrar), y un historial demasiado corto para opinar.
 *
 * Sale distinto de cero si alguna falla.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const db = require('../db');
const { calcFeasibility } = require('../services/goalFeasibility');

const INGRESO = 60000;
const GASTO   = 40000;
const MARGEN  = INGRESO - GASTO;   // 20.000/mes

// Día 15 de un mes CERRADO (el mes en curso no entra al promedio).
function mesCerrado(haceMeses) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - haceMeses);
  d.setDate(15);
  return d.toISOString().split('T')[0];
}

// Fecha objetivo a N meses vista.
function enMeses(n) {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().split('T')[0];
}

async function crearUsuario(etiqueta) {
  const { rows } = await db.query(
    "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, 'x') RETURNING id",
    [etiqueta, `feas-${etiqueta}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@ejemplo.local`],
  );
  return rows[0].id;
}

async function mov(uid, fecha, desc, monto, tipo, goalId = null) {
  await db.query(
    `INSERT INTO transactions (user_id, date, description, amount, type, category, source, goal_id)
     VALUES ($1, $2, $3, $4, $5, 'Otros', 'manual', $6)`,
    [uid, fecha, desc, monto, tipo, goalId],
  );
}

// `meses` meses cerrados con el mismo ingreso y gasto.
async function sembrar(uid, meses = 6) {
  for (let m = meses; m >= 1; m--) {
    await mov(uid, mesCerrado(m), 'SUELDO', INGRESO, 'credit');
    await mov(uid, mesCerrado(m), 'GASTOS', GASTO,   'debit');
  }
}

async function meta(uid, name, target, aMeses, actual = 0) {
  const { rows } = await db.query(
    `INSERT INTO goals (user_id, name, target_amount, current_amount, target_date)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [uid, name, target, actual, aMeses === null ? null : enMeses(aMeses)],
  );
  return rows[0];
}

const metasDe = async (uid) =>
  (await db.query('SELECT * FROM goals WHERE user_id = $1 ORDER BY created_at', [uid])).rows;

(async () => {
  await db.initSchema().catch(() => {});
  const creados = [];
  let fallas = 0;
  const chequeo = (etiqueta, ok, detalle) => {
    if (!ok) fallas++;
    console.log(`   ${ok ? 'ok   ' : 'FALLA'} ${etiqueta.padEnd(50)} ${detalle}`);
  };
  const cerca = (a, b, tol) => a !== null && a !== undefined && Math.abs(a - b) <= tol;

  try {
    console.log(`Ingreso $${INGRESO}/mes, gasto $${GASTO}/mes → margen real $${MARGEN}/mes.\n`);

    // 1. Una meta holgada.
    let uid = await crearUsuario('holgada'); creados.push(uid);
    await sembrar(uid);
    await meta(uid, 'Notebook', 100000, 10);          // cuota ~10.000, mitad del margen
    let f = await calcFeasibility(uid, await metasDe(uid));
    chequeo('lee bien ingreso, gasto y margen',
      f.ingreso === INGRESO && f.gasto === GASTO && f.disponible === MARGEN,
      `ingreso ${f.ingreso}, gasto ${f.gasto}, margen ${f.disponible}`);
    chequeo('cuota que entra cómoda → alcanza', f.veredicto === 'alcanza',
      `cuota ${f.cuotaTotal} vs margen ${f.disponible} → ${f.veredicto}`);

    // 2. Una meta que no entra. Tiene que decirlo, y ofrecer la salida.
    uid = await crearUsuario('no-da'); creados.push(uid);
    await sembrar(uid);
    await meta(uid, 'Auto', 300000, 10);              // cuota ~30.000 contra 20.000
    f = await calcFeasibility(uid, await metasDe(uid));
    const m = f.porMeta[0];
    chequeo('cuota mayor que el margen → no alcanza', f.veredicto === 'no_alcanza',
      `cuota ${f.cuotaTotal} vs margen ${f.disponible} → ${f.veredicto}`);
    chequeo('dice cuánto falta por mes', cerca(m.faltantePorMes, 10000, 600),
      `faltan ${m.faltantePorMes}/mes`);
    chequeo('dice qué objetivo sí entra en el plazo', cerca(m.objetivoPosible, 200000, 12000),
      `entrarían ${m.objetivoPosible}`);

    // 3. EL CASO QUE UNA BARRITA POR META NO VE: dos metas que solas entran y
    //    juntas no. El margen es uno solo.
    uid = await crearUsuario('dos-metas'); creados.push(uid);
    await sembrar(uid);
    await meta(uid, 'Viaje', 120000, 10);             // ~12.000
    await meta(uid, 'Curso', 120000, 10);             // ~12.000
    f = await calcFeasibility(uid, await metasDe(uid));
    const solas = f.porMeta.every((x) => x.veredicto !== 'no_alcanza');
    chequeo('cada meta por separado entraría', solas,
      f.porMeta.map((x) => `${x.name}:${x.veredicto}`).join(' '));
    chequeo('juntas NO entran → lo dice', f.veredicto === 'no_alcanza',
      `suma de cuotas ${f.cuotaTotal} vs margen ${f.disponible} → ${f.veredicto}`);
    chequeo('cuantifica el faltante conjunto', cerca(f.faltante, f.cuotaTotal - MARGEN, 2),
      `faltan ${f.faltante}/mes`);

    // 4. Ahorrar no puede reducir tu capacidad de ahorrar. El depósito escribe
    //    una fila 'debit' en transactions; si contara, el margen bajaría.
    uid = await crearUsuario('con-depositos'); creados.push(uid);
    await sembrar(uid);
    const g = await meta(uid, 'Fondo', 100000, 10);
    for (let mm = 6; mm >= 1; mm--) await mov(uid, mesCerrado(mm), 'Ahorro: Fondo', 8000, 'debit', g.id);
    f = await calcFeasibility(uid, await metasDe(uid));
    chequeo('los depósitos a metas no cuentan como gasto',
      f.gasto === GASTO && f.disponible === MARGEN,
      `gasto ${f.gasto} (esperado ${GASTO}), margen ${f.disponible} (esperado ${MARGEN})`);

    // 5. Un mes cerrado no es un promedio, es una anécdota.
    uid = await crearUsuario('poco-historial'); creados.push(uid);
    await sembrar(uid, 1);
    await meta(uid, 'Algo', 100000, 10);
    f = await calcFeasibility(uid, await metasDe(uid));
    chequeo('un solo mes cerrado → no opina', f.status === 'sin_datos',
      `status ${f.status}`);
  } finally {
    for (const uid of creados) {
      await db.query('DELETE FROM transactions WHERE user_id = $1', [uid]);
      await db.query('DELETE FROM goal_deposits WHERE user_id = $1', [uid]);
      await db.query('DELETE FROM goals WHERE user_id = $1', [uid]);
      await db.query('DELETE FROM users WHERE id = $1', [uid]);
    }
  }

  console.log(`\n${fallas === 0 ? 'TODO OK: el veredicto se sostiene contra los datos' : `${fallas} chequeos fallaron`}`);
  process.exit(fallas === 0 ? 0 : 1);
})().catch((e) => { console.error('error:', e.message); process.exit(1); });
