const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// ─── Helpers de cálculo ───────────────────────────────────────────

// Proyección: cuántos meses faltan al ritmo actual de depósitos
function calcProjection(deposits, currentAmount, targetAmount) {
  if (currentAmount >= targetAmount) return { status: 'completed' };
  if (deposits.length === 0) return { status: 'no_data' };

  const sorted = [...deposits].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const first = new Date(sorted[0].created_at);
  const last  = new Date(sorted[sorted.length - 1].created_at);
  const monthsActive = Math.max((last - first) / (1000 * 60 * 60 * 24 * 30.44), 0.1);

  const totalDeposited = deposits.reduce((s, d) => s + parseFloat(d.amount), 0);
  const avgPerMonth = totalDeposited / monthsActive;

  if (avgPerMonth <= 0) return { status: 'no_data' };

  const remaining = parseFloat(targetAmount) - parseFloat(currentAmount);
  const monthsLeft = remaining / avgPerMonth;
  const projectedDate = new Date();
  projectedDate.setDate(projectedDate.getDate() + Math.round(monthsLeft * 30.44));

  return {
    status: 'ok',
    avgPerMonth: Math.round(avgPerMonth),
    monthsLeft: Math.round(monthsLeft * 10) / 10,
    projectedDate: projectedDate.toISOString().split('T')[0],
  };
}

// Cuota mensual necesaria para llegar a la fecha objetivo
function calcMonthlyQuota(currentAmount, targetAmount, targetDate) {
  if (!targetDate) return null;
  const now = new Date();
  const deadline = new Date(targetDate);
  const monthsLeft = (deadline - now) / (1000 * 60 * 60 * 24 * 30.44);
  if (monthsLeft <= 0) return null;
  const remaining = parseFloat(targetAmount) - parseFloat(currentAmount);
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / monthsLeft);
}

// Streak de días consecutivos con al menos un depósito
function calcStreak(deposits) {
  if (deposits.length === 0) return 0;
  const days = new Set(
    deposits.map(d => new Date(d.created_at).toISOString().split('T')[0])
  );
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().split('T')[0];
    if (days.has(key)) streak++;
    else if (i > 0) break; // si hoy no tiene depósito, el streak puede seguir
  }
  return streak;
}

// Milestones alcanzados (25%, 50%, 75%, 100%)
function calcMilestones(currentAmount, targetAmount) {
  const pct = parseFloat(currentAmount) / parseFloat(targetAmount);
  return {
    p25: pct >= 0.25,
    p50: pct >= 0.50,
    p75: pct >= 0.75,
    p100: pct >= 1.00,
  };
}

// ─── CRUD de metas ─────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const { rows: goals } = await db.query(
      'SELECT * FROM goals WHERE user_id = $1 ORDER BY created_at DESC',
      [req.userId]
    );

    // Adjuntar insights a cada meta para que la UI los muestre sin un segundo request
    const { rows: spending } = await db.query(
      `SELECT
         AVG(monthly_total) AS avg_monthly,
         MAX(CASE WHEN month = DATE_TRUNC('month', NOW()) THEN monthly_total END) AS current_month
       FROM (
         SELECT DATE_TRUNC('month', date) AS month, SUM(ABS(amount)) AS monthly_total
         FROM transactions
         WHERE user_id = $1 AND type = 'debit' AND date >= NOW() - INTERVAL '6 months'
         GROUP BY 1
       ) t`,
      [req.userId]
    );
    const avgMonthly   = parseFloat(spending[0]?.avg_monthly   || 0);
    const currentMonth = parseFloat(spending[0]?.current_month || 0);
    const savingsSurplus = avgMonthly > 0 && currentMonth < avgMonthly
      ? Math.round(avgMonthly - currentMonth) : 0;

    const goalsWithInsights = await Promise.all(goals.map(async (goal) => {
      const { rows: deposits } = await db.query(
        'SELECT amount, created_at FROM goal_deposits WHERE goal_id = $1 ORDER BY created_at ASC',
        [goal.id]
      );
      return {
        ...goal,
        insights: {
          projection:   calcProjection(deposits, goal.current_amount, goal.target_amount),
          monthlyQuota: calcMonthlyQuota(goal.current_amount, goal.target_amount, goal.target_date),
          streak:       calcStreak(deposits),
          milestones:   calcMilestones(goal.current_amount, goal.target_amount),
          savingsSurplus,
        },
      };
    }));

    res.json({ goals: goalsWithInsights });
  } catch (err) {
    console.error('GET /goals error:', err.message);
    res.status(500).json({ error: 'Error al obtener metas', detail: err.message });
  }
});

router.post('/', [
  body('name').trim().notEmpty(),
  body('target_amount').isFloat({ min: 1 }),
  body('target_date').optional().isISO8601(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, description, target_amount, current_amount, target_date } = req.body;
  try {
    const { rows: planRows } = await db.query('SELECT plan FROM users WHERE id = $1', [req.userId]);
    if (planRows[0]?.plan !== 'premium') {
      const { rows: existing } = await db.query('SELECT COUNT(*) FROM goals WHERE user_id = $1', [req.userId]);
      if (parseInt(existing[0].count) >= 1) {
        return res.status(403).json({ error: 'premium_required', feature: 'goals' });
      }
    }

    const result = await db.query(
      `INSERT INTO goals (user_id, name, description, target_amount, current_amount, target_date)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.userId, name, description, target_amount, current_amount || 0, target_date || null]
    );
    const goal = result.rows[0];
    res.status(201).json({
      goal: {
        ...goal,
        insights: {
          projection: { status: 'no_data' },
          monthlyQuota: calcMonthlyQuota(goal.current_amount, goal.target_amount, goal.target_date),
          streak: 0, milestones: calcMilestones(goal.current_amount, goal.target_amount), savingsSurplus: 0,
        },
      },
    });
  } catch (err) {
    console.error('POST /goals error:', err.message);
    res.status(500).json({ error: 'Error al crear meta', detail: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  const { current_amount, name, target_amount, target_date, is_completed } = req.body;
  const fields = [];
  const values = [];
  let i = 1;

  if (current_amount !== undefined) { fields.push(`current_amount = $${i++}`); values.push(current_amount); }
  if (name !== undefined)           { fields.push(`name = $${i++}`);           values.push(name); }
  if (target_amount !== undefined)  { fields.push(`target_amount = $${i++}`);  values.push(target_amount); }
  if (target_date !== undefined)    { fields.push(`target_date = $${i++}`);    values.push(target_date); }
  if (is_completed !== undefined)   { fields.push(`is_completed = $${i++}`);   values.push(is_completed); }

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

router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM goals WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar meta' });
  }
});

// ─── Depósitos ─────────────────────────────────────────────────────

// POST /api/goals/:id/deposits — agregar depósito (registra historial + actualiza current_amount)
router.post('/:id/deposits', [
  body('amount').isFloat({ min: 0.01 }),
  body('note').optional().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { amount, note } = req.body;
  try {
    // Verificar que la meta pertenece al usuario
    const { rows: goalRows } = await db.query(
      'SELECT * FROM goals WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (!goalRows[0]) return res.status(404).json({ error: 'Meta no encontrada' });
    const goal = goalRows[0];

    // Registrar el depósito en el historial
    await db.query(
      'INSERT INTO goal_deposits (goal_id, user_id, amount, note) VALUES ($1, $2, $3, $4)',
      [goal.id, req.userId, amount, note || null]
    );

    // Crear transacción de egreso para que descuente del ingreso disponible y del dashboard
    await db.query(
      `INSERT INTO transactions (user_id, date, description, amount, type, category, source, goal_id)
       VALUES ($1, CURRENT_DATE, $2, $3, 'debit', 'Ahorro', 'manual', $4)`,
      [req.userId, `Ahorro: ${goal.name}`, parseFloat(amount), goal.id]
    );

    // Actualizar current_amount en la meta
    const newAmount = parseFloat(goal.current_amount) + parseFloat(amount);
    const isCompleted = newAmount >= parseFloat(goal.target_amount);
    const { rows } = await db.query(
      `UPDATE goals SET current_amount = $1, is_completed = $2 WHERE id = $3 RETURNING *`,
      [newAmount, isCompleted, goal.id]
    );

    res.json({ goal: rows[0], deposited: parseFloat(amount), completed: isCompleted });
  } catch (err) {
    console.error('POST /goals/:id/deposits error:', err.message);
    res.status(500).json({ error: 'Error al registrar depósito' });
  }
});

// GET /api/goals/:id/deposits — historial de depósitos
router.get('/:id/deposits', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM goal_deposits
       WHERE goal_id = $1 AND user_id = $2
       ORDER BY created_at DESC LIMIT 50`,
      [req.params.id, req.userId]
    );
    res.json({ deposits: rows });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener depósitos' });
  }
});

// ─── Insights inteligentes ─────────────────────────────────────────

// GET /api/goals/:id/insights — proyección, cuota, streak, milestones, sugerencia de ahorro
router.get('/:id/insights', async (req, res) => {
  try {
    const { rows: goalRows } = await db.query(
      'SELECT * FROM goals WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (!goalRows[0]) return res.status(404).json({ error: 'Meta no encontrada' });
    const goal = goalRows[0];

    // Historial de depósitos
    const { rows: deposits } = await db.query(
      'SELECT amount, created_at FROM goal_deposits WHERE goal_id = $1 ORDER BY created_at ASC',
      [goal.id]
    );

    // Gasto promedio mensual vs mes actual (para sugerencia de ahorro)
    const { rows: spendingRows } = await db.query(
      `SELECT
         AVG(monthly_total) AS avg_monthly,
         MAX(CASE WHEN month = DATE_TRUNC('month', NOW()) THEN monthly_total END) AS current_month
       FROM (
         SELECT DATE_TRUNC('month', date) AS month, SUM(ABS(amount)) AS monthly_total
         FROM transactions
         WHERE user_id = $1 AND type = 'debit'
           AND date >= NOW() - INTERVAL '6 months'
         GROUP BY 1
       ) t`,
      [req.userId]
    );

    const avgMonthly  = parseFloat(spendingRows[0]?.avg_monthly || 0);
    const currentMonth = parseFloat(spendingRows[0]?.current_month || 0);
    const savingsSurplus = avgMonthly > 0 && currentMonth < avgMonthly
      ? Math.round(avgMonthly - currentMonth)
      : 0;

    res.json({
      projection:    calcProjection(deposits, goal.current_amount, goal.target_amount),
      monthlyQuota:  calcMonthlyQuota(goal.current_amount, goal.target_amount, goal.target_date),
      streak:        calcStreak(deposits),
      milestones:    calcMilestones(goal.current_amount, goal.target_amount),
      savingsSurplus,                // cuánto está gastando menos que el promedio este mes
      totalDeposits: deposits.length,
    });
  } catch (err) {
    console.error('GET /goals/:id/insights error:', err.message);
    res.status(500).json({ error: 'Error al calcular insights' });
  }
});

// ─── Vincular transacción a meta ───────────────────────────────────

// POST /api/goals/link-transaction — linkea una transacción y acredita su monto a la meta
router.post('/link-transaction', [
  body('transaction_id').notEmpty(),
  body('goal_id').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { transaction_id, goal_id } = req.body;
  try {
    // Verificar ownership de ambos
    const { rows: txRows } = await db.query(
      'SELECT * FROM transactions WHERE id = $1 AND user_id = $2',
      [transaction_id, req.userId]
    );
    if (!txRows[0]) return res.status(404).json({ error: 'Transacción no encontrada' });

    const { rows: goalRows } = await db.query(
      'SELECT * FROM goals WHERE id = $1 AND user_id = $2',
      [goal_id, req.userId]
    );
    if (!goalRows[0]) return res.status(404).json({ error: 'Meta no encontrada' });

    const tx   = txRows[0];
    const goal = goalRows[0];
    const amount = Math.abs(parseFloat(tx.amount));

    // Linkear la transacción
    await db.query('UPDATE transactions SET goal_id = $1 WHERE id = $2', [goal_id, transaction_id]);

    // Registrar depósito en el historial
    await db.query(
      'INSERT INTO goal_deposits (goal_id, user_id, amount, note) VALUES ($1, $2, $3, $4)',
      [goal.id, req.userId, amount, tx.description]
    );

    // Actualizar current_amount
    const newAmount = parseFloat(goal.current_amount) + amount;
    const isCompleted = newAmount >= parseFloat(goal.target_amount);
    const { rows } = await db.query(
      'UPDATE goals SET current_amount = $1, is_completed = $2 WHERE id = $3 RETURNING *',
      [newAmount, isCompleted, goal.id]
    );

    res.json({ goal: rows[0], credited: amount, completed: isCompleted });
  } catch (err) {
    console.error('POST /goals/link-transaction error:', err.message);
    res.status(500).json({ error: 'Error al vincular transacción' });
  }
});

module.exports = router;
