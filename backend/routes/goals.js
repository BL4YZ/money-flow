const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { calcFeasibility, calcMonthlyQuota } = require('../services/goalFeasibility');
const { candidatosDeAhorro } = require('../services/savingsDetector');
const { costoEnMetas } = require('../services/goalCost');
const { recalcularSaldo } = require('../services/goalBalance');
const { getUsdToUyuRateOn } = require('../services/exchangeRate');

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
       SELECT DATE_TRUNC('month', t.date) AS mes, SUM(ABS(t.amount_uyu)) AS total
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

    // "Restaurantes: $4.200/mes — 1,3 meses de tu Notebook". Se le pasa
    // calcMonthlyQuota para que la tarjeta de la meta y esta conversion no
    // puedan discrepar sobre cuanto es la cuota.
    const costos = await costoEnMetas(db, req.userId, goals,
      (g) => calcMonthlyQuota(g.current_amount, g.target_amount, g.target_date));

    res.json({ goals: goalsWithInsights, feasibility, costos });
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

  // La MONEDA de la meta se elige al crearla y no se cambia despues: los
  // depositos se guardan en la moneda de la meta, asi que cambiarla dejaria un
  // historial que dice una cosa y un objetivo que dice otra. En Uruguay una meta
  // para una casa o un auto casi siempre esta en dolares.
  const { name, description, target_amount, current_amount, target_date } = req.body;
  const moneda = req.body.currency === 'USD' ? 'USD' : 'UYU';
  try {
    const { rows: planRows } = await db.query('SELECT plan FROM users WHERE id = $1', [req.userId]);
    if (planRows[0]?.plan !== 'premium') {
      const { rows: existing } = await db.query('SELECT COUNT(*) FROM goals WHERE user_id = $1', [req.userId]);
      if (parseInt(existing[0].count) >= 1) {
        return res.status(403).json({ error: 'premium_required', feature: 'goals' });
      }
    }

    const result = await db.query(
      `INSERT INTO goals (user_id, name, description, target_amount, current_amount, target_date, currency)
       VALUES ($1, $2, $3, $4, 0, $5, $6) RETURNING *`,
      [req.userId, name, description, target_amount, target_date || null, moneda]
    );
    let goal = result.rows[0];

    // Un saldo inicial tambien es un deposito: si entrara directo en la columna,
    // el historial no lo explicaria y la proyeccion diria "hace tu primer
    // deposito" sobre una meta que ya tiene plata.
    if (parseFloat(current_amount) > 0) {
      await db.query(
        'INSERT INTO goal_deposits (goal_id, user_id, amount, note) VALUES ($1, $2, $3, $4)',
        [goal.id, req.userId, current_amount, 'Saldo inicial']
      );
      goal = await recalcularSaldo(db, goal.id);
    }
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

// GET /api/goals/candidates — movimientos del banco que podrian ser un ahorro.
//
// Va ANTES de las rutas /:id: si quedara despues, Express leeria "candidates"
// como un id de meta. Misma razon por la que DELETE /transactions/imported esta
// antes de /:id.
//
// NO acredita nada: devuelve una lista para que el usuario confirme, con el
// motivo por el que cada uno aparece. Ver services/savingsDetector.js — desde
// el resumen no se puede saber si una transferencia fue a tu propia caja de
// ahorro, asi que la app pregunta en vez de decidir.
router.get('/candidates', async (req, res) => {
  try {
    // Sin metas activas no hay nada que acreditar, y la lista seria ruido.
    const { rows } = await db.query(
      'SELECT COUNT(*) FROM goals WHERE user_id = $1 AND is_completed = false',
      [req.userId]
    );
    if (parseInt(rows[0].count, 10) === 0) return res.json({ candidates: [] });

    const limite = Math.min(parseInt(req.query.limit, 10) || 8, 25);
    res.json({ candidates: await candidatosDeAhorro(db, req.userId, limite) });
  } catch (err) {
    console.error('GET /goals/candidates error:', err.message);
    res.status(500).json({ error: 'Error al buscar movimientos' });
  }
});

router.patch('/:id', async (req, res) => {
  // current_amount NO se acepta: el saldo sale de goal_deposits. Aceptarlo era
  // la via mas facil para que el saldo y el historial contaran cosas distintas,
  // y ningun cliente lo usaba. Para mover plata estan los depositos.
  const { name, target_amount, target_date, is_completed } = req.body;
  const fields = [];
  const values = [];
  let i = 1;

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

    // El saldo se DERIVA del historial. Sumarlo a mano acá es lo que dejaba
    // current_amount y goal_deposits contando cosas distintas.
    const actualizada = await recalcularSaldo(db, goal.id);

    res.json({ goal: actualizada, deposited: parseFloat(amount), completed: actualizada.is_completed });
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

// ─── Vincular un movimiento real del banco a una meta ──────────────
//
// Es la diferencia entre una meta y una planilla: "Ahorrar" a mano es escribir
// un número y no prueba que la plata se haya movido. Esto acredita un
// movimiento que el banco ya registró.
//
// Tres cosas que faltaban y que acá cuestan plata mal contada:
//
//  1. NO SE CHEQUEABA SI YA ESTABA VINCULADO. Vincular dos veces el mismo
//     movimiento sumaba el monto dos veces y la meta quedaba inflada, sin
//     forma de volver atrás desde la app.
//  2. ACEPTABA UN INGRESO. Una transferencia al ahorro sale de la cuenta: es
//     un 'debit'. Acreditar un 'credit' es meter el sueldo adentro de la meta.
//  3. LOS TRES WRITES NO ERAN ATÓMICOS. Si fallaba el segundo, la transacción
//     quedaba vinculada a una meta cuyo saldo nunca subió.
router.post('/link-transaction', [
  body('transaction_id').notEmpty(),
  body('goal_id').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { transaction_id, goal_id } = req.body;
  let client;
  try {
    // Ownership de los dos lados. No alcanza con el id: sin esto, cualquiera
    // con un id ajeno acredita contra la meta de otro (ver "Authorization
    // model" en CLAUDE.md — el WHERE user_id es el único límite real).
    const { rows: txRows } = await db.query(
      'SELECT * FROM transactions WHERE id = $1 AND user_id = $2',
      [transaction_id, req.userId]
    );
    if (!txRows[0]) return res.status(404).json({ error: 'Movimiento no encontrado' });

    const { rows: goalRows } = await db.query(
      'SELECT * FROM goals WHERE id = $1 AND user_id = $2',
      [goal_id, req.userId]
    );
    if (!goalRows[0]) return res.status(404).json({ error: 'Meta no encontrada' });

    const tx   = txRows[0];
    const goal = goalRows[0];

    if (tx.goal_id) {
      return res.status(409).json({
        error: tx.goal_id === goal_id
          ? 'Ese movimiento ya está acreditado en esta meta'
          : 'Ese movimiento ya está acreditado en otra meta',
        goal_id: tx.goal_id,
      });
    }
    if (tx.type !== 'debit') {
      return res.status(400).json({ error: 'Solo se pueden acreditar egresos: un ahorro sale de la cuenta' });
    }

    // El deposito se guarda EN LA MONEDA DE LA META. Si el movimiento esta en
    // otra, se convierte con la cotizacion del dia del movimiento — la misma que
    // ya tiene guardada — y el importe original queda escrito en la nota, para
    // que despues se pueda entender de donde salio el numero.
    const montoOriginal = Math.abs(parseFloat(tx.amount));
    const monedaTx = tx.currency || 'UYU';
    let amount = montoOriginal;
    let nota = tx.description;

    if (monedaTx !== goal.currency) {
      if (goal.currency === 'UYU') {
        amount = Math.abs(parseFloat(tx.amount_uyu));         // ya viene en pesos
      } else {
        const tasa = await getUsdToUyuRateOn(tx.date);
        amount = Math.abs(parseFloat(tx.amount_uyu)) / tasa;  // pesos -> dolares
      }
      amount = Math.round(amount * 100) / 100;
      nota = `${tx.description} (${monedaTx} ${montoOriginal})`;
    }

    client = await db.getClient();
    let actualizada;
    try {
      await client.query('BEGIN');
      await client.query('UPDATE transactions SET goal_id = $1 WHERE id = $2', [goal_id, transaction_id]);
      // transaction_id en el depósito es lo que hace reversible el vínculo:
      // sin él, deshacerlo obliga a adivinar cuál de los depósitos salió de
      // este movimiento comparando monto y texto.
      await client.query(
        'INSERT INTO goal_deposits (goal_id, user_id, amount, note, transaction_id) VALUES ($1, $2, $3, $4, $5)',
        [goal.id, req.userId, amount, nota, transaction_id]
      );
      actualizada = await recalcularSaldo(client, goal.id);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    res.json({ goal: actualizada, credited: amount, completed: actualizada.is_completed });
  } catch (err) {
    console.error('POST /goals/link-transaction error:', err.message);
    res.status(500).json({ error: 'Error al vincular el movimiento' });
  } finally {
    if (client) client.release();
  }
});

// DELETE /api/goals/link-transaction/:transactionId — deshacer el vínculo.
//
// Existe porque la acreditación la dispara una SUGERENCIA, y una sugerencia se
// equivoca. Sin esto, un "sí" de más deja la meta inflada para siempre: no hay
// ninguna otra forma de bajar current_amount desde la app.
router.delete('/link-transaction/:transactionId', async (req, res) => {
  let client;
  try {
    const { rows } = await db.query(
      'SELECT * FROM transactions WHERE id = $1 AND user_id = $2',
      [req.params.transactionId, req.userId]
    );
    const tx = rows[0];
    if (!tx) return res.status(404).json({ error: 'Movimiento no encontrado' });
    if (!tx.goal_id) return res.status(409).json({ error: 'Ese movimiento no está acreditado a ninguna meta' });

    const { rows: goalRows } = await db.query(
      'SELECT * FROM goals WHERE id = $1 AND user_id = $2',
      [tx.goal_id, req.userId]
    );
    const goal = goalRows[0];
    if (!goal) return res.status(404).json({ error: 'Meta no encontrada' });

    client = await db.getClient();
    let actualizada;
    try {
      await client.query('BEGIN');
      await client.query('UPDATE transactions SET goal_id = NULL WHERE id = $1', [tx.id]);
      await client.query(
        'DELETE FROM goal_deposits WHERE transaction_id = $1 AND user_id = $2',
        [tx.id, req.userId]
      );
      // Borrada la fila del historial, el saldo cae solo. Antes se restaba a
      // mano, asi que si el DELETE no encontraba nada —una fila vieja sin
      // transaction_id— el saldo bajaba igual y quedaba por debajo del historial.
      actualizada = await recalcularSaldo(client, goal.id);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    // Lo revertido es lo que decia el historial, no el importe del movimiento:
    // si las monedas diferian, el deposito valia otra cosa.
    res.json({ goal: actualizada, reverted: parseFloat(goal.current_amount) - parseFloat(actualizada.current_amount) });
  } catch (err) {
    console.error('DELETE /goals/link-transaction error:', err.message);
    res.status(500).json({ error: 'Error al deshacer el vínculo' });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
// Expuesto solo para scripts/verify-savings-surplus.js: el calculo depende de
// la fecha de hoy, asi que hay que poder correrlo contra datos sembrados.
module.exports.__testing = { calcSavingsSurplus };
