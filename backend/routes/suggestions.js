const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const requirePremium = require('../middleware/requirePremium');

const router = express.Router();
router.use(authMiddleware);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── POST /api/suggestions ────────────────────────────────────
//
// EL MODELO DICE QUÉ HACER; LOS NÚMEROS LOS PONE EL SERVIDOR.
//
// El prompt le pedía a Claude `potentialSaving: 1500` y `monthlySavingPotential:
// 3000`, y la app los mostraba —el total en una card verde, y multiplicado por
// 12 como "al año"— al lado del margen mensual, que sí sale de seis meses de
// resúmenes cerrados. Dos cifras con la misma pinta y origen opuesto: una
// medida, la otra inventada por un modelo de lenguaje. El usuario no tiene cómo
// distinguirlas. Es la regla que este repo ya tiene escrita por el anillo del
// 72% de Upload, acá aplicada a plata.
//
// Cuánto ahorraría alguien gastando menos en delivery NO ES CALCULABLE: depende
// de lo que esa persona haga después. Lo que sí es un hecho es cuánto gasta hoy
// en esa categoría, y cuánto sale una suscripción que ya está detectada. Así que
// el modelo devuelve la sugerencia y a qué se refiere, y el servidor le pega el
// número real sacado de su propia base.
router.post('/', requirePremium, async (req, res) => {
  try {
    // El nombre del usuario NO va en el prompt: no aporta nada al análisis y es
    // un dato personal de más viajando a un tercero.
    const userResult = await db.query('SELECT currency FROM users WHERE id = $1', [req.userId]);
    const user = userResult.rows[0];

    const spendingResult = await db.query(
      `SELECT
         category,
         to_char(date, 'YYYY-MM') as month,
         SUM(amount) as total
       FROM transactions
       WHERE user_id = $1
         AND type = 'debit'
         AND date >= NOW() - INTERVAL '3 months'
       GROUP BY category, month
       ORDER BY month DESC, total DESC`,
      [req.userId]
    );

    if (spendingResult.rows.length === 0) {
      return res.status(400).json({ error: 'No hay suficientes datos. Subí un estado de cuenta primero.' });
    }

    // Promedio mensual real por categoría, sobre meses CERRADOS y sin contar los
    // depósitos a metas (esa plata no se gastó, se movió de lugar). Mismo
    // criterio que goalFeasibility y calcSavingsSurplus.
    const { rows: promedios } = await db.query(
      `SELECT category, AVG(total) AS mensual, COUNT(*) AS meses FROM (
         SELECT category, DATE_TRUNC('month', date) AS mes, SUM(ABS(amount)) AS total
         FROM transactions
         WHERE user_id = $1 AND type = 'debit' AND goal_id IS NULL
           AND date >= DATE_TRUNC('month', NOW()) - INTERVAL '6 months'
           AND date <  DATE_TRUNC('month', NOW())
         GROUP BY 1, 2
       ) t GROUP BY category`,
      [req.userId]
    );
    const gastoPorCategoria = Object.fromEntries(
      promedios.map((p) => [p.category || 'Otros', Math.round(parseFloat(p.mensual))])
    );

    const subsResult = await db.query(
      'SELECT name, amount, frequency FROM subscriptions WHERE user_id = $1 AND is_active = true',
      [req.userId]
    );

    const goalsResult = await db.query(
      'SELECT name, target_amount, current_amount, target_date FROM goals WHERE user_id = $1 AND is_completed = false',
      [req.userId]
    );

    const spendingSummary = formatSpendingForClaude(spendingResult.rows);
    const subsList = subsResult.rows.map(s => `- ${s.name}: $${s.amount} ${s.frequency}`).join('\n');
    const goalsList = goalsResult.rows.map(g =>
      `- ${g.name}: $${g.current_amount} / $${g.target_amount} (${g.target_date ? `fecha: ${g.target_date}` : 'sin fecha'})`
    ).join('\n');

    const prompt = `Sos un asesor financiero personal experto en el mercado uruguayo.

Analizá estos gastos y dá sugerencias prácticas y específicas en español rioplatense.

GASTOS POR CATEGORÍA (últimos 3 meses, en ${user.currency}):
${spendingSummary}

SUSCRIPCIONES ACTIVAS:
${subsList || 'Ninguna detectada'}

METAS DE AHORRO:
${goalsList || 'Sin metas definidas'}

INSTRUCCIONES:
- Dá exactamente 5 sugerencias de ahorro concretas y accionables
- Priorizá las de mayor impacto primero
- Mencioná si hay gastos inusuales o suscripciones que podrían cancelarse
- Si tiene metas, relacioná la sugerencia con la meta
- Sé directo, sin rodeos, sin intro larga

NO INVENTES MONTOS, y no estimes cuánto se ahorraría: no lo sabés, depende de lo
que la persona haga después. Los montos los agrega el sistema desde los datos
reales. En "category" poné exactamente una de las categorías de la lista de
arriba. Si la sugerencia es cancelar una suscripción, poné su nombre exacto en
"subscription"; si no, dejá "subscription" en null.

Respondé SOLO en formato JSON con esta estructura exacta:
{
  "suggestions": [
    {
      "title": "título corto",
      "description": "explicación de 1-2 oraciones, sin cifras inventadas",
      "priority": "high|medium|low",
      "category": "categoría afectada",
      "subscription": "nombre exacto de la suscripción, o null"
    }
  ],
  "insight": "una observación clave sobre sus finanzas en 1 oración"
}`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const jsonMatch = message.content[0].text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Error procesando respuesta de IA' });
    }
    const parsed = JSON.parse(jsonMatch[0]);

    // Acá se le pegan los números REALES a lo que dijo el modelo. Cualquier
    // monto que haya devuelto igual se descarta: no se copia al response.
    const porNombre = new Map(subsResult.rows.map((s) => [s.name.toLowerCase(), s]));
    const suggestions = (parsed.suggestions || []).map((s) => {
      const sub = s.subscription ? porNombre.get(String(s.subscription).toLowerCase()) : null;
      return {
        title: s.title,
        description: s.description,
        priority: s.priority,
        category: s.category,
        // Lo que la persona gasta HOY en esa categoría. No es un ahorro
        // prometido: es el tamaño de lo que está mirando.
        gastoMensual: gastoPorCategoria[s.category] ?? null,
        // Esto sí es un ahorro verificable: el importe de una suscripción que ya
        // está en la base. Si el modelo nombró una que no existe, queda null.
        ahorroSuscripcion: sub ? Math.round(mensualizar(sub)) : null,
        suscripcion: sub ? sub.name : null,
      };
    });

    // El único total afirmable: la suma de las suscripciones que efectivamente
    // propone dar de baja. Si no propone ninguna, no hay total y no se muestra
    // ninguno — en vez de mostrar uno inventado.
    const ahorroVerificable = suggestions.reduce((t, s) => t + (s.ahorroSuscripcion || 0), 0);

    res.json({
      suggestions,
      insight: parsed.insight,
      ahorroVerificable,
      // Sobre cuántos meses cerrados se calcularon los promedios, para que la UI
      // pueda decirlo en vez de presentarlos como si fueran de este mes.
      mesesDeDatos: promedios.length ? Math.max(...promedios.map((p) => parseInt(p.meses, 10))) : 0,
    });
  } catch (err) {
    console.error('Suggestions error:', err);
    if (err.status === 401) return res.status(500).json({ error: 'API key de Claude inválida' });
    res.status(500).json({ error: 'Error al generar sugerencias' });
  }
});

// Una suscripción anual no ahorra su importe todos los meses.
function mensualizar(sub) {
  const monto = parseFloat(sub.amount) || 0;
  if (sub.frequency === 'yearly') return monto / 12;
  if (sub.frequency === 'weekly') return (monto * 52) / 12;
  return monto;
}

function formatSpendingForClaude(rows) {
  const byMonth = {};
  rows.forEach(row => {
    if (!byMonth[row.month]) byMonth[row.month] = {};
    byMonth[row.month][row.category || 'Otros'] = parseFloat(row.total);
  });

  return Object.entries(byMonth)
    .map(([month, cats]) => {
      const lines = Object.entries(cats)
        .map(([cat, total]) => `  ${cat}: $${total.toFixed(0)}`)
        .join('\n');
      return `${month}:\n${lines}`;
    })
    .join('\n\n');
}

module.exports = router;
