/**
 * El saldo de una meta tiene que ser SIEMPRE lo que explica su historial.
 *
 *   npm run dev            (en otra terminal)
 *   node scripts/verify-goal-balance.js [baseUrl]
 *
 * Reportado desde la app: una meta al 12% con $5.827 ahorrados que abajo decía
 * "Hacé tu primer depósito para ver cuándo llegás". El anillo lee
 * goals.current_amount y la proyección lee goal_deposits; cuatro caminos
 * escribían el saldo y sólo dos dejaban historial, así que los dos números se
 * separaban sin que nada lo notara.
 *
 * Cada chequeo compara el saldo guardado contra SUM(goal_deposits). Al final
 * informa cuántas metas REALES quedan fuera de cuadratura — sólo el conteo, sin
 * mirar nombres ni importes de nadie.
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

// Las dos mitades que tienen que coincidir.
async function saldos(goalId) {
  const { rows } = await db.query(
    `SELECT g.current_amount::float AS guardado,
            COALESCE((SELECT SUM(amount) FROM goal_deposits WHERE goal_id = g.id), 0)::float AS historial
       FROM goals g WHERE g.id = $1`,
    [goalId],
  );
  return rows[0];
}

(async () => {
  console.log(`Probando ${BASE}\n`);
  let fallas = 0;
  const chequeo = (etiqueta, ok, detalle) => {
    if (!ok) fallas++;
    console.log(`   ${ok ? 'ok   ' : 'FALLA'} ${etiqueta.padEnd(52)} ${detalle}`);
  };
  const cuadra = async (goalId) => {
    const s = await saldos(goalId);
    return { ok: s.guardado === s.historial, txt: `saldo ${s.guardado} vs historial ${s.historial}` };
  };

  const alta = await api('POST', '/auth/register', {
    name: 'Saldo Check', email: `saldo-${Date.now()}@ejemplo.local`, password: PASS,
  });
  if (!alta.data?.token) { console.error('no se pudo registrar:', alta.status, alta.data); process.exit(1); }
  token = alta.data.token;

  try {
    // El plan free permite UNA sola meta y este script necesita dos. Se marca
    // premium directo en la base: el gate no es lo que se esta probando aca.
    await db.query("UPDATE users SET plan = 'premium', plan_expires_at = NOW() + INTERVAL '1 day' WHERE email = $1",
      [alta.data.user.email]);

    // 1. Un deposito normal.
    const meta = (await api('POST', '/goals', { name: 'Fondo', target_amount: 100000 })).data.goal;
    await api('POST', `/goals/${meta.id}/deposits`, { amount: 3000 });
    let c = await cuadra(meta.id);
    chequeo('un deposito deja saldo e historial iguales', c.ok, c.txt);

    // 2. Saldo inicial al crear: tambien tiene que dejar rastro, o la proyeccion
    //    dice "hace tu primer deposito" sobre una meta que ya tiene plata.
    const conSaldo = (await api('POST', '/goals', {
      name: 'Con saldo', target_amount: 50000, current_amount: 5827,
    })).data.goal;
    c = await cuadra(conSaldo.id);
    chequeo('un saldo inicial queda registrado como deposito', c.ok, c.txt);
    const { rows: deps } = await db.query(
      'SELECT COUNT(*)::int AS n FROM goal_deposits WHERE goal_id = $1', [conSaldo.id]);
    chequeo('...y la proyeccion tiene de donde leer', deps[0].n === 1, `${deps[0].n} deposito(s)`);

    // 3. PATCH ya no puede mover el saldo por la puerta de atras.
    const antes = (await saldos(conSaldo.id)).guardado;
    await api('PATCH', `/goals/${conSaldo.id}`, { current_amount: 999999 });
    const despues = (await saldos(conSaldo.id)).guardado;
    chequeo('PATCH no puede escribir el saldo', antes === despues, `${antes} -> ${despues}`);

    // 4. Acreditar y deshacer: ida y vuelta sin residuo.
    const { rows: tx } = await db.query(
      `INSERT INTO transactions (user_id, date, description, amount, type, category, source)
       VALUES ((SELECT id FROM users WHERE email = $1), CURRENT_DATE, 'TRANSFERENCIA AHORRO', 4000, 'debit', 'Otros', 'ocr')
       RETURNING id`, [alta.data.user.email]);
    await api('POST', '/goals/link-transaction', { transaction_id: tx[0].id, goal_id: meta.id });
    c = await cuadra(meta.id);
    chequeo('acreditar deja saldo e historial iguales', c.ok, c.txt);

    await api('DELETE', `/goals/link-transaction/${tx[0].id}`);
    c = await cuadra(meta.id);
    const s = await saldos(meta.id);
    chequeo('deshacer tambien, y vuelve al deposito previo', c.ok && s.guardado === 3000, c.txt);

    // 5. La reparacion: se ensucia el saldo a mano y initSchema tiene que
    //    emparejarlo agregando la fila que falta, sin borrar plata del usuario.
    await db.query('UPDATE goals SET current_amount = 9999 WHERE id = $1', [meta.id]);
    await db.initSchema();
    c = await cuadra(meta.id);
    const reparado = await saldos(meta.id);
    chequeo('la migracion repara una meta descuadrada', c.ok, c.txt);
    chequeo('...sin borrarle plata al usuario', reparado.guardado === 9999, `quedo en ${reparado.guardado}`);
  } finally {
    await api('DELETE', '/account', { password: PASS });
  }

  // Estado real de la base. Solo conteos: ni nombres ni importes de nadie.
  const { rows: desc } = await db.query(
    `SELECT COUNT(*) FILTER (WHERE g.current_amount > h.total)::int AS de_mas,
            COUNT(*) FILTER (WHERE g.current_amount < h.total)::int AS de_menos
       FROM goals g
       JOIN LATERAL (SELECT COALESCE(SUM(amount), 0) AS total
                       FROM goal_deposits WHERE goal_id = g.id) h ON true`);
  console.log(`\n   metas reales con saldo MAYOR que su historial:  ${desc[0].de_mas}  (las repara initSchema)`);
  console.log(`   metas reales con saldo MENOR que su historial: ${desc[0].de_menos}  (no se tocan: subirlas revertiria un "Deshacer" real)`);

  console.log(`\n${fallas === 0 ? 'TODO OK: el saldo siempre lo explica el historial' : `${fallas} chequeos fallaron`}`);
  process.exit(fallas === 0 ? 0 : 1);
})().catch((e) => { console.error('error:', e.message); process.exit(1); });
