const express = require('express');
const crypto  = require('crypto');
const db      = require('../db');

const router = express.Router();

// ─── RevenueCat Webhook Secret ────────────────────────────────────────────
// Set this in your environment: REVENUECAT_WEBHOOK_SECRET=your_secret_here
// Get it from: RevenueCat dashboard → Project → Integrations → Webhooks
//
// SECURITY: this secret is mandatory. Without it, anyone could POST here
// and grant themselves (or anyone) premium for free — fail closed, never open.
const RC_SECRET = process.env.REVENUECAT_WEBHOOK_SECRET;
if (!RC_SECRET) {
  console.error(
    '[webhook] FATAL: REVENUECAT_WEBHOOK_SECRET no está configurado. ' +
    'El endpoint /api/webhooks/revenuecat rechazará todas las peticiones hasta que se configure.'
  );
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Events that grant premium access
const PREMIUM_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'TRIAL_STARTED',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
  'TRANSFER',
]);

// Events that revoke premium access
const REVOKE_EVENTS = new Set([
  'EXPIRATION',
  'CANCELLATION',
  'SUBSCRIBER_ALIAS',
]);

/**
 * POST /api/webhooks/revenuecat
 *
 * RevenueCat sends a POST with Authorization header containing the secret.
 * We verify it, then update the user's plan in our DB.
 */
router.post('/revenuecat', express.json(), async (req, res) => {
  // 1. Verify secret — fail closed if it's not configured server-side.
  if (!RC_SECRET) {
    console.error('[webhook] Rejected: REVENUECAT_WEBHOOK_SECRET no configurado');
    return res.status(503).json({ error: 'Webhook not configured' });
  }
  const authHeader = req.headers['authorization'];
  if (!authHeader || !timingSafeEqual(authHeader, RC_SECRET)) {
    console.warn('[webhook] Invalid RevenueCat secret');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const event = req.body?.event;
  if (!event) return res.status(400).json({ error: 'Missing event' });

  const {
    type,
    app_user_id: userId,
    expiration_at_ms: expiresMs,
  } = event;

  if (!userId) return res.status(400).json({ error: 'Missing app_user_id' });

  console.log(`[webhook] RevenueCat event: ${type} for user ${userId}`);

  try {
    if (PREMIUM_EVENTS.has(type)) {
      // Grant premium — set expiry from RevenueCat (null = lifetime / until cancelled)
      const expiresAt = expiresMs ? new Date(expiresMs).toISOString() : null;
      await db.query(
        `UPDATE users SET plan = 'premium', plan_expires_at = $1 WHERE id = $2`,
        [expiresAt, userId]
      );
      console.log(`[webhook] Granted premium to ${userId}, expires: ${expiresAt ?? 'never'}`);

    } else if (REVOKE_EVENTS.has(type)) {
      // Revoke premium
      await db.query(
        `UPDATE users SET plan = 'free', plan_expires_at = NULL WHERE id = $1`,
        [userId]
      );
      console.log(`[webhook] Revoked premium for ${userId}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[webhook] DB error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

module.exports = router;
