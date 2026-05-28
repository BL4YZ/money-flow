const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const requirePremium = require('../middleware/requirePremium');
const axios = require('axios');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const router = express.Router();
router.use(authMiddleware);

// GET /api/bills
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM bills WHERE user_id = $1 AND is_active = true ORDER BY due_day ASC',
      [req.userId]
    );
    res.json({ bills: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener recordatorios', detail: err.message });
  }
});

// POST /api/bills  [premium only]
router.post(
  '/',
  requirePremium,
  [
    body('name').trim().notEmpty(),
    body('due_day').isInt({ min: 1, max: 31 }),
    body('reminder_days').optional().isInt({ min: 1, max: 30 }),
    body('amount').optional().isFloat({ min: 0 }),
    body('category').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, amount, due_day, category, reminder_days } = req.body;
    try {
      const result = await db.query(
        `INSERT INTO bills (user_id, name, amount, due_day, category, reminder_days)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.userId, name, amount || null, due_day, category || 'Servicios', reminder_days || 3]
      );
      res.status(201).json({ bill: result.rows[0] });
    } catch (err) {
      res.status(500).json({ error: 'Error al crear recordatorio', detail: err.message });
    }
  }
);

// PATCH /api/bills/:id
router.patch('/:id', async (req, res) => {
  const { name, amount, due_day, category, reminder_days, is_active } = req.body;
  const fields = [];
  const params = [];
  let i = 1;

  if (name          !== undefined) { fields.push(`name = $${i++}`);          params.push(name); }
  if (amount        !== undefined) { fields.push(`amount = $${i++}`);        params.push(amount); }
  if (due_day       !== undefined) { fields.push(`due_day = $${i++}`);       params.push(due_day); }
  if (category      !== undefined) { fields.push(`category = $${i++}`);      params.push(category); }
  if (reminder_days !== undefined) { fields.push(`reminder_days = $${i++}`); params.push(reminder_days); }
  if (is_active     !== undefined) { fields.push(`is_active = $${i++}`);     params.push(is_active); }

  if (fields.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

  params.push(req.params.id, req.userId);
  try {
    const result = await db.query(
      `UPDATE bills SET ${fields.join(', ')} WHERE id = $${i} AND user_id = $${i + 1} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json({ bill: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar', detail: err.message });
  }
});

// POST /api/bills/test-notify  [premium only]
router.post('/test-notify', requirePremium, async (req, res) => {
  try {
    const { rows: bills } = await db.query(`
      SELECT b.*, u.push_token
      FROM bills b
      JOIN users u ON u.id = b.user_id
      WHERE b.is_active = true AND b.user_id = $1 AND u.push_token IS NOT NULL
    `, [req.userId]);

    if (bills.length === 0) {
      return res.json({ sent: 0, reason: 'No active bills or push token not registered' });
    }

    const messages = bills
      .filter(b => typeof b.push_token === 'string' && b.push_token.startsWith('ExponentPushToken['))
      .map(b => {
        const amountStr = b.amount
          ? ` — $${parseFloat(b.amount).toLocaleString('es-UY', { maximumFractionDigits: 0 })}`
          : '';
        return {
          to:    b.push_token,
          sound: 'default',
          title: `Recordatorio: ${b.name}`,
          body:  `Vence el día ${b.due_day}${amountStr}`,
          data:  { billId: b.id },
        };
      });

    if (messages.length === 0) {
      return res.json({ sent: 0, reason: 'push_token format invalid' });
    }

    const { data } = await axios.post(EXPO_PUSH_URL, messages, {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });

    res.json({ sent: messages.length, expo: data?.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/bills/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query(
      'DELETE FROM bills WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar', detail: err.message });
  }
});

module.exports = router;
