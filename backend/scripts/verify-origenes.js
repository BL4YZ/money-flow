/**
 * ¿De dónde salió cada movimiento?
 *
 *   npm run dev            (en otra terminal)
 *   node scripts/verify-origenes.js [baseUrl]
 *
 * La pantalla de Movimientos dice "del banco N · de tickets N · a mano N", y
 * sobre ese número del banco cuelga el botón que BORRA lo importado. O sea que
 * un conteo mal hecho acá no es un cartel torcido: es una persona tocando una
 * acción destructiva creyendo que se lleva otra cosa.
 *
 * Lo que tiene que cumplirse:
 *   - cada movimiento cuenta en su puerta, y en una sola
 *   - lo escrito a mano cuenta como a mano aunque `source` venga NULL, que es
 *     como quedaron las filas viejas
 *   - borrar lo importado baja SOLO el contador del banco
 *   - los orígenes son por usuario: los de otro no se mezclan
 *
 * Se registra un usuario descartable y se borra solo por DELETE /api/account.
 * Ojo: el .env local apunta a la MISMA base que Render — ver verify-receipts.js.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const db = require('../db');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const PASS = `Pw-${Math.random().toString(36).slice(2, 12)}!`;

// El mismo e-Ticket real que usa verify-receipts.js. Sin `description`: nombrar
// un RUT real deja el nombre para todo el mundo.
const QR_REAL = 'https://www.efactura.dgi.gub.uy/consultaQR/cfe?215080550011,101,A,424298,1007.00,20260730,nh28472Ha%2FIdlJGEd%2BYJdXTUBp8%3D';

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

(async () => {
  console.log(`Probando ${BASE}\n`);
  let fallas = 0;
  const chequeo = (etiqueta, ok, detalle = '') => {
    if (!ok) fallas++;
    console.log(`   ${ok ? 'ok   ' : 'FALLA'} ${etiqueta.padEnd(50)} ${detalle}`);
  };

  const alta = await api('POST', '/auth/register', {
    name: 'Origen', email: `origen-${Date.now()}@ejemplo.local`, password: PASS,
  });
  if (!alta.data?.token) { console.error('no se pudo registrar:', alta.status, alta.data); process.exit(1); }
  token = alta.data.token;
  const userId = alta.data.user.id;

  try {
    let r = await api('GET', '/transactions/origenes');
    chequeo('una cuenta nueva no tiene ningún movimiento', r.data?.total === 0, `total ${r.data?.total}`);

    // A mano.
    await api('POST', '/transactions', {
      description: 'Feria, efectivo', amount: 350, type: 'debit', category: 'Supermercado',
      date: '2026-07-15',
    });
    // Un ticket escaneado.
    await api('POST', '/receipts/qr', { qr: QR_REAL });
    // Y dos del resumen del banco. No hay endpoint para esto sin subir un
    // archivo cifrado, así que se insertan como las inserta el upload.
    for (const [i, monto] of [[1, 1200], [2, 800]].map((x) => x)) {
      await db.query(
        `INSERT INTO transactions (user_id, date, description, amount, type, category, source, external_id)
         VALUES ($1, '2026-07-20', $2, $3, 'debit', 'Otros', 'ocr', $4)`,
        [userId, `Resumen ${i}`, monto, `2026-07-20|ref-${i}-${Date.now()}`],
      );
    }

    r = await api('GET', '/transactions/origenes');
    chequeo('el del banco cuenta como del banco', r.data?.banco?.movimientos === 2, `${r.data?.banco?.movimientos}`);
    chequeo('el ticket cuenta como ticket', r.data?.ticket?.movimientos === 1, `${r.data?.ticket?.movimientos}`);
    chequeo('el de a mano cuenta como a mano', r.data?.manual?.movimientos === 1, `${r.data?.manual?.movimientos}`);
    chequeo('y el total es la suma, sin contar nada dos veces', r.data?.total === 4, `total ${r.data?.total}`);

    // Las filas viejas quedaron con source NULL: escribirlas a mano es lo único
    // que pudo haberlas creado, así que tienen que caer del lado de "a mano" y
    // no desaparecer del conteo.
    await db.query(
      `INSERT INTO transactions (user_id, date, description, amount, type, category, source)
       VALUES ($1, '2026-06-01', 'Fila vieja', 500, 'debit', 'Otros', NULL)`,
      [userId],
    );
    r = await api('GET', '/transactions/origenes');
    chequeo('una fila vieja sin origen no se pierde', r.data?.manual?.movimientos === 2 && r.data?.total === 5,
      `a mano ${r.data?.manual?.movimientos}, total ${r.data?.total}`);

    // LO QUE SOSTIENE EL BOTÓN DE BORRAR.
    const borrado = await api('DELETE', '/transactions/imported');
    r = await api('GET', '/transactions/origenes');
    chequeo('borrar lo importado se lleva los del banco', r.data?.banco?.movimientos === 0,
      `borró ${borrado.data?.borradas}`);
    chequeo('...y NO toca el ticket', r.data?.ticket?.movimientos === 1, `${r.data?.ticket?.movimientos}`);
    chequeo('...ni lo escrito a mano', r.data?.manual?.movimientos === 2, `${r.data?.manual?.movimientos}`);

    // Otra persona, su propia cuenta.
    const tokenViejo = token;
    const otro = await api('POST', '/auth/register', {
      name: 'Otro', email: `otro-origen-${Date.now()}@ejemplo.local`, password: PASS,
    });
    token = otro.data.token;
    r = await api('GET', '/transactions/origenes');
    chequeo('los orígenes son de cada uno', r.data?.total === 0, `total ${r.data?.total}`);
    await api('DELETE', '/account', { password: PASS });
    token = tokenViejo;
  } finally {
    await api('DELETE', '/account', { password: PASS });
  }

  console.log(`\n${fallas === 0
    ? 'TODO OK: cada movimiento cuenta en su puerta, y el borrado sólo se lleva la del banco'
    : `${fallas} chequeos fallaron`}`);
  process.exit(fallas === 0 ? 0 : 1);
})().catch((e) => { console.error('error:', e.message); process.exit(1); });
