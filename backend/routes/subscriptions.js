const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// ─── GET /api/subscriptions ───────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY amount DESC',
      [req.userId]
    );
    const totalMonthly = result.rows
      .filter(s => s.is_active && s.frequency === 'monthly')
      .reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);

    res.json({ subscriptions: result.rows, totalMonthly });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener suscripciones' });
  }
});

// ─── POST /api/subscriptions ──────────────────────────────────
router.post('/', async (req, res) => {
  const { name, amount, currency, frequency, cancel_url } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO subscriptions (user_id, name, amount, currency, frequency, cancel_url)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.userId, name, amount, currency || 'UYU', frequency || 'monthly', cancel_url]
    );
    res.status(201).json({ subscription: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear suscripción' });
  }
});

// ─── PATCH /api/subscriptions/:id ────────────────────────────
router.patch('/:id', async (req, res) => {
  const { is_active } = req.body;
  try {
    const result = await db.query(
      'UPDATE subscriptions SET is_active = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [is_active, req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'No encontrada' });
    res.json({ subscription: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar suscripción' });
  }
});

// ─── DELETE /api/subscriptions/:id ───────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await db.query(
      'DELETE FROM subscriptions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar suscripción' });
  }
});

module.exports = router;
