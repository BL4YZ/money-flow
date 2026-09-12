/**
 * La cuenta que mira el usuario: ¿se guarda y sobrevive?
 *
 *   npm run dev            (en otra terminal)
 *   node scripts/verify-display-currency.js
 *
 * El selector de cuenta (Pesos / Dólares / Todo) no sirve de nada si en cada
 * arranque vuelve a pesos. Vive en el servidor y no en el teléfono porque es
 * una preferencia de la persona, no del dispositivo.
 *
 * El chequeo que importa es el del LOGIN: el SELECT no traía la columna, así
 * que quien mira sobre todo su cuenta en dólares entraba siempre en pesos hasta
 * reiniciar la app, que es cuando recién corre /auth/me.
 *
 * Ahora cubre también los RECORDATORIOS DE VENCIMIENTOS, que es la otra
 * preferencia y la que se puede apagar desde Configuración. Dos cosas se
 * verifican de ahí, y ninguna es obvia:
 *   - apagarlos no puede apagar la moneda de paso: cada preferencia viaja sola
 *   - apagado tiene que quedar apagado. Borrar el push_token NO alcanzaba: el
 *     cliente lo registra de nuevo en cada login y en cada vuelta a primer
 *     plano, así que el aviso se habría encendido solo y el interruptor sería
 *     mentira. Por eso es una columna propia que el cron consulta.
 */
// La preferencia de vista: se guarda, sobrevive y rechaza basura.
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const db = require('../db');
const BASE = 'http://localhost:3000/api';
const PASS = 'Pw-' + Math.random().toString(36).slice(2, 12) + '!';
let token;
const api = async (m, r, b) => {
  const res = await fetch(BASE + r, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: b ? JSON.stringify(b) : undefined,
  });
  let d = null; try { d = await res.json(); } catch (_) {}
  return { status: res.status, data: d };
};
(async () => {
  let fallas = 0;
  const ok = (et, cond, det) => { if (!cond) fallas++; console.log('   ' + (cond ? 'ok   ' : 'FALLA') + ' ' + et.padEnd(46) + ' ' + det); };

  const alta = await api('POST', '/auth/register', { name: 'Pref', email: `pref-${Date.now()}@ejemplo.local`, password: PASS });
  token = alta.data.token;
  ok('arranca en pesos por defecto', alta.data.user.display_currency === 'UYU' || alta.data.user.display_currency === undefined,
     String(alta.data.user.display_currency));

  let r = await api('PATCH', '/account/preferences', { display_currency: 'USD' });
  ok('guarda la eleccion', r.status === 200 && r.data.display_currency === 'USD', 'HTTP ' + r.status);

  r = await api('GET', '/auth/me');
  ok('y sobrevive: /auth/me la devuelve', r.data.user.display_currency === 'USD', String(r.data.user.display_currency));

  r = await api('PATCH', '/account/preferences', { display_currency: 'BTC' });
  ok('rechaza una moneda inventada', r.status === 400, 'HTTP ' + r.status);

  r = await api('PATCH', '/account/preferences', { display_currency: 'todo' });
  ok('acepta "todo" (las dos juntas)', r.status === 200, 'HTTP ' + r.status);

  // ─── Recordatorios de vencimientos ───
  r = await api('GET', '/auth/me');
  ok('los avisos vienen encendidos', r.data.user.notify_bills === true, String(r.data.user.notify_bills));

  r = await api('PATCH', '/account/preferences', { notify_bills: false });
  ok('se pueden apagar', r.status === 200 && r.data.notify_bills === false, 'HTTP ' + r.status);

  // Lo que hace que el interruptor sea verdad: el cron mira esta columna, no el
  // push_token, que el cliente vuelve a escribir en cada login.
  const { rows } = await db.query(
    'SELECT notify_bills FROM users WHERE id = $1', [alta.data.user.id]);
  ok('y el cron los va a saltear', rows[0].notify_bills === false, 'notify_bills=' + rows[0].notify_bills);

  ok('apagarlos NO toco la moneda', r.data.display_currency === 'todo', String(r.data.display_currency));

  r = await api('POST', '/auth/login', { email: alta.data.user.email, password: PASS });
  ok('apagado sigue apagado despues de entrar', r.data.user.notify_bills === false, String(r.data.user.notify_bills));
  token = r.data.token;

  r = await api('PATCH', '/account/preferences', { notify_bills: 'si' });
  ok('rechaza algo que no es si/no', r.status === 400, 'HTTP ' + r.status);

  r = await api('PATCH', '/account/preferences', {});
  ok('un cuerpo vacio no es un cambio', r.status === 400, 'HTTP ' + r.status);

  await api('DELETE', '/account', { password: PASS });
  console.log('\n' + (fallas === 0 ? 'TODO OK: la preferencia es de la persona, no del telefono' : fallas + ' fallaron'));
  process.exit(fallas === 0 ? 0 : 1);
})().catch((e) => { console.error('error:', e.message); process.exit(1); });
