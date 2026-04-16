const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/budgets
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM budgets WHERE user_id = $1 ORDER BY category',
      [req.userId]
    );
    res.json({ budgets: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener presupuestos', detail: err.message });
  }
});

// POST /api/budgets — upsert by category
router.post(
  '/',
  [
    body('category').trim().notEmpty(),
    body('amount').isFloat({ min: 1 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { category, amount } = req.body;
    try {
      const result = await db.query(
        `INSERT INTO budgets (user_id, category, amount)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, category)
         DO UPDATE SET amount = EXCLUDED.amount
         RETURNING *`,
        [req.userId, category, amount]
      );
      res.json({ budget: result.rows[0] });
    } catch (err) {
      res.status(500).json({ error: 'Error al guardar presupuesto', detail: err.message });
    }
  }
);

// DELETE /api/budgets/:category
router.delete('/:category', async (req, res) => {
  try {
    await db.query(
      'DELETE FROM budgets WHERE user_id = $1 AND category = $2',
      [req.userId, decodeURIComponent(req.params.category)]
    );
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar presupuesto', detail: err.message });
  }
});

module.exports = router;
