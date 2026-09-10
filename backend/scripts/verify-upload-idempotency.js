/**
 * ¿Subir el mismo resumen dos veces duplica, o actualiza?
 *
 *   node scripts/verify-upload-idempotency.js
 *
 * Simula tres subidas sobre un usuario descartable, con el MISMO conjunto de
 * movimientos: la primera con un importe equivocado (como pasó de verdad
 * cuando se leía la columna de saldo), y las dos siguientes con el correcto.
 *
 * Lo que tiene que pasar:
 *   1ª subida → 3 filas nuevas
 *   2ª subida → 0 nuevas, 3 corregidas, y el importe malo arreglado
 *   3ª subida → 0 nuevas, 3 sin cambios, total sigue en 3
 *
 * Sale distinto de cero si en algún momento el total se pasa de 3.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const db = require('../db');

const MOVS = [
  { externalId: '2026-09-01|REF-A', date: '2026-09-01', description: 'ANCAP LAGOMAR', type: 'debit', category: 'Transporte' },
  { externalId: '2026-09-02|REF-B', date: '2026-09-02', description: 'SUPERMERCADO', type: 'debit', category: 'Supermercado' },
  { externalId: '2026-09-03|REF-C', date: '2026-09-03', description: 'SUELDO', type: 'credit', category: 'Salario' },
];

async function subir(uid, movs) {
  let nuevas = 0, actualizadas = 0;
  for (const m of movs) {
    const r = await db.query(
      `INSERT INTO transactions (user_id, date, description, amount, type, category, source, external_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'ocr', $7)
       ON CONFLICT (user_id, external_id) WHERE external_id IS NOT NULL
       DO UPDATE SET description = EXCLUDED.description, amount = EXCLUDED.amount,
                     type = EXCLUDED.type, category = EXCLUDED.category
       RETURNING (xmax = 0) AS es_nueva`,
      [uid, m.date, m.description, m.amount, m.type, m.category, m.externalId],
    );
    if (r.rows[0].es_nueva) nuevas++; else actualizadas++;
  }
  return { nuevas, actualizadas };
}

const total = async (uid) =>
  Number((await db.query('SELECT COUNT(*) FROM transactions WHERE user_id = $1', [uid])).rows[0].count);

const montoAncap = async (uid) =>
  Number((await db.query(
    "SELECT amount FROM transactions WHERE user_id = $1 AND external_id = '2026-09-01|REF-A'", [uid],
  )).rows[0].amount);

(async () => {
  await db.initSchema().catch(() => {});
  const { rows } = await db.query(
    "INSERT INTO users (name, email, password_hash) VALUES ('Idem', $1, 'x') RETURNING id",
    [`idem-${Date.now()}@ejemplo.local`],
  );
  const uid = rows[0].id;
  let fallas = 0;
  const chequeo = (etiqueta, real, esperado) => {
    const ok = real === esperado;
    if (!ok) fallas++;
    console.log(`   ${ok ? 'ok   ' : 'FALLA'} ${etiqueta.padEnd(34)} ${real}${ok ? '' : `  (esperado ${esperado})`}`);
  };

  try {
    // 1ª: importe MAL, como cuando se leía el saldo.
    console.log('1ª subida (con el importe equivocado):');
    let r = await subir(uid, MOVS.map((m) => ({ ...m, amount: m.externalId.endsWith('A') ? 43311 : 500 })));
    chequeo('filas nuevas', r.nuevas, 3);
    chequeo('filas actualizadas', r.actualizadas, 0);
    chequeo('total en la base', await total(uid), 3);
    chequeo('monto ANCAP (malo, a propósito)', await montoAncap(uid), 43311);

    console.log('\n2ª subida (mismo archivo, importe corregido):');
    r = await subir(uid, MOVS.map((m) => ({ ...m, amount: m.externalId.endsWith('A') ? 1000 : 500 })));
    chequeo('filas nuevas', r.nuevas, 0);
    chequeo('filas actualizadas', r.actualizadas, 3);
    chequeo('total en la base', await total(uid), 3);
    chequeo('monto ANCAP corregido', await montoAncap(uid), 1000);

    console.log('\n3ª subida (idéntica a la 2ª):');
    r = await subir(uid, MOVS.map((m) => ({ ...m, amount: m.externalId.endsWith('A') ? 1000 : 500 })));
    chequeo('filas nuevas', r.nuevas, 0);
    chequeo('total en la base', await total(uid), 3);
  } finally {
    await db.query('DELETE FROM transactions WHERE user_id = $1', [uid]);
    await db.query('DELETE FROM users WHERE id = $1', [uid]);
  }

  console.log(`\n${fallas === 0 ? 'TODO OK: no duplica y corrige' : `${fallas} chequeos fallaron`}`);
  process.exit(fallas === 0 ? 0 : 1);
})().catch((e) => { console.error('error:', e.message); process.exit(1); });
