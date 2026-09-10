/**
 * Cuenta del usuario: exportar y borrar.
 *
 * POR QUÉ EXISTE
 *
 * Hasta acá no había forma de irse. Los movimientos bancarios de alguien que
 * dejó de usar la app quedaban en la base para siempre, y no había manera de
 * llevárselos. Eso no es sólo una cortesía: las tiendas de apps lo exigen para
 * cualquier app que maneje datos financieros.
 *
 * EL BORRADO ES ATÓMICO Y A MANO
 *
 * Sólo `transactions`, `subscriptions` y `goals` tienen FK con ON DELETE
 * CASCADE. `bills`, `budgets`, `goal_deposits`, `shopping_lists`,
 * `shopping_items`, `search_log` y `search_click` se crean en initSchema() sin
 * ninguna FK, así que borrar el usuario dejaría siete tablas con filas
 * apuntando a un id inexistente. Van todas en UNA transacción: un borrado a
 * medias es peor que no borrar, porque el usuario cree que se fue y sus datos
 * siguen ahí.
 *
 * NOTA para cuando se agregue una tabla nueva con user_id: agregarla acá. El
 * set que estaba en scripts/verify-security-fixes.js ya se había quedado viejo
 * — no incluía search_log ni search_click, que se sumaron después.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Orden importa: hijos antes que padres. `users` va al final y de ahí caen por
// cascade transactions, subscriptions y goals.
const BORRADOS = [
  ['shopping_items', 'DELETE FROM shopping_items WHERE list_id IN (SELECT id FROM shopping_lists WHERE user_id = $1)'],
  ['shopping_lists', 'DELETE FROM shopping_lists WHERE user_id = $1'],
  ['goal_deposits',  'DELETE FROM goal_deposits WHERE user_id = $1'],
  ['bills',          'DELETE FROM bills WHERE user_id = $1'],
  ['budgets',        'DELETE FROM budgets WHERE user_id = $1'],
  ['search_click',   'DELETE FROM search_click WHERE user_id = $1'],
  ['search_log',     'DELETE FROM search_log WHERE user_id = $1'],
  ['users',          'DELETE FROM users WHERE id = $1'],
];

/**
 * GET /api/account/export — todo lo que la app guarda de este usuario.
 *
 * Va antes del borrado a propósito: irse sin poder llevarse nada no es una
 * opción real.
 */
router.get('/export', async (req, res) => {
  try {
    const [user, tx, subs, goals, bills, budgets] = await Promise.all([
      db.query('SELECT id, name, email, plan, plan_expires_at, created_at FROM users WHERE id = $1', [req.userId]),
      db.query('SELECT date, description, amount, type, category FROM transactions WHERE user_id = $1 ORDER BY date DESC', [req.userId]),
      db.query('SELECT name, amount, frequency, is_active FROM subscriptions WHERE user_id = $1', [req.userId]),
      db.query('SELECT name, target_amount, current_amount, target_date, is_completed FROM goals WHERE user_id = $1', [req.userId]),
      db.query('SELECT name, amount, due_day, category FROM bills WHERE user_id = $1', [req.userId]).catch(() => ({ rows: [] })),
      db.query('SELECT category, amount FROM budgets WHERE user_id = $1', [req.userId]).catch(() => ({ rows: [] })),
    ]);

    if (user.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json({
      exportado: new Date().toISOString(),
      cuenta: user.rows[0],
      transacciones: tx.rows,
      suscripciones: subs.rows,
      metas: goals.rows,
      facturas: bills.rows,
      presupuestos: budgets.rows,
    });
  } catch (err) {
    console.error('[account] export falló:', err.message);
    res.status(500).json({ error: 'No se pudo exportar' });
  }
});

/**
 * DELETE /api/account — borra la cuenta y todo lo asociado.
 *
 * Pide la contraseña aunque el JWT ya esté validado: un token robado no debería
 * alcanzar para una acción irreversible.
 */
router.delete('/', async (req, res) => {
  const { password } = req.body || {};
  if (!password) {
    return res.status(400).json({ error: 'Ingresá tu contraseña para confirmar' });
  }

  let client;
  try {
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    const valida = await bcrypt.compare(password, rows[0].password_hash);
    if (!valida) return res.status(401).json({ error: 'Contraseña incorrecta' });

    client = await db.getClient();
    const borradas = {};
    try {
      await client.query('BEGIN');
      for (const [tabla, sql] of BORRADOS) {
        const r = await client.query(sql, [req.userId]);
        borradas[tabla] = r.rowCount;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    // Se loguean CANTIDADES, nunca contenido — la misma regla que hizo falta
    // en routes/upload.js, donde se estaba escribiendo el resumen bancario.
    console.log('[account] cuenta borrada:', JSON.stringify(borradas));
    res.json({ ok: true, borradas });
  } catch (err) {
    console.error('[account] borrado falló:', err.message);
    res.status(500).json({ error: 'No se pudo borrar la cuenta' });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
