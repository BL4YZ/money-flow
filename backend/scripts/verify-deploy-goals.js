/**
 * ¿Render está sirviendo el código nuevo?
 *
 *   node scripts/verify-deploy-goals.js [baseUrl]
 *
 * /health devuelve una versión hardcodeada, así que no distingue un deploy de
 * otro. Lo único que lo prueba de verdad es pedirle a la API algo que sólo el
 * código nuevo sabe hacer: GET /goals ahora trae `feasibility`.
 *
 * Se registra un usuario descartable, mira la respuesta y **se borra a sí mismo
 * por la API** (DELETE /api/account, que ya limpia las once tablas). No toca la
 * base directo: si el borrado por la API no funcionara, esto también lo dice.
 */
const BASE = (process.argv[2] || 'https://money-flow-co41.onrender.com').replace(/\/$/, '');
const EMAIL = `deploy-check-${Date.now()}@ejemplo.local`;
const PASS  = `Pw-${Math.random().toString(36).slice(2, 12)}!`;

const req = async (metodo, ruta, cuerpo, token) => {
  const r = await fetch(`${BASE}/api${ruta}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch (_) {}
  return { status: r.status, data };
};

(async () => {
  console.log(`Probando ${BASE}\n`);
  let fallas = 0;
  const chequeo = (etiqueta, ok, detalle) => {
    if (!ok) fallas++;
    console.log(`   ${ok ? 'ok   ' : 'FALLA'} ${etiqueta.padEnd(46)} ${detalle}`);
  };

  // El primer request puede despertar el servicio (Render duerme a los 15 min).
  const salud = await req('GET', '/../health');
  chequeo('el servicio responde', salud.status === 200, `HTTP ${salud.status}`);
  if (salud.status !== 200) process.exit(1);

  const alta = await req('POST', '/auth/register', { name: 'Deploy Check', email: EMAIL, password: PASS });
  chequeo('registro de usuario descartable', alta.status === 201 || alta.status === 200,
    `HTTP ${alta.status}`);
  const token = alta.data?.token;
  if (!token) { console.log('\nsin token, no se puede seguir'); process.exit(1); }

  try {
    const metas = await req('GET', '/goals', null, token);
    chequeo('GET /goals responde', metas.status === 200, `HTTP ${metas.status}`);
    // La prueba: `feasibility` sólo existe en el código nuevo.
    const tiene = metas.data && Object.prototype.hasOwnProperty.call(metas.data, 'feasibility');
    chequeo('la respuesta trae `feasibility` (código nuevo)', tiene,
      tiene ? `status "${metas.data.feasibility?.status}"` : 'no está — Render sigue con el código viejo');
  } finally {
    const baja = await req('DELETE', '/account', { password: PASS }, token);
    chequeo('el usuario de prueba se borra solo', baja.status === 200, `HTTP ${baja.status}`);
    if (baja.status !== 200) console.log(`      ATENCION: quedo ${EMAIL} en produccion`);
  }

  console.log(`\n${fallas === 0 ? 'TODO OK: produccion sirve el codigo nuevo' : `${fallas} chequeos fallaron`}`);
  process.exit(fallas === 0 ? 0 : 1);
})().catch((e) => { console.error('error:', e.message); process.exit(1); });
