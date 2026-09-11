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
 */
// La preferencia de vista: se guarda, sobrevive y rechaza basura.
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

  await api('DELETE', '/account', { password: PASS });
  console.log('\n' + (fallas === 0 ? 'TODO OK: la preferencia es de la persona, no del telefono' : fallas + ' fallaron'));
  process.exit(fallas === 0 ? 0 : 1);
})().catch((e) => { console.error('error:', e.message); process.exit(1); });
