/**
 * ¿El borrado de cuenta deja algo atrás?
 *
 *   node scripts/verify-account-deletion.js
 *
 * Sale distinto de cero si queda una sola fila. Correr esto cada vez que se
 * agregue una tabla con user_id: sólo transactions, subscriptions y goals
 * tienen FK con cascade, así que toda tabla nueva hay que sumarla a mano al set
 * de routes/account.js y acá. El set que vivía en verify-security-fixes.js ya
 * se había quedado viejo — le faltaban search_log y search_click.
 *
 * Crea un usuario descartable, le mete una fila en CADA tabla que guarda
 * user_id, corre el mismo set de queries que routes/account.js, y después
 * cuenta. Si queda una sola fila, el borrado miente: el usuario cree que se
 * fue y sus datos siguen ahí.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const db = require('../db');

const TABLAS = [
  ['transactions',   'SELECT COUNT(*) FROM transactions WHERE user_id = $1'],
  ['subscriptions',  'SELECT COUNT(*) FROM subscriptions WHERE user_id = $1'],
  ['goals',          'SELECT COUNT(*) FROM goals WHERE user_id = $1'],
  ['bills',          'SELECT COUNT(*) FROM bills WHERE user_id = $1'],
  ['budgets',        'SELECT COUNT(*) FROM budgets WHERE user_id = $1'],
  ['goal_deposits',  'SELECT COUNT(*) FROM goal_deposits WHERE user_id = $1'],
  ['shopping_lists', 'SELECT COUNT(*) FROM shopping_lists WHERE user_id = $1'],
  ['shopping_items', 'SELECT COUNT(*) FROM shopping_items WHERE list_id IN (SELECT id FROM shopping_lists WHERE user_id = $1)'],
  ['search_log',     'SELECT COUNT(*) FROM search_log WHERE user_id = $1'],
  ['search_click',   'SELECT COUNT(*) FROM search_click WHERE user_id = $1'],
  ['users',          'SELECT COUNT(*) FROM users WHERE id = $1'],
];

(async () => {
  await db.initSchema().catch(() => {});
  const email = `borrado-test-${Date.now()}@ejemplo.local`;
  const { rows } = await db.query(
    "INSERT INTO users (name, email, password_hash) VALUES ('Test Borrado', $1, 'x') RETURNING id",
    [email],
  );
  const uid = rows[0].id;
  console.log(`usuario descartable: ${uid}\n`);

  // Una fila en cada tabla.
  const semillas = [
    ["INSERT INTO transactions (user_id, date, description, amount, type, category) VALUES ($1, CURRENT_DATE, 'x', 1, 'debit', 'Otros')"],
    ["INSERT INTO subscriptions (user_id, name, amount, frequency) VALUES ($1, 'x', 1, 'monthly')"],
    ["INSERT INTO goals (user_id, name, target_amount) VALUES ($1, 'x', 10)"],
    ["INSERT INTO bills (user_id, name, due_day) VALUES ($1, 'x', 1)"],
    ["INSERT INTO budgets (user_id, category, amount) VALUES ($1, 'Otros', 10)"],
    ["INSERT INTO search_log (user_id, query, results_count) VALUES ($1, 'x', 0)"],
    ["INSERT INTO search_click (user_id, position, product_name, price) VALUES ($1, 1, 'x', 1)"],
  ];
  for (const [sql] of semillas) {
    await db.query(sql, [uid]).catch((e) => console.log(`   (no se pudo sembrar: ${e.message.slice(0, 60)})`));
  }
  // Lista + item, que es el caso de dos saltos.
  const l = await db.query("INSERT INTO shopping_lists (user_id, name) VALUES ($1, 'x') RETURNING id", [uid]).catch(() => null);
  if (l) await db.query("INSERT INTO shopping_items (list_id, name) VALUES ($1, 'x')", [l.rows[0].id]).catch(() => {});
  const g = await db.query("SELECT id FROM goals WHERE user_id = $1 LIMIT 1", [uid]);
  if (g.rows[0]) await db.query("INSERT INTO goal_deposits (user_id, goal_id, amount) VALUES ($1, $2, 5)", [uid, g.rows[0].id]).catch(() => {});

  console.log('ANTES del borrado:');
  let sembradas = 0;
  for (const [t, sql] of TABLAS) {
    const r = await db.query(sql, [uid]).catch(() => ({ rows: [{ count: 'n/a' }] }));
    const n = r.rows[0].count;
    if (n !== '0' && n !== 'n/a') sembradas++;
    console.log(`   ${t.padEnd(16)} ${n}`);
  }
  console.log(`   → ${sembradas} tablas con datos\n`);

  // El MISMO set que usa la ruta.
  const SET = [
    'DELETE FROM shopping_items WHERE list_id IN (SELECT id FROM shopping_lists WHERE user_id = $1)',
    'DELETE FROM shopping_lists WHERE user_id = $1',
    'DELETE FROM goal_deposits WHERE user_id = $1',
    'DELETE FROM bills WHERE user_id = $1',
    'DELETE FROM budgets WHERE user_id = $1',
    'DELETE FROM search_click WHERE user_id = $1',
    'DELETE FROM search_log WHERE user_id = $1',
    'DELETE FROM users WHERE id = $1',
  ];
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    for (const sql of SET) await client.query(sql, [uid]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }

  console.log('DESPUÉS:');
  let quedan = 0;
  for (const [t, sql] of TABLAS) {
    const r = await db.query(sql, [uid]).catch(() => ({ rows: [{ count: 'n/a' }] }));
    const n = r.rows[0].count;
    const mal = n !== '0' && n !== 'n/a';
    if (mal) quedan++;
    console.log(`   ${t.padEnd(16)} ${n}${mal ? '   ← QUEDÓ' : ''}`);
  }
  console.log(`\n${quedan === 0 ? 'LIMPIO: no quedó ninguna fila' : `FALLA: ${quedan} tablas con residuo`}`);
  process.exit(quedan === 0 ? 0 : 1);
})().catch((e) => { console.error('error:', e.message); process.exit(1); });
