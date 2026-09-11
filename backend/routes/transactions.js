const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { detectSubscriptions } = require('../services/subscriptionDetector');
// Un solo categorizador para toda la app. Aca vivia una segunda copia con
// nueve reglas y OTRO vocabulario de salida ('Comida', 'Ingreso'), asi que un
// mismo comercio caia en dos categorias distintas segun por donde entraba.
const { categorize } = require('../services/categorizer');
const { getUsdToUyuRateOn } = require('../services/exchangeRate');

const router = express.Router();
router.use(authMiddleware);

// ─── GET /api/transactions ────────────────────────────────────
// Query params: month (YYYY-MM), category, currency (UYU|USD), limit, offset
//
// `currency` NO es un detalle de presentación: en Uruguay una persona tiene
// cuenta en pesos y cuenta en dólares, y son cuentas DISTINTAS con resúmenes
// distintos. Verlas sumadas en un solo total en pesos no es lo que nadie tiene
// en la cabeza cuando abre el banco. Sin el parámetro se devuelve todo junto,
// que sigue siendo útil para mirar el conjunto.
router.get('/', async (req, res) => {
  const { month, category, currency, limit = 50, offset = 0 } = req.query;

  let whereClause = 'WHERE user_id = $1';
  const params = [req.userId];
  let paramIndex = 2;

  if (month) {
    whereClause += ` AND to_char(date, 'YYYY-MM') = $${paramIndex}`;
    params.push(month);
    paramIndex++;
  }

  if (category) {
    whereClause += ` AND category = $${paramIndex}`;
    params.push(category);
    paramIndex++;
  }

  if (currency === 'UYU' || currency === 'USD') {
    whereClause += ` AND currency = $${paramIndex}`;
    params.push(currency);
    paramIndex++;
  }

  params.push(parseInt(limit), parseInt(offset));

  try {
    const result = await db.query(
      `SELECT * FROM transactions ${whereClause}
       ORDER BY date DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    const countResult = await db.query(
      `SELECT COUNT(*) FROM transactions ${whereClause}`,
      params.slice(0, -2)
    );

    res.json({
      transactions: result.rows,
      total: parseInt(countResult.rows[0].count),
    });
  } catch (err) {
    console.error('Get transactions error:', err.message);
    res.status(500).json({ error: 'Error al obtener transacciones', detail: err.message });
  }
});

// ─── GET /api/transactions/accounts ──────────────────────────
//
// Que cuentas tiene esta persona, de verdad. Sirve para NO mostrar un selector
// de moneda a quien solo opera en pesos: una pestaña vacia de dolares es ruido
// para la mayoria, y para quien tiene las dos es lo primero que busca.
//
// Va antes de /:id, si no Express lee "accounts" como un id.
router.get('/accounts', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT currency,
              COUNT(*)::int AS movimientos,
              MAX(date) AS ultimo,
              SUM(CASE WHEN type = 'debit'  THEN amount ELSE 0 END)::float AS gastado,
              SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END)::float AS ingresado
         FROM transactions
        WHERE user_id = $1
        GROUP BY currency
        ORDER BY COUNT(*) DESC`,
      [req.userId]
    );
    res.json({ accounts: rows });
  } catch (err) {
    console.error('GET /transactions/accounts error:', err.message);
    res.status(500).json({ error: 'Error al obtener las cuentas' });
  }
});

// ─── GET /api/transactions/summary ───────────────────────────
// Resumen por categoría para el dashboard
router.get('/summary', async (req, res) => {
  const { month, currency } = req.query;
  const targetMonth = month || new Date().toISOString().slice(0, 7);

  // Mirando UNA cuenta se suma en SU moneda: dentro de la cuenta en dólares
  // todo ya está en dólares y pasarlo a pesos sería inventar una conversión que
  // el usuario no pidió. Sin filtro se suma en pesos, que es la única forma de
  // poner las dos juntas en un mismo número.
  const unaCuenta = currency === 'UYU' || currency === 'USD';
  const monto = unaCuenta ? 'amount' : 'amount_uyu';
  const filtroMoneda = unaCuenta ? 'AND currency = $3' : '';
  const argsMes = unaCuenta ? [req.userId, targetMonth, currency] : [req.userId, targetMonth];

  try {
    const byCategory = await db.query(
      `SELECT
         category,
         SUM(CASE WHEN type = 'debit' THEN ${monto} ELSE 0 END) as total_spent,
         SUM(CASE WHEN type = 'credit' THEN ${monto} ELSE 0 END) as total_income,
         COUNT(*) as transaction_count
       FROM transactions
       WHERE user_id = $1 AND to_char(date, 'YYYY-MM') = $2 ${filtroMoneda}
       GROUP BY category
       ORDER BY (SUM(CASE WHEN type = 'debit' THEN ${monto} ELSE 0 END) + SUM(CASE WHEN type = 'credit' THEN ${monto} ELSE 0 END)) DESC`,
      argsMes
    );

    const totals = await db.query(
      `SELECT
         SUM(CASE WHEN type = 'debit' THEN ${monto} ELSE 0 END) as total_spent,
         SUM(CASE WHEN type = 'credit' THEN ${monto} ELSE 0 END) as total_income
       FROM transactions
       WHERE user_id = $1 AND to_char(date, 'YYYY-MM') = $2 ${filtroMoneda}`,
      argsMes
    );

    const monthly = await db.query(
      `SELECT
         to_char(date, 'YYYY-MM') as month,
         SUM(CASE WHEN type = 'debit' THEN ${monto} ELSE 0 END) as spent
       FROM transactions
       WHERE user_id = $1 AND date >= NOW() - INTERVAL '6 months'
         ${unaCuenta ? 'AND currency = $2' : ''}
       GROUP BY to_char(date, 'YYYY-MM')
       ORDER BY to_char(date, 'YYYY-MM') ASC`,
      unaCuenta ? [req.userId, currency] : [req.userId]
    );

    res.json({
      month: targetMonth,
      // En que moneda estan los numeros de esta respuesta. Sin esto la app
      // tendria que acordarse sola de que pregunto, y un total en dolares
      // dibujado con el signo del peso es exactamente el error que hay que evitar.
      currency: unaCuenta ? currency : 'UYU',
      convertido: !unaCuenta,
      byCategory: byCategory.rows,
      totals: totals.rows[0],
      monthlyTrend: monthly.rows,
    });
  } catch (err) {
    console.error('Summary error:', err.message);
    res.status(500).json({ error: 'Error al calcular resumen', detail: err.message });
  }
});

// ─── POST /api/transactions ───────────────────────────────────
router.post(
  '/',
  [
    body('date').isISO8601(),
    body('description').trim().notEmpty(),
    body('amount').isFloat({ min: 0.01 }),
    body('type').isIn(['debit', 'credit']),
    body('category').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { date, description, amount, type, category, subcategory, currency } = req.body;

    try {
      const finalCategory = category || categorize(description);

      // Un movimiento cargado a mano tambien puede ser en dolares: mucha gente
      // tiene cuenta en pesos y cuenta en dolares. La cotizacion se congela en
      // la FECHA del movimiento, no en la de hoy — ver services/exchangeRate.js.
      const moneda = currency === 'USD' ? 'USD' : 'UYU';
      const cotizacion = moneda === 'USD' ? await getUsdToUyuRateOn(date) : 1;
      const result = await db.query(
        `INSERT INTO transactions (user_id, date, description, amount, type, category, subcategory, source, currency, rate_uyu)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', $8, $9)
         RETURNING *`,
        [req.userId, date, description, amount, type, finalCategory, subcategory, moneda, cotizacion]
      );

      // Auto-detectar suscripción si es un débito que coincide con un servicio conocido
      if (type === 'debit') {
        const detected = detectSubscriptions([{ description, amount, date, type }]);
        for (const sub of detected) {
          await db.query(
            `INSERT INTO subscriptions (user_id, name, amount, cancel_url, last_charged, auto_detected)
             VALUES ($1, $2, $3, $4, $5, true)
             ON CONFLICT DO NOTHING`,
            [req.userId, sub.name, sub.amount, sub.cancelUrl, sub.lastCharged]
          ).catch(() => {});
        }
      }

      res.status(201).json({ transaction: result.rows[0] });
    } catch (err) {
      res.status(500).json({ error: 'Error al crear transacción' });
    }
  }
);

// ─── PATCH /api/transactions/:id ─────────────────────────────
router.patch('/:id', async (req, res) => {
  const { date, description, amount, type, category } = req.body;
  const fields = [];
  const params = [];
  let i = 1;

  if (date !== undefined)        { fields.push(`date = $${i++}`);        params.push(date); }
  if (description !== undefined) { fields.push(`description = $${i++}`); params.push(description); }
  if (amount !== undefined)      { fields.push(`amount = $${i++}`);      params.push(amount); }
  if (type !== undefined)        { fields.push(`type = $${i++}`);        params.push(type); }
  if (category !== undefined)    { fields.push(`category = $${i++}`);    params.push(category); }

  if (fields.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

  params.push(req.params.id, req.userId);
  try {
    const result = await db.query(
      `UPDATE transactions SET ${fields.join(', ')} WHERE id = $${i} AND user_id = $${i + 1} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'No encontrada' });
    res.json({ transaction: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

// ─── DELETE /api/transactions/:id ────────────────────────────
/**
 * DELETE /api/transactions/imported — borra lo que vino de un resumen.
 *
 * Existe por un caso concreto: el primer import de un CSV leyó la columna de
 * SALDO como si fuera el importe, y esas filas quedaron guardadas con montos
 * equivocados. Volver a subir el archivo ya las corrige —el INSERT hace
 * ON CONFLICT DO UPDATE contra external_id— pero eso sólo alcanza para las
 * filas que TIENEN external_id. Las de aquel import son anteriores a esa
 * columna, así que valen NULL y quedarían al lado de las nuevas.
 *
 * Nunca toca lo cargado a mano: filtra por source = 'ocr'. Y con `?rotas=1`
 * borra sólo las que no tienen external_id, que son exactamente las de un
 * import viejo — un import nuevo y correcto sobrevive.
 */
router.delete('/imported', async (req, res) => {
  const soloRotas = req.query.rotas === '1' || req.query.rotas === 'true';
  try {
    const r = await db.query(
      `DELETE FROM transactions
        WHERE user_id = $1 AND source = 'ocr'
          ${soloRotas ? 'AND external_id IS NULL' : ''}`,
      [req.userId],
    );
    // Cantidades, nunca contenido.
    console.log(`[transactions] import borrado: ${r.rowCount} filas`);
    res.json({ ok: true, borradas: r.rowCount });
  } catch (err) {
    console.error('[transactions] borrado de import falló:', err.message);
    res.status(500).json({ error: 'No se pudo borrar' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM transactions WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Transacción no encontrada' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar transacción' });
  }
});


module.exports = router;
