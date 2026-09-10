const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { calcFeasibility, calcMonthlyQuota } = require('../services/goalFeasibility');

const router = express.Router();
router.use(authMiddleware);

// ─── Helpers de cálculo ───────────────────────────────────────────

// Proyección: cuántos meses faltan al ritmo actual de depósitos
function calcProjection(deposits, currentAmount, targetAmount) {
  if (currentAmount >= targetAmount) return { status: 'completed' };
  if (deposits.length === 0) return { status: 'no_data' };

  const sorted = [...deposits].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const first = new Date(sorted[0].created_at);
  const now   = new Date();

  // Tiempo desde el primer depósito hasta hoy (mínimo 1 mes completo).
  // Usar "first → now" evita dividir por 0 cuando todos los depósitos son del mismo día.
  // El mínimo de 1 mes da una estimación conservadora (no infla el ritmo).
  const monthsActive = Math.max((now - first) / (1000 * 60 * 60 * 24 * 30.44), 1);

  const totalDeposited = deposits.reduce((s, d) => s + parseFloat(d.amount), 0);
  const avgPerMonth = totalDeposited / monthsActive;

  if (avgPerMonth <= 0) return { status: 'no_data' };

  const remaining = parseFloat(targetAmount) - parseFloat(currentAmount);
  const monthsLeft = remaining / avgPerMonth;

  // Si con el ritmo actual falta menos de 1 mes pero aún queda dinero, mostrar 1 mes
  // para evitar proyecciones absurdas cuando hay pocos depósitos recientes.
  const monthsLeftSafe = Math.max(monthsLeft, remaining > 0 ? 0.5 : 0);

  const projectedDate = new Date();
  projectedDate.setDate(projectedDate.getDate() + Math.round(monthsLeftSafe * 30.44));

  return {
    status: 'ok',
    avgPerMonth: Math.round(avgPerMonth),
    monthsLeft: Math.round(monthsLeftSafe * 10) / 10,
    projectedDate: projectedDate.toISOString().split('T')[0],
  };
}

// calcMonthlyQuota vive en services/goalFeasibility.js: la tarjeta de la meta y
// el calculo de viabilidad tienen que dar exactamente el mismo numero.

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

// Cuánto está gastando de MENOS este mes, comparado a día equivalente.
//
// La versión anterior comparaba el mes en curso — 10 días — contra el promedio
// de meses de 30, así que el número no medía ahorro sino qué día era hoy: un
// usuario que gasta exactamente lo mismo todos los meses veía "ahorrás $23.714"
// el día 1, $16.000 el día 10 y $0 el día 30. Cero recién el último día, que es
// justo cuando ya no sirve de nada.
//
// Tres correcciones, y las tres cambian el número:
//   1. Se compara a DÍA EQUIVALENTE: los primeros N días de cada mes contra los
//      primeros N de este, con N = el día de hoy. Es lo que hace el gráfico de
//      "spending vs last month" de Monzo, y es la única forma de que el
//      resultado no dependa de la fecha.
//   2. El mes en curso NO entra en el promedio. Antes sí, así que el mes parcial
//      se comparaba contra un promedio que él mismo había bajado.
//   3. La ventana arranca en un límite de mes (DATE_TRUNC), no en
//      NOW() - 6 months, que caía a mitad de marzo y metía otro mes truncado.
//   4. Un DEPOSITO A UNA META no es gasto. Cada deposito escribe ademas una
//      fila en transactions como 'debit' (ver POST /:id/deposits), asi que
//      contarlo hacia que ahorrar te baje el ahorro detectado.
//
// Devuelve null — no 0 — cuando no hay con qué comparar: sin movimientos
// cargados este mes el cálculo viejo daba el promedio entero ("ahorrás $26.000"
// sobre datos que no existen), y acá los datos entran por subida manual de CSV,
// así que ese es el caso NORMAL, no el raro. Misma regla que el anillo del 72%:
// antes que un número inventado, nada.
async function calcSavingsSurplus(userId) {
  const MESES_MINIMOS = 2; // con un solo mes previo la comparación es ruido

  const { rows } = await db.query(
    `WITH hoy AS (
       SELECT EXTRACT(DAY FROM NOW())::int AS dia,
              DATE_TRUNC('month', NOW())   AS mes_actual
     ),
     previos AS (
       SELECT DATE_TRUNC('month', t.date) AS mes, SUM(ABS(t.amount)) AS total
       FROM transactions t, hoy
       WHERE t.user_id = $1 AND t.type = 'debit' AND t.goal_id IS NULL
         AND t.date >= hoy.mes_actual - INTERVAL '6 months'
         AND t.date <  hoy.mes_actual
         AND EXTRACT(DAY FROM t.date) <= hoy.dia
       GROUP BY 1
     ),
     actual AS (
       SELECT COALESCE(SUM(ABS(t.amount)), 0) AS total, COUNT(*) AS movs
       FROM transactions t, hoy
       WHERE t.user_id = $1 AND t.type = 'debit' AND t.goal_id IS NULL
         AND t.date >= hoy.mes_actual
     )
     SELECT (SELECT AVG(total) FROM previos)  AS avg_parcial,
            (SELECT COUNT(*)   FROM previos)  AS meses_previos,
            actual.total AS actual_total,
            actual.movs  AS actual_movs,
            (SELECT dia FROM hoy) AS dia
     FROM actual`,
    [userId]
  );

  const r = rows[0] || {};
  const mesesPrevios = parseInt(r.meses_previos || 0, 10);
  const movsActual   = parseInt(r.actual_movs   || 0, 10);
  const avgParcial   = parseFloat(r.avg_parcial || 0);
  const actual       = parseFloat(r.actual_total || 0);

  // Sin historial suficiente, o sin nada cargado este mes: no hay comparación.
  if (mesesPrevios < MESES_MINIMOS || movsActual === 0 || avgParcial <= 0) return null;
  if (actual >= avgParcial) return null;

  return {
    amount: Math.round(avgParcial - actual),
    dia: parseInt(r.dia, 10),          // hasta qué día del mes llega la comparación
    mesesComparados: mesesPrevios,
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
    const savingsSurplus = await calcSavingsSurplus(req.userId);

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

    // Un solo calculo para todas las metas: comparten un unico margen mensual,
    // asi que la viabilidad no es una propiedad de cada meta por separado.
    const feasibility = await calcFeasibility(req.userId, goals);

    res.json({ goals: goalsWithInsights, feasibility });
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
          streak: 0, milestones: calcMilestones(goal.current_amount, goal.target_amount), savingsSurplus: null,
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

    const savingsSurplus = await calcSavingsSurplus(req.userId);

    res.json({
      projection:    calcProjection(deposits, goal.current_amount, goal.target_amount),
      monthlyQuota:  calcMonthlyQuota(goal.current_amount, goal.target_amount, goal.target_date),
      streak:        calcStreak(deposits),
      milestones:    calcMilestones(goal.current_amount, goal.target_amount),
      savingsSurplus,                // {amount, dia, mesesComparados} o null si no hay con que comparar
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
// Expuesto solo para scripts/verify-savings-surplus.js: el calculo depende de
// la fecha de hoy, asi que hay que poder correrlo contra datos sembrados.
module.exports.__testing = { calcSavingsSurplus };
