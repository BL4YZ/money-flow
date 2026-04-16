const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// ─── GET /api/goals ───────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM goals WHERE user_id = $1 ORDER BY created_at DESC',
      [req.userId]
    );
    res.json({ goals: result.rows });
  } catch (err) {
    console.error('GET /goals error:', err.message);
    res.status(500).json({ error: 'Error al obtener metas', detail: err.message });
  }
});

// ─── POST /api/goals ──────────────────────────────────────────
router.post(
  '/',
  [
    body('name').trim().notEmpty(),
    body('target_amount').isFloat({ min: 1 }),
    body('target_date').optional().isISO8601(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, description, target_amount, current_amount, target_date } = req.body;
    try {
      const result = await db.query(
        `INSERT INTO goals (user_id, name, description, target_amount, current_amount, target_date)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.userId, name, description, target_amount, current_amount || 0, target_date || null]
      );
      res.status(201).json({ goal: result.rows[0] });
    } catch (err) {
      console.error('POST /goals error:', err.message);
      res.status(500).json({ error: 'Error al crear meta', detail: err.message });
    }
  }
);

// ─── PATCH /api/goals/:id ─────────────────────────────────────
router.patch('/:id', async (req, res) => {
  const { current_amount, name, target_amount, target_date, is_completed } = req.body;

  const fields = [];
  const values = [];
  let i = 1;

  if (current_amount !== undefined) { fields.push(`current_amount = $${i++}`); values.push(current_amount); }
  if (name !== undefined) { fields.push(`name = $${i++}`); values.push(name); }
  if (target_amount !== undefined) { fields.push(`target_amount = $${i++}`); values.push(target_amount); }
  if (target_date !== undefined) { fields.push(`target_date = $${i++}`); values.push(target_date); }
  if (is_completed !== undefined) { fields.push(`is_completed = $${i++}`); values.push(is_completed); }

  if (fields.length === 0) return res.status(400).json({ error: 'Nada para actualizar' });

  values.push(req.params.id, req.userId);

  try {
    const result = await db.query(
      `UPDATE goals SET ${fields.join(', ')} WHERE id = $${i} AND user_id = $${i + 1} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Meta no encontrada' });
    res.json({ goal: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar meta' });
  }
});

// ─── DELETE /api/goals/:id ────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM goals WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar meta' });
  }
});

module.exports = router;
