const db = require('../db');

/**
 * Middleware that blocks access for free-plan users.
 * Must be used AFTER authMiddleware (needs req.userId).
 */
async function requirePremium(req, res, next) {
  try {
    const { rows } = await db.query(
      'SELECT plan, plan_expires_at FROM users WHERE id = $1',
      [req.userId]
    );
    const user = rows[0];
    const isPremium =
      user?.plan === 'premium' &&
      (!user.plan_expires_at || new Date(user.plan_expires_at) > new Date());

    if (isPremium) return next();

    return res.status(403).json({ error: 'premium_required' });
  } catch (err) {
    console.error('requirePremium error:', err.message);
    return res.status(500).json({ error: 'Error verificando plan' });
  }
}

module.exports = requirePremium;
