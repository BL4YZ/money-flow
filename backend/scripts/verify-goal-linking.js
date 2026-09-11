/**
 * Acreditar un movimiento del banco a una meta: ¿suma bien, y se puede deshacer?
 *
 *   npm run dev            (en otra terminal)
 *   node scripts/verify-goal-linking.js [baseUrl]
 *
 * Este endpoint mueve plata en la pantalla del usuario, y hasta ahora no lo
 * llamaba nadie — así que nunca se había ejercitado. Los tres primeros chequeos
 * son los errores que tenía: vincular dos veces sumaba dos veces, aceptaba un
 * ingreso (metía el sueldo adentro de la meta) y no había forma de deshacerlo.
 *
 * Se crea un usuario descartable y se borra solo por DELETE /api/account.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const db = require('../db');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const PASS = `Pw-${Math.random().toString(36).slice(2, 12)}!`;

let token;
const api = async (metodo, ruta, cuerpo) => {
  const r = await fetch(`${BASE}/api${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch (_) {}
  return { status: r.status, data };
};

// Los movimientos se siembran directo en la base: vienen del banco, no hay
// endpoint que los cree, y el punto es probar la acreditación.
async function sembrarMov(uid, { desc, monto, tipo = 'debit', categoria = 'Otros', source = 'ocr' }) {
  const { rows } = await db.query(
    `INSERT INTO transactions (user_id, date, description, amount, type, category, source)
     VALUES ($1, CURRENT_DATE - 5, $2, $3, $4, $5, $6) RETURNING id`,
    [uid, desc, monto, tipo, categoria, source],
  );
  return rows[0].id;
}

const montoMeta = async (id) =>
  parseFloat((await db.query('SELECT current_amount FROM goals WHERE id = $1', [id])).rows[0].current_amount);

(async () => {
  console.log(`Probando ${BASE}\n`);
  let fallas = 0;
  const chequeo = (etiqueta, ok, detalle) => {
    if (!ok) fallas++;
    console.log(`   ${ok ? 'ok   ' : 'FALLA'} ${etiqueta.padEnd(50)} ${detalle}`);
  };

  const alta = await api('POST', '/auth/register', {
    name: 'Link Check', email: `link-${Date.now()}@ejemplo.local`, password: PASS,
  });
  if (!alta.data?.token) { console.error('no se pudo registrar:', alta.status, alta.data); process.exit(1); }
  token = alta.data.token;
  const uid = alta.data.user?.id || (await db.query('SELECT id FROM users WHERE email = $1', [alta.data.user?.email])).rows[0]?.id;

  try {
    const meta = (await api('POST', '/goals', { name: 'Fondo', target_amount: 100000 })).data.goal;

    const ahorro  = await sembrarMov(uid, { desc: 'TRANSFERENCIA A CAJA DE AHORRO', monto: 5000 });
    const sueldo  = await sembrarMov(uid, { desc: 'SUELDO', monto: 60000, tipo: 'credit', categoria: 'Salario' });
    const compra  = await sembrarMov(uid, { desc: 'SUPERMERCADO DISCO', monto: 3200, categoria: 'Supermercado' });
    const tipeado = await sembrarMov(uid, { desc: 'TRANSFERENCIA', monto: 2000, source: 'manual' });

    // 1. El camino feliz.
    let r = await api('POST', '/goals/link-transaction', { transaction_id: ahorro, goal_id: meta.id });
    chequeo('acredita un egreso del banco', r.status === 200 && r.data.credited === 5000,
      `HTTP ${r.status}, acreditó ${r.data?.credited}`);
    chequeo('la meta sube', (await montoMeta(meta.id)) === 5000, `saldo ${await montoMeta(meta.id)}`);

    // 2. EL BUG: vincular dos veces sumaba dos veces.
    r = await api('POST', '/goals/link-transaction', { transaction_id: ahorro, goal_id: meta.id });
    chequeo('vincular dos veces se rechaza', r.status === 409, `HTTP ${r.status}`);
    chequeo('y NO suma de nuevo', (await montoMeta(meta.id)) === 5000, `saldo ${await montoMeta(meta.id)}`);

    // 3. EL OTRO BUG: aceptaba un ingreso.
    r = await api('POST', '/goals/link-transaction', { transaction_id: sueldo, goal_id: meta.id });
    chequeo('no deja acreditar un ingreso', r.status === 400, `HTTP ${r.status}`);

    // 4. IDOR: el id de otro no alcanza.
    const { rows: ajeno } = await db.query(
      `INSERT INTO users (name, email, password_hash) VALUES ('Otro', $1, 'x') RETURNING id`,
      [`otro-${Date.now()}@ejemplo.local`],
    );
    const movAjeno = await sembrarMov(ajeno[0].id, { desc: 'TRANSFERENCIA', monto: 9999 });
    r = await api('POST', '/goals/link-transaction', { transaction_id: movAjeno, goal_id: meta.id });
    chequeo('no acredita el movimiento de otro usuario', r.status === 404, `HTTP ${r.status}`);
    await db.query('DELETE FROM transactions WHERE user_id = $1', [ajeno[0].id]);
    await db.query('DELETE FROM users WHERE id = $1', [ajeno[0].id]);

    // 5. Deshacer. Sin esto, un "sí" de más deja la meta inflada para siempre.
    r = await api('DELETE', `/goals/link-transaction/${ahorro}`);
    chequeo('se puede deshacer', r.status === 200, `HTTP ${r.status}`);
    chequeo('la meta vuelve a cero', (await montoMeta(meta.id)) === 0, `saldo ${await montoMeta(meta.id)}`);
    const dep = await db.query('SELECT COUNT(*) FROM goal_deposits WHERE transaction_id = $1', [ahorro]);
    chequeo('el depósito se borra, no queda duplicado', dep.rows[0].count === '0', `quedan ${dep.rows[0].count}`);

    // 6. La lista de candidatos: qué ofrece y qué no.
    const cands = (await api('GET', '/goals/candidates')).data.candidates || [];
    const ids = cands.map((c) => c.id);
    chequeo('ofrece la transferencia', ids.includes(ahorro), `${cands.length} candidatos`);
    chequeo('NO ofrece una compra de supermercado', !ids.includes(compra), '');
    chequeo('NO ofrece lo cargado a mano', !ids.includes(tipeado), '');
    chequeo('NO ofrece un ingreso', !ids.includes(sueldo), '');
    chequeo('explica por qué lo sugiere', (cands[0]?.motivos || []).length > 0,
      `"${cands[0]?.description}" → ${(cands[0]?.motivos || []).join(', ')}`);

    // Y una vez acreditado, deja de ofrecerse.
    await api('POST', '/goals/link-transaction', { transaction_id: ahorro, goal_id: meta.id });
    const despues = (await api('GET', '/goals/candidates')).data.candidates || [];
    chequeo('deja de ofrecer lo ya acreditado', !despues.map((c) => c.id).includes(ahorro),
      `${despues.length} candidatos`);
  } finally {
    const baja = await api('DELETE', '/account', { password: PASS });
    chequeo('el usuario de prueba se borra solo', baja.status === 200, `HTTP ${baja.status}`);
  }

  console.log(`\n${fallas === 0 ? 'TODO OK: acredita una vez, y se puede deshacer' : `${fallas} chequeos fallaron`}`);
  process.exit(fallas === 0 ? 0 : 1);
})().catch((e) => { console.error('error:', e.message); process.exit(1); });
