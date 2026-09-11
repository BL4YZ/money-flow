/**
 * Pesos y dólares en la misma cuenta: ¿suma bien, y con qué cotización?
 *
 *   node scripts/verify-multicurrency.js
 *
 * En Uruguay se cobra en pesos y se ahorra en dólares, y mucha gente tiene las
 * dos cuentas. Hasta acá todo se sumaba como si fuera una sola moneda: un gasto
 * de US$ 50 entraba como 50 pesos.
 *
 * Lo que tiene que cumplirse:
 *   - cada movimiento guarda SU moneda y la cotización DE SU FECHA
 *   - la cotización queda congelada: un ahorro en dólares no "crece" porque
 *     suba el dólar
 *   - amount_uyu lo genera la base y nadie puede escribirlo a mano
 *   - los totales suman en pesos, no mezclan
 *
 * Sale distinto de cero si alguna falla.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const db = require('../db');
const { getUsdToUyuRateOn } = require('../services/exchangeRate');
const { detectarMoneda } = require('../services/ocrParser');
const { calcFeasibility } = require('../services/goalFeasibility');

async function crearUsuario() {
  const { rows } = await db.query(
    "INSERT INTO users (name, email, password_hash) VALUES ('Multi', $1, 'x') RETURNING id",
    [`multi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@ejemplo.local`],
  );
  return rows[0].id;
}

async function mov(uid, fecha, desc, monto, tipo, moneda, tasa) {
  const { rows } = await db.query(
    `INSERT INTO transactions (user_id, date, description, amount, type, category, source, currency, rate_uyu)
     VALUES ($1, $2, $3, $4, $5, 'Otros', 'manual', $6, $7)
     RETURNING id, amount::float, rate_uyu::float, amount_uyu::float, currency`,
    [uid, fecha, desc, monto, tipo, moneda, tasa],
  );
  return rows[0];
}

(async () => {
  await db.initSchema().catch(() => {});
  const creados = [];
  let fallas = 0;
  const chequeo = (etiqueta, ok, detalle) => {
    if (!ok) fallas++;
    console.log(`   ${ok ? 'ok   ' : 'FALLA'} ${etiqueta.padEnd(52)} ${detalle}`);
  };

  try {
    // 1. La moneda sale del preambulo del resumen, sin preguntarle al usuario.
    chequeo('lee la moneda del preambulo (dolares)',
      detectarMoneda([['Cliente: X'], ['Moneda: DOLARES AMERICANOS']]) === 'USD', '');
    chequeo('lee la moneda del preambulo (pesos)',
      detectarMoneda([['Cliente: X'], ['Moneda: PESOS URUGUAYOS']]) === 'UYU', '');
    chequeo('no adivina cuando el preambulo no la dice',
      detectarMoneda([['Cliente: X'], ['Cuenta: 999']]) === null,
      'multiplicar por 40 a ciegas es peor que preguntar');

    // 2. La cotizacion es la del DIA, no la de hoy. Contra el BCU de verdad.
    const enero = await getUsdToUyuRateOn('2026-01-05');
    const junio = await getUsdToUyuRateOn('2026-06-15');
    chequeo('trae cotizaciones distintas por fecha', enero > 0 && junio > 0 && enero !== junio,
      `2026-01-05: ${enero}   2026-06-15: ${junio}`);

    // 3. Lo que guarda cada movimiento.
    const uid = await crearUsuario(); creados.push(uid);
    const usd = await mov(uid, '2026-01-05', 'COMPRA EXTERIOR', 50, 'debit', 'USD', enero);
    chequeo('un movimiento en dolares guarda su moneda', usd.currency === 'USD', `${usd.currency}`);
    chequeo('amount_uyu = importe x cotizacion del dia',
      Math.abs(usd.amount_uyu - 50 * enero) < 0.01,
      `US$50 x ${enero} = ${usd.amount_uyu}`);

    // 4. La cotizacion queda CONGELADA: el mismo importe en otra fecha vale otra
    //    cosa en pesos, y eso es correcto — no es que se haya gastado mas.
    const usd2 = await mov(uid, '2026-06-15', 'COMPRA EXTERIOR', 50, 'debit', 'USD', junio);
    chequeo('el mismo importe en otra fecha da otro valor en pesos',
      usd2.amount_uyu !== usd.amount_uyu,
      `enero ${usd.amount_uyu} vs junio ${usd2.amount_uyu}`);

    // 5. amount_uyu lo genera la base: nadie puede escribirlo a mano, que es
    //    como goals.current_amount se habia separado de su historial.
    let rechazado = false;
    try {
      await db.query('UPDATE transactions SET amount_uyu = 999999 WHERE id = $1', [usd.id]);
    } catch (_) { rechazado = true; }
    chequeo('amount_uyu no se puede escribir a mano', rechazado, 'la base lo rechaza');

    // 6. EL CASO QUE MOTIVA TODO: pesos y dolares en la misma cuenta.
    //    Sueldo en pesos, gasto en dolares. Si se sumaran nominal, US$50 valdria
    //    lo mismo que $50.
    const uid2 = await crearUsuario(); creados.push(uid2);
    const hoy = new Date();
    for (let m = 6; m >= 1; m--) {
      const d = new Date(hoy); d.setDate(1); d.setMonth(d.getMonth() - m); d.setDate(15);
      const f = d.toISOString().split('T')[0];
      const tasa = await getUsdToUyuRateOn(f);
      await mov(uid2, f, 'SUELDO', 60000, 'credit', 'UYU', 1);
      await mov(uid2, f, 'SERVIDOR EXTERIOR', 100, 'debit', 'USD', tasa);
    }
    const { rows: metas } = await db.query(
      `INSERT INTO goals (user_id, name, target_amount, current_amount) VALUES ($1, 'X', 100000, 0) RETURNING *`,
      [uid2]);
    const f = await calcFeasibility(uid2, metas);
    const tasaMedia = await getUsdToUyuRateOn(hoy.toISOString().split('T')[0]);
    const gastoEsperado = 100 * tasaMedia;
    chequeo('el gasto en dolares se cuenta en pesos',
      Math.abs(f.gasto - gastoEsperado) < gastoEsperado * 0.1,
      `US$100/mes -> $${f.gasto} (aprox $${Math.round(gastoEsperado)})`);
    chequeo('...y no como si fueran 100 pesos', f.gasto > 1000, `$${f.gasto}`);
  } finally {
    for (const uid of creados) {
      await db.query('DELETE FROM transactions WHERE user_id = $1', [uid]);
      await db.query('DELETE FROM goals WHERE user_id = $1', [uid]);
      await db.query('DELETE FROM users WHERE id = $1', [uid]);
    }
  }

  console.log(`\n${fallas === 0 ? 'TODO OK: cada moneda con su cotizacion, y los totales en pesos' : `${fallas} chequeos fallaron`}`);
  process.exit(fallas === 0 ? 0 : 1);
})().catch((e) => { console.error('error:', e.message); process.exit(1); });
