const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { detectSubscriptions } = require('../services/subscriptionDetector');

const router = express.Router();
router.use(authMiddleware);

// ─── GET /api/transactions ────────────────────────────────────
// Query params: month (YYYY-MM), category, limit, offset
router.get('/', async (req, res) => {
  const { month, category, limit = 50, offset = 0 } = req.query;

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

// ─── GET /api/transactions/summary ───────────────────────────
// Resumen por categoría para el dashboard
router.get('/summary', async (req, res) => {
  const { month } = req.query;
  const targetMonth = month || new Date().toISOString().slice(0, 7);

  try {
    const byCategory = await db.query(
      `SELECT
         category,
         SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END) as total_spent,
         SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END) as total_income,
         COUNT(*) as transaction_count
       FROM transactions
       WHERE user_id = $1 AND to_char(date, 'YYYY-MM') = $2
       GROUP BY category
       ORDER BY (SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END) + SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END)) DESC`,
      [req.userId, targetMonth]
    );

    const totals = await db.query(
      `SELECT
         SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END) as total_spent,
         SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END) as total_income
       FROM transactions
       WHERE user_id = $1 AND to_char(date, 'YYYY-MM') = $2`,
      [req.userId, targetMonth]
    );

    const monthly = await db.query(
      `SELECT
         to_char(date, 'YYYY-MM') as month,
         SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END) as spent
       FROM transactions
       WHERE user_id = $1 AND date >= NOW() - INTERVAL '6 months'
       GROUP BY to_char(date, 'YYYY-MM')
       ORDER BY to_char(date, 'YYYY-MM') ASC`,
      [req.userId]
    );

    res.json({
      month: targetMonth,
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

    const { date, description, amount, type, category, subcategory } = req.body;

    try {
      const finalCategory = category || categorize(description);
      const result = await db.query(
        `INSERT INTO transactions (user_id, date, description, amount, type, category, subcategory, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual')
         RETURNING *`,
        [req.userId, date, description, amount, type, finalCategory, subcategory]
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

// ─── Categorización simple por palabras clave ─────────────────
function categorize(description) {
  const desc = description.toLowerCase();
  if (/netflix|spotify|disney|hbo|amazon prime|youtube premium/.test(desc)) return 'Streaming';
  if (/supermercado|disco|devoto|geant|tienda inglesa|walmart/.test(desc)) return 'Supermercado';
  if (/ute|antel|ancap|osse|saneamiento/.test(desc)) return 'Servicios';
  if (/uber|cabify|bolt|taxi|bus|cutcsa|omnibus/.test(desc)) return 'Transporte';
  if (/farmacia|medica|hospital|clinica|doctor/.test(desc)) return 'Salud';
  if (/restaurant|delivery|pedidosya|rappi|pizza|burger/.test(desc)) return 'Comida';
  if (/gym|gimnasio|sport|fitness/.test(desc)) return 'Deporte';
  if (/cine|teatro|entretenimiento|juego/.test(desc)) return 'Entretenimiento';
  if (/salario|sueldo|pago|deposito/.test(desc)) return 'Ingreso';
  return 'Otros';
}

module.exports = router;
