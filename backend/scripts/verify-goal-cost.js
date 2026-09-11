/**
 * "Restaurantes: $4.200/mes — 1,3 meses de tu Notebook". ¿La división da bien,
 * y se calla cuando no puede hacerla?
 *
 *   node scripts/verify-goal-cost.js
 *
 * Esta conversión existe para NO decirle a nadie que está derrochando: si
 * $4.200 de delivery es un derroche depende del ingreso de esa persona y de su
 * vida, y eso no sale de un resumen bancario. Lo que sí sale es la división
 * entre lo que gasta y la cuota que él mismo se puso.
 *
 * Sale distinto de cero si alguna falla.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const db = require('../db');
const { costoEnMetas } = require('../services/goalCost');
const { calcMonthlyQuota } = require('../services/goalFeasibility');

const cuotaDe = (g) => calcMonthlyQuota(g.current_amount, g.target_amount, g.target_date);

function mesCerrado(haceMeses) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - haceMeses);
  d.setDate(15);
  return d.toISOString().split('T')[0];
}

function enMeses(n) {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().split('T')[0];
}

async function crearUsuario(etiqueta) {
  const { rows } = await db.query(
    "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, 'x') RETURNING id",
    [etiqueta, `costo-${etiqueta}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@ejemplo.local`],
  );
  return rows[0].id;
}

async function gasto(uid, haceMeses, categoria, monto, goalId = null) {
  await db.query(
    `INSERT INTO transactions (user_id, date, description, amount, type, category, source, goal_id)
     VALUES ($1, $2, 'MOV', $3, 'debit', $4, 'manual', $5)`,
    [uid, mesCerrado(haceMeses), monto, categoria, goalId],
  );
}

async function meta(uid, name, target, aMeses) {
  const { rows } = await db.query(
    `INSERT INTO goals (user_id, name, target_amount, current_amount, target_date)
     VALUES ($1, $2, $3, 0, $4) RETURNING *`,
    [uid, name, target, aMeses === null ? null : enMeses(aMeses)],
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
    console.log(`   ${ok ? 'ok   ' : 'FALLA'} ${etiqueta.padEnd(52)} ${detalle}`);
  };

  try {
    // 1. La división, y que no se cuele el gasto propio de la meta.
    let uid = await crearUsuario('base'); creados.push(uid);
    for (let m = 6; m >= 1; m--) {
      await gasto(uid, m, 'Restaurantes', 4200);
      await gasto(uid, m, 'Supermercado', 12000);
      await gasto(uid, m, 'Servicios', 300);       // chico: no deberia figurar
    }
    // Meta de 100.000 a 10 meses => cuota ~10.000/mes.
    const g = await meta(uid, 'Notebook', 100000, 10);
    let r = await costoEnMetas(db, uid, await metasDe(uid), cuotaDe);
    const cuota = cuotaDe(g);
    chequeo('toma la meta y su cuota', r.status === 'ok' && r.meta.name === 'Notebook',
      `meta ${r.meta?.name}, cuota ${r.meta?.cuota}`);

    const rest = r.categorias.find((c) => c.categoria === 'Restaurantes');
    const esperado = Math.round((4200 / cuota) * 10) / 10;
    chequeo('convierte el gasto a meses de cuota', rest && rest.mesesDeCuota === esperado,
      `$4200/mes = ${rest?.mesesDeCuota} meses (esperado ${esperado})`);
    chequeo('ordena por monto, la mas grande primero', r.categorias[0].categoria === 'Supermercado',
      r.categorias.map((c) => c.categoria).join(' > '));
    chequeo('descarta lo que no llega a 0,1 de cuota', !r.categorias.some((c) => c.categoria === 'Servicios'),
      '$300/mes no dice nada util');

    // 2. Un deposito a la meta NO es gasto: si contara, ahorrar apareceria como
    //    una categoria mas en la lista de en que se te va la plata.
    uid = await crearUsuario('con-depositos'); creados.push(uid);
    for (let m = 6; m >= 1; m--) await gasto(uid, m, 'Restaurantes', 4200);
    const g2 = await meta(uid, 'Fondo', 100000, 10);
    for (let m = 6; m >= 1; m--) await gasto(uid, m, 'Ahorro', 9000, g2.id);
    r = await costoEnMetas(db, uid, await metasDe(uid), cuotaDe);
    chequeo('los depositos a metas no figuran como gasto',
      !r.categorias.some((c) => c.categoria === 'Ahorro'),
      r.categorias.map((c) => c.categoria).join(', ') || '(ninguna)');

    // 3. Sin fecha no hay cuota, y sin cuota no hay conversion posible.
    uid = await crearUsuario('sin-fecha'); creados.push(uid);
    for (let m = 6; m >= 1; m--) await gasto(uid, m, 'Restaurantes', 4200);
    await meta(uid, 'Algun dia', 100000, null);
    r = await costoEnMetas(db, uid, await metasDe(uid), cuotaDe);
    chequeo('sin fecha objetivo no inventa la conversion', r.status === 'sin_meta', `status ${r.status}`);

    // 4. Un mes cerrado no es un promedio.
    uid = await crearUsuario('poco-historial'); creados.push(uid);
    await gasto(uid, 1, 'Restaurantes', 4200);
    await meta(uid, 'Notebook', 100000, 10);
    r = await costoEnMetas(db, uid, await metasDe(uid), cuotaDe);
    chequeo('un solo mes cerrado no opina', r.status === 'sin_datos', `status ${r.status}`);

    // 5. Con varias metas, la referencia es la de fecha mas proxima.
    uid = await crearUsuario('varias'); creados.push(uid);
    for (let m = 6; m >= 1; m--) await gasto(uid, m, 'Restaurantes', 4200);
    await meta(uid, 'Lejana', 100000, 24);
    await meta(uid, 'Proxima', 100000, 6);
    r = await costoEnMetas(db, uid, await metasDe(uid), cuotaDe);
    chequeo('elige la meta de fecha mas proxima', r.meta?.name === 'Proxima', `eligio ${r.meta?.name}`);
  } finally {
    for (const uid of creados) {
      await db.query('DELETE FROM transactions WHERE user_id = $1', [uid]);
      await db.query('DELETE FROM goal_deposits WHERE user_id = $1', [uid]);
      await db.query('DELETE FROM goals WHERE user_id = $1', [uid]);
      await db.query('DELETE FROM users WHERE id = $1', [uid]);
    }
  }

  console.log(`\n${fallas === 0 ? 'TODO OK: convierte, y se calla cuando no puede' : `${fallas} chequeos fallaron`}`);
  process.exit(fallas === 0 ? 0 : 1);
})().catch((e) => { console.error('error:', e.message); process.exit(1); });
