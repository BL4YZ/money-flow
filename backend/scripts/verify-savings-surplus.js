/**
 * ¿"Ahorrás X este mes" mide ahorro, o mide qué día es hoy?
 *
 *   node scripts/verify-savings-surplus.js
 *
 * El cálculo viejo comparaba el mes en curso (parcial) contra el promedio de
 * meses completos, así que a un usuario que gasta EXACTAMENTE lo mismo todos
 * los meses le decía "ahorrás $23.714" el día 1 y "$0" el día 30. Este script
 * siembra cuatro usuarios descartables y comprueba las cuatro situaciones que
 * el número tiene que distinguir.
 *
 * Sale distinto de cero si alguna falla.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const db = require('../db');
const { __testing } = require('../routes/goals');

const DIARIO = 1000;

// Fecha del día `dia` del mes, `haceMeses` meses atrás.
function fecha(haceMeses, dia) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - haceMeses);
  d.setDate(dia);
  return d.toISOString().split('T')[0];
}

const diasEnMes = (haceMeses) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - haceMeses + 1);
  d.setDate(0);
  return d.getDate();
};

async function crearUsuario(etiqueta) {
  const { rows } = await db.query(
    "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, 'x') RETURNING id",
    [etiqueta, `surplus-${etiqueta}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@ejemplo.local`],
  );
  return rows[0].id;
}

async function gasto(uid, f, monto) {
  await db.query(
    `INSERT INTO transactions (user_id, date, description, amount, type, category, source)
     VALUES ($1, $2, 'GASTO', $3, 'debit', 'Otros', 'manual')`,
    [uid, f, monto],
  );
}

// Llena `mesesAtras` meses previos enteros a DIARIO/día, y el mes actual a
// `diarioActual`/día hasta hoy.
async function sembrar(uid, mesesAtras, diarioActual) {
  const hoy = new Date().getDate();
  for (let m = mesesAtras; m >= 1; m--) {
    for (let d = 1; d <= diasEnMes(m); d++) await gasto(uid, fecha(m, d), DIARIO);
  }
  if (diarioActual > 0) {
    for (let d = 1; d <= hoy; d++) await gasto(uid, fecha(0, d), diarioActual);
  }
}

(async () => {
  await db.initSchema().catch(() => {});
  const hoy = new Date().getDate();
  const creados = [];
  let fallas = 0;

  const chequeo = (etiqueta, ok, detalle) => {
    if (!ok) fallas++;
    console.log(`   ${ok ? 'ok   ' : 'FALLA'} ${etiqueta.padEnd(52)} ${detalle}`);
  };

  try {
    console.log(`Hoy es día ${hoy} del mes. Gasto base: $${DIARIO}/día.\n`);

    // 1. Gasta EXACTAMENTE lo mismo de siempre. No ahorró nada.
    let uid = await crearUsuario('constante'); creados.push(uid);
    await sembrar(uid, 6, DIARIO);
    let r = await __testing.calcSavingsSurplus(uid);
    chequeo('gasta igual que siempre → sin mensaje', r === null, `devolvió ${JSON.stringify(r)}`);

    // 2. Gasta la MITAD este mes. Eso sí es ahorro, y es medible hoy.
    uid = await crearUsuario('ahorra'); creados.push(uid);
    await sembrar(uid, 6, DIARIO / 2);
    r = await __testing.calcSavingsSurplus(uid);
    const esperado = (DIARIO / 2) * hoy;
    chequeo('gasta la mitad → detecta el ahorro', r !== null && Math.abs(r.amount - esperado) <= 1,
      `esperado ~${esperado}, devolvió ${r && r.amount}`);

    // 3. Todavía no subió el resumen de este mes. El cálculo viejo daba el
    //    promedio ENTERO acá — un ahorro inventado sobre datos que no existen.
    uid = await crearUsuario('sin-datos'); creados.push(uid);
    await sembrar(uid, 6, 0);
    r = await __testing.calcSavingsSurplus(uid);
    chequeo('sin movimientos este mes → sin mensaje', r === null, `devolvió ${JSON.stringify(r)}`);

    // 4. Un solo mes previo: no hay promedio, hay una anécdota.
    uid = await crearUsuario('poco-historial'); creados.push(uid);
    await sembrar(uid, 1, DIARIO / 2);
    r = await __testing.calcSavingsSurplus(uid);
    chequeo('un solo mes de historial → sin mensaje', r === null, `devolvió ${JSON.stringify(r)}`);
  } finally {
    for (const uid of creados) {
      await db.query('DELETE FROM transactions WHERE user_id = $1', [uid]);
      await db.query('DELETE FROM users WHERE id = $1', [uid]);
    }
  }

  console.log(`\n${fallas === 0 ? 'TODO OK: el número mide gasto, no la fecha' : `${fallas} chequeos fallaron`}`);
  process.exit(fallas === 0 ? 0 : 1);
})().catch((e) => { console.error('error:', e.message); process.exit(1); });
