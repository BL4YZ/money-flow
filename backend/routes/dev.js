/**
 * DEV-ONLY routes — never exposed in production.
 * Registered in server.js only when NODE_ENV !== 'production'.
 */
const express = require('express');
const db      = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// POST /api/dev/simulate-premium
// Sets the current user to premium for 30 days (simulates a successful purchase).
router.post('/simulate-premium', async (req, res) => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await db.query(
    `UPDATE users SET plan = 'premium', plan_expires_at = $1 WHERE id = $2`,
    [expiresAt.toISOString(), req.userId]
  );

  res.json({ ok: true, plan: 'premium', plan_expires_at: expiresAt.toISOString() });
});

// POST /api/dev/simulate-free
// Reverts user to free plan (simulates expiry / cancellation).
router.post('/simulate-free', async (req, res) => {
  await db.query(
    `UPDATE users SET plan = 'free', plan_expires_at = NULL WHERE id = $1`,
    [req.userId]
  );
  res.json({ ok: true, plan: 'free' });
});

module.exports = router;
