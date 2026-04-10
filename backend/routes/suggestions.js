const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── POST /api/suggestions ────────────────────────────────────
// Analiza los últimos 3 meses de gastos y devuelve sugerencias
router.post('/', async (req, res) => {
  try {
    // 1. Obtener datos del usuario
    const userResult = await db.query(
      'SELECT name, currency FROM users WHERE id = $1',
      [req.userId]
    );
    const user = userResult.rows[0];

    // 2. Obtener resumen de gastos últimos 3 meses
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

    // 3. Obtener suscripciones activas
    const subsResult = await db.query(
      'SELECT name, amount, frequency FROM subscriptions WHERE user_id = $1 AND is_active = true',
      [req.userId]
    );

    // 4. Obtener metas
    const goalsResult = await db.query(
      'SELECT name, target_amount, current_amount, target_date FROM goals WHERE user_id = $1 AND is_completed = false',
      [req.userId]
    );

    if (spendingResult.rows.length === 0) {
      return res.status(400).json({ error: 'No hay suficientes datos. Subí un estado de cuenta primero.' });
    }

    // 5. Construir contexto para Claude
    const spendingSummary = formatSpendingForClaude(spendingResult.rows);
    const subsList = subsResult.rows.map(s => `- ${s.name}: $${s.amount} ${s.frequency}`).join('\n');
    const goalsList = goalsResult.rows.map(g =>
      `- ${g.name}: $${g.current_amount} / $${g.target_amount} (${g.target_date ? `fecha: ${g.target_date}` : 'sin fecha'})`
    ).join('\n');

    const prompt = `Sos un asesor financiero personal experto en el mercado uruguayo.

Analiza los gastos de ${user.name} y dá sugerencias prácticas y específicas en español rioplatense.

GASTOS POR CATEGORÍA (últimos 3 meses, en ${user.currency}):
${spendingSummary}

SUSCRIPCIONES ACTIVAS:
${subsList || 'Ninguna detectada'}

METAS DE AHORRO:
${goalsList || 'Sin metas definidas'}

INSTRUCCIONES:
- Dá exactamente 5 sugerencias de ahorro concretas y accionables
- Priorizá las de mayor impacto primero
- Usá montos específicos cuando sea posible
- Mencioná si hay gastos inusuales o suscripciones que podrían cancelarse
- Si tiene metas, explicá cuánto necesita ahorrar por mes para llegar
- Sé directo, sin rodeos, sin intro larga

Respondé SOLO en formato JSON con esta estructura exacta:
{
  "suggestions": [
    {
      "title": "título corto",
      "description": "explicación de 1-2 oraciones",
      "potentialSaving": 1500,
      "priority": "high|medium|low",
      "category": "categoría afectada"
    }
  ],
  "monthlySavingPotential": 3000,
  "insight": "una observación clave sobre sus finanzas en 1 oración"
}`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].text;

    // Extraer JSON de la respuesta
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Error procesando respuesta de IA' });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    res.json(parsed);

  } catch (err) {
    console.error('Suggestions error:', err);
    if (err.status === 401) return res.status(500).json({ error: 'API key de Claude inválida' });
    res.status(500).json({ error: 'Error al generar sugerencias' });
  }
});

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
