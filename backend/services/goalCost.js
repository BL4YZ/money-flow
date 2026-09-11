/**
 * ¿Cuánto cuesta esto, medido en tu meta?
 *
 *   "Restaurantes: $4.200/mes — 1,3 meses de tu Notebook."
 *
 * POR QUÉ ASÍ Y NO "ESTÁS DERROCHANDO". Si $4.200 de delivery es un derroche
 * depende del ingreso de esa persona, de qué haría con esa plata si no, y de su
 * vida. La app no lo sabe y no puede saberlo desde un resumen bancario. Llamarlo
 * derroche no es un dato: es un juicio moral con pinta de estadística.
 *
 * Esta conversión no juzga nada. Es una división entre dos números que el
 * usuario ya conoce: lo que gasta, y la cuota que él mismo se puso. El juicio
 * lo hace él, con la información puesta en la unidad que le importa. Y funciona
 * mejor que el reto, porque conecta con algo que la persona ya dijo que quiere.
 *
 * Tampoco decide qué categorías son "prescindibles": las ordena por monto y
 * muestra las más grandes, sin adjetivos. Marcar unas como recortables y otras
 * no es exactamente el juicio que este archivo existe para no hacer — el usuario
 * sabe perfectamente que la luz no es opcional.
 *
 * Las reglas de siempre: sólo meses CERRADOS (el mes en curso va por la mitad y
 * bajaría el promedio), los depósitos a metas no son gasto (`goal_id IS NULL`),
 * y el promedio divide por los meses que tienen movimientos, no por la ventana.
 */

const { getUsdToUyuRate } = require('./exchangeRate');

const MESES_VENTANA = 6;
const MESES_MINIMOS = 2;
const TOP = 4;

/**
 * @param goals metas activas ya traídas por la ruta
 * @param cuotaDe función (goal) => cuota mensual o null, para que la tarjeta de
 *        la meta y esto no puedan discrepar sobre la cuota
 */
async function costoEnMetas(db, userId, goals, cuotaDe) {
  // La meta de referencia es la de fecha más próxima entre las que tienen
  // cuota: es la que la persona está mirando de verdad. Sin fecha no hay cuota,
  // y sin cuota esta conversión no se puede hacer — así que no se hace.
  const conCuota = goals
    .filter((g) => !g.is_completed && g.target_date && cuotaDe(g) > 0)
    .sort((a, b) => new Date(a.target_date) - new Date(b.target_date));

  if (conCuota.length === 0) return { status: 'sin_meta' };

  const meta = conCuota[0];
  // El gasto viene en pesos, asi que una cuota en dolares hay que pasarla a
  // pesos para dividir. Con la cotizacion de HOY: es una comparacion hacia
  // adelante, no el registro de algo que ya paso.
  const cotizacion = meta.currency === 'USD' ? await getUsdToUyuRate() : 1;
  const cuota = cuotaDe(meta) * cotizacion;

  const { rows } = await db.query(
    `SELECT category, AVG(total) AS mensual, COUNT(*) AS meses FROM (
       SELECT COALESCE(category, 'Otros') AS category,
              DATE_TRUNC('month', date) AS mes,
              SUM(ABS(amount_uyu)) AS total
       FROM transactions
       WHERE user_id = $1 AND type = 'debit' AND goal_id IS NULL
         AND date >= DATE_TRUNC('month', NOW()) - INTERVAL '${MESES_VENTANA} months'
         AND date <  DATE_TRUNC('month', NOW())
       GROUP BY 1, 2
     ) t
     GROUP BY category
     ORDER BY 2 DESC`,
    [userId],
  );

  const meses = rows.length ? Math.max(...rows.map((r) => parseInt(r.meses, 10))) : 0;
  if (meses < MESES_MINIMOS) return { status: 'sin_datos', meses, mesesMinimos: MESES_MINIMOS };

  const categorias = rows
    .map((r) => ({
      categoria: r.category,
      mensual: Math.round(parseFloat(r.mensual)),
      mesesDeCuota: Math.round((parseFloat(r.mensual) / cuota) * 10) / 10,
    }))
    // Por debajo de una décima de cuota la frase no dice nada útil.
    .filter((c) => c.mesesDeCuota >= 0.1)
    .slice(0, TOP);

  if (categorias.length === 0) return { status: 'sin_datos', meses, mesesMinimos: MESES_MINIMOS };

  return {
    status: 'ok',
    meta: {
      id: meta.id,
      name: meta.name,
      cuota: Math.round(cuota),            // en pesos, que es como se compara
      cuotaPropia: Math.round(cuotaDe(meta)),
      currency: meta.currency || 'UYU',
    },
    meses,
    categorias,
  };
}

module.exports = { costoEnMetas };
