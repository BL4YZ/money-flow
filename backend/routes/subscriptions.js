const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// ─── Helpers ──────────────────────────────────────────────────────

// Normaliza un texto para comparar descripciones de transacciones
function normalize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Compara dos descripciones: true si una contiene a la otra (ignoring case/symbols)
function descMatch(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  return na.includes(nb) || nb.includes(na);
}

// Calcula la próxima fecha de cobro dado un billing_day y una referencia
function nextBillingDate(billingDay, referenceDate) {
  const now = referenceDate || new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), billingDay);
  if (d <= now) d.setMonth(d.getMonth() + 1);
  return d;
}

// ─── GET /api/subscriptions ───────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows: subs } = await db.query(
      'SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY amount DESC',
      [req.userId]
    );

    // Detectar alertas de precio: comparar monto registrado vs último cobro real
    // Solo para suscripciones activas con monto registrado
    const { rows: recentTx } = await db.query(
      `SELECT description, amount, date
       FROM transactions
       WHERE user_id = $1 AND type = 'debit' AND date >= NOW() - INTERVAL '2 months'
       ORDER BY date DESC`,
      [req.userId]
    );

    const subsWithAlerts = subs.map(sub => {
      if (!sub.is_active || !sub.amount) return sub;
      // Buscar transacciones que coincidan con este nombre de suscripción
      const matches = recentTx.filter(tx => descMatch(tx.description, sub.name));
      if (matches.length === 0) return sub;
      const lastCharge = matches[0];
      const lastAmount = Math.abs(parseFloat(lastCharge.amount));
      const registeredAmount = parseFloat(sub.amount);
      const priceIncrease = lastAmount > registeredAmount * 1.02; // 2% tolerancia
      return {
        ...sub,
        last_detected_amount: lastAmount,
        last_detected_date: lastCharge.date,
        price_alert: priceIncrease ? {
          old: registeredAmount,
          new: lastAmount,
          diff: Math.round(lastAmount - registeredAmount),
        } : null,
      };
    });

    const totalMonthly = subsWithAlerts
      .filter(s => s.is_active && s.frequency === 'monthly')
      .reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);

    res.json({ subscriptions: subsWithAlerts, totalMonthly });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener suscripciones' });
  }
});

// ─── GET /api/subscriptions/upcoming ─────────────────────────────
// Cobros en los próximos 30 días ordenados por fecha
router.get('/upcoming', async (req, res) => {
  try {
    const { rows: subs } = await db.query(
      `SELECT * FROM subscriptions WHERE user_id = $1 AND is_active = true`,
      [req.userId]
    );
    const { rows: bills } = await db.query(
      `SELECT * FROM bills WHERE user_id = $1 AND is_active = true`,
      [req.userId]
    );

    const now = new Date();
    const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const upcoming = [];

    // Suscripciones con billing_day
    for (const sub of subs) {
      if (!sub.billing_day) continue;
      const next = nextBillingDate(sub.billing_day, now);
      if (next <= horizon) {
        const daysUntil = Math.ceil((next - now) / (1000 * 60 * 60 * 24));
        upcoming.push({
          id: sub.id,
          type: 'subscription',
          name: sub.name,
          amount: parseFloat(sub.amount || 0),
          date: next.toISOString().split('T')[0],
          daysUntil,
        });
      }
    }

    // Facturas (bills) con due_day
    for (const bill of bills) {
      const next = nextBillingDate(bill.due_day, now);
      if (next <= horizon) {
        const daysUntil = Math.ceil((next - now) / (1000 * 60 * 60 * 24));
        upcoming.push({
          id: bill.id,
          type: 'bill',
          name: bill.name,
          amount: parseFloat(bill.amount || 0),
          date: next.toISOString().split('T')[0],
          daysUntil,
          category: bill.category,
        });
      }
    }

    upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
    res.json({ upcoming });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener próximos cobros' });
  }
});

// ─── GET /api/subscriptions/detect ───────────────────────────────
// Detecta posibles suscripciones en las transacciones del usuario
router.get('/detect', async (req, res) => {
  try {
    const { rows: subs } = await db.query(
      'SELECT name FROM subscriptions WHERE user_id = $1',
      [req.userId]
    );
    const existingNames = subs.map(s => normalize(s.name));

    // Buscar transacciones de débito de los últimos 3 meses
    const { rows: txs } = await db.query(
      `SELECT description, amount, date
       FROM transactions
       WHERE user_id = $1 AND type = 'debit' AND amount > 0 AND date >= NOW() - INTERVAL '4 months'
       ORDER BY date DESC`,
      [req.userId]
    );

    // Agrupar por descripción normalizada
    const groups = new Map();
    for (const tx of txs) {
      const key = normalize(tx.description);
      if (!key || key.length < 3) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(tx);
    }

    const candidates = [];
    for (const [key, charges] of groups) {
      if (charges.length < 2) continue; // necesita al menos 2 cobros

      // Verificar que los intervalos son roughly mensuales (20-45 días)
      const dates = charges.map(c => new Date(c.date)).sort((a, b) => a - b);
      const intervals = [];
      for (let i = 1; i < dates.length; i++) {
        intervals.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      if (avgInterval < 20 || avgInterval > 60) continue; // no es mensual

      // Verificar que el monto es consistente (variación < 15%)
      const amounts = charges.map(c => Math.abs(parseFloat(c.amount)));
      const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const maxDeviation = Math.max(...amounts.map(a => Math.abs(a - avgAmount) / avgAmount));
      if (maxDeviation > 0.15) continue;

      // Verificar que no está ya registrada
      const alreadyExists = existingNames.some(en => {
        const n = normalize(charges[0].description);
        return n.includes(en) || en.includes(n);
      });
      if (alreadyExists) continue;

      candidates.push({
        description: charges[0].description,
        suggestedName: charges[0].description,
        amount: Math.round(avgAmount),
        frequency: 'monthly',
        lastCharge: dates[dates.length - 1].toISOString().split('T')[0],
        occurrences: charges.length,
      });
    }

    // Ordenar por monto descendente (las más caras primero)
    candidates.sort((a, b) => b.amount - a.amount);
    res.json({ candidates: candidates.slice(0, 10) });
  } catch (err) {
    console.error('detect error:', err.message);
    res.status(500).json({ error: 'Error al detectar suscripciones' });
  }
});

// ─── POST /api/subscriptions ──────────────────────────────────────
router.post('/', async (req, res) => {
  const { name, amount, currency, frequency, cancel_url, billing_day } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO subscriptions (user_id, name, amount, currency, frequency, cancel_url, billing_day)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.userId, name, amount, currency || 'UYU', frequency || 'monthly', cancel_url || null, billing_day || null]
    );
    res.status(201).json({ subscription: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear suscripción' });
  }
});

// ─── PATCH /api/subscriptions/:id ────────────────────────────────
router.patch('/:id', async (req, res) => {
  const { is_active, amount, billing_day } = req.body;
  const fields = [], values = [];
  let i = 1;
  if (is_active  !== undefined) { fields.push(`is_active = $${i++}`);  values.push(is_active); }
  if (amount     !== undefined) { fields.push(`amount = $${i++}`);     values.push(amount); }
  if (billing_day !== undefined){ fields.push(`billing_day = $${i++}`); values.push(billing_day); }
  if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar' });
  values.push(req.params.id, req.userId);
  try {
    const { rows } = await db.query(
      `UPDATE subscriptions SET ${fields.join(', ')} WHERE id = $${i} AND user_id = $${i+1} RETURNING *`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: 'No encontrada' });
    res.json({ subscription: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar suscripción' });
  }
});

// ─── DELETE /api/subscriptions/:id ───────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM subscriptions WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar suscripción' });
  }
});

module.exports = router;
