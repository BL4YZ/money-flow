/**
 * ¿La meta es alcanzable de verdad?
 *
 * Una app de metas sin acceso al banco sólo puede dibujar una barrita: pide un
 * objetivo y una fecha y muestra el porcentaje. Acá el resumen del usuario ya
 * está cargado, así que se puede responder la pregunta que esa barrita esquiva
 * — "¿te da?" — comparando la cuota necesaria contra lo que realmente le sobra
 * cada mes. Es lo que hace YNAB y es su parte incómoda: decir que NO da es más
 * útil que mostrar tres barras optimistas.
 *
 * Cuatro decisiones que cambian el número, todas por el mismo motivo (un
 * "alcanza" equivocado hace que alguien cuente con plata que no tiene):
 *
 *  1. Sólo meses CERRADOS. El mes en curso está a mitad de camino y arrastraría
 *     el promedio hacia abajo. Mismo criterio que calcSavingsSurplus.
 *  2. Los DEPÓSITOS A METAS NO son gasto. Cada depósito escribe además una fila
 *     en transactions como 'debit' (routes/goals.js), así que contarlos haría
 *     que ahorrar reduzca la capacidad de ahorrar — y la app le diría a alguien
 *     que cumple su meta todos los meses que no le da para cumplirla.
 *  3. Los gastos fijos NO se restan aparte. Ya están adentro del gasto promedio;
 *     restarlos otra vez los cuenta dos veces. Se informan sólo para que el
 *     usuario sepa qué parte de su gasto es recortable.
 *  4. El promedio divide por los meses que TIENEN movimientos, no por la
 *     ventana. Con un solo resumen subido, dividir por 6 reporta un tercio del
 *     ingreso real. Misma regla que services/spendingInsight.js.
 *
 * Con menos de dos meses cerrados no devuelve un veredicto: devuelve
 * `status: 'sin_datos'`. Un cálculo de viabilidad sobre un mes es una anécdota.
 */
const db = require('../db');
const { getUsdToUyuRate } = require('./exchangeRate');

const MESES_VENTANA  = 6;
const MESES_MINIMOS  = 2;
const MARGEN_HOLGADO = 0.8;  // usar menos del 80% del margen es "alcanza"; el resto, "ajustado"

// Cuota mensual necesaria para llegar a la fecha objetivo.
// Vive acá y no en la ruta porque la viabilidad y la tarjeta de la meta tienen
// que dar exactamente el mismo número.
function calcMonthlyQuota(currentAmount, targetAmount, targetDate) {
  if (!targetDate) return null;
  const monthsLeft = (new Date(targetDate) - new Date()) / (1000 * 60 * 60 * 24 * 30.44);
  if (monthsLeft <= 0) return null;
  const remaining = parseFloat(targetAmount) - parseFloat(currentAmount);
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / monthsLeft);
}

const enMeses = (meses) => {
  const d = new Date();
  d.setDate(d.getDate() + Math.round(meses * 30.44));
  return d.toISOString().split('T')[0];
};

function veredicto(cuota, disponible) {
  if (disponible <= 0) return 'sin_margen';
  if (cuota === null) return 'sin_fecha';
  if (cuota <= disponible * MARGEN_HOLGADO) return 'alcanza';
  if (cuota <= disponible) return 'ajustado';
  return 'no_alcanza';
}

async function calcFeasibility(userId, goals) {
  const [{ rows: prom }, { rows: subs }, { rows: cuentas }] = await Promise.all([
    db.query(
      `WITH meses AS (
         SELECT DATE_TRUNC('month', date) AS mes,
                SUM(CASE WHEN type = 'credit' THEN ABS(amount_uyu) ELSE 0 END) AS ingreso,
                -- goal_id IS NULL: un depósito a una meta no es gasto, es la
                -- misma plata cambiada de lugar.
                SUM(CASE WHEN type = 'debit' AND goal_id IS NULL THEN ABS(amount_uyu) ELSE 0 END) AS gasto
         FROM transactions
         WHERE user_id = $1
           AND date >= DATE_TRUNC('month', NOW()) - INTERVAL '${MESES_VENTANA} months'
           AND date <  DATE_TRUNC('month', NOW())
         GROUP BY 1
       )
       SELECT COUNT(*) FILTER (WHERE ingreso > 0) AS meses_ingreso,
              COUNT(*) FILTER (WHERE gasto   > 0) AS meses_gasto,
              AVG(ingreso) FILTER (WHERE ingreso > 0) AS ingreso_prom,
              AVG(gasto)   FILTER (WHERE gasto   > 0) AS gasto_prom
       FROM meses`,
      [userId],
    ),
    db.query(
      `SELECT COALESCE(SUM(CASE frequency
                             WHEN 'yearly' THEN amount / 12
                             WHEN 'weekly' THEN amount * 52 / 12
                             ELSE amount END), 0) AS total
       FROM subscriptions
       WHERE user_id = $1 AND is_active = true AND amount IS NOT NULL`,
      [userId],
    ),
    db.query(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM bills WHERE user_id = $1 AND is_active = true',
      [userId],
    ),
  ]);

  const p = prom[0] || {};
  const mesesIngreso = parseInt(p.meses_ingreso || 0, 10);
  const mesesGasto   = parseInt(p.meses_gasto   || 0, 10);

  if (mesesIngreso < MESES_MINIMOS || mesesGasto < MESES_MINIMOS) {
    return { status: 'sin_datos', mesesIngreso, mesesGasto, mesesMinimos: MESES_MINIMOS };
  }

  const ingreso    = Math.round(parseFloat(p.ingreso_prom));
  const gasto      = Math.round(parseFloat(p.gasto_prom));
  const disponible = ingreso - gasto;

  const fijos = {
    suscripciones: Math.round(parseFloat(subs[0].total)),
    cuentas:       Math.round(parseFloat(cuentas[0].total)),
  };
  fijos.total = fijos.suscripciones + fijos.cuentas;

  // COTIZACION DE HOY, no la del dia de cada movimiento — y la diferencia es de
  // fondo. Registrar un gasto pasado usa la cotizacion de SU dia porque es un
  // hecho que ya ocurrio. Esto es al reves: una proyeccion hacia adelante. "Para
  // esa meta en dolares necesitas US$500 por mes" hay que compararlo contra los
  // pesos que te sobran HOY, porque es hoy cuando decidis si te da.
  const activas = goals.filter((g) => !g.is_completed);
  const hayUSD = activas.some((g) => g.currency === 'USD');
  const cotizacion = hayUSD ? await getUsdToUyuRate() : 1;
  const aPesos = (monto, moneda) => (moneda === 'USD' ? monto * cotizacion : monto);

  const porMeta = activas.map((g) => {
    const cuota     = calcMonthlyQuota(g.current_amount, g.target_amount, g.target_date);
    // La cuota se muestra en la moneda de la meta y se COMPARA en pesos.
    const cuotaUyu  = cuota === null ? null : aPesos(cuota, g.currency);
    const restante  = aPesos(parseFloat(g.target_amount) - parseFloat(g.current_amount), g.currency);
    const mesesReales = disponible > 0 ? restante / disponible : null;

    const m = {
      id: g.id,
      name: g.name,
      cuota,
      currency: g.currency || 'UYU',
      cuotaUyu: cuotaUyu === null ? null : Math.round(cuotaUyu),
      veredicto: veredicto(cuotaUyu, disponible),
      // A qué fecha llegaría destinando TODO el margen a esta meta. Es el techo,
      // no una promesa: si hay varias metas, el margen se reparte.
      mesesAlRitmo: mesesReales === null ? null : Math.round(mesesReales * 10) / 10,
      fechaPosible: mesesReales === null ? null : enMeses(mesesReales),
    };

    // Cuando no da por fecha, las dos salidas concretas: correr la fecha, o
    // bajar el objetivo a lo que sí entra en el plazo.
    if (m.veredicto === 'no_alcanza' && g.target_date) {
      const mesesPlazo = (new Date(g.target_date) - new Date()) / (1000 * 60 * 60 * 24 * 30.44);
      // Lo que falta se dice en PESOS porque es contra el margen en pesos; el
      // objetivo alcanzable, en la moneda de la meta, que es como esta escrita.
      m.faltantePorMes  = Math.round(cuotaUyu - disponible);
      m.objetivoPosible = Math.round(
        parseFloat(g.current_amount) + (disponible * mesesPlazo) / (g.currency === 'USD' ? cotizacion : 1));
    }
    return m;
  });

  // El chequeo que ninguna barrita individual hace: las metas comparten UN
  // margen. Tres metas que "alcanzan" por separado pueden no entrar juntas.
  const conCuota   = porMeta.filter((m) => m.cuota !== null && m.cuota > 0);
  // La suma tiene que ser en pesos: sumar una cuota en dolares con una en pesos
  // da un numero que no es ninguna de las dos cosas.
  const cuotaTotal = conCuota.reduce((s, m) => s + m.cuotaUyu, 0);

  return {
    status: 'ok',
    mesesIngreso,
    mesesGasto,
    ingreso,
    gasto,
    disponible,
    fijos,
    cuotaTotal: Math.round(cuotaTotal),
    cotizacion: hayUSD ? cotizacion : null,
    metasConFecha: conCuota.length,
    metasSinFecha: porMeta.length - conCuota.length,
    veredicto: conCuota.length === 0 ? 'sin_fecha' : veredicto(cuotaTotal, disponible),
    faltante: cuotaTotal > disponible ? Math.round(cuotaTotal - disponible) : 0,
    porMeta,
  };
}

module.exports = { calcFeasibility, calcMonthlyQuota };
