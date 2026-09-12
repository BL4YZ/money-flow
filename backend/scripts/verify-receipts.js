/**
 * Escanear un comprobante: ¿carga el gasto, y no lo carga dos veces?
 *
 *   npm run dev            (en otra terminal)
 *   node scripts/verify-receipts.js [baseUrl]
 *
 * Usa el QR REAL de un e-Ticket de Unitex/CONAPLUS, decodificado de una foto.
 * Lo que tiene que cumplirse:
 *   - el movimiento entra con el importe y la fecha del QR, exactos
 *   - escanearlo DOS VECES no duplica: el external_id sale de
 *     RUT+tipo+serie+número, que es único en todo el país
 *   - una nota de crédito entra como ingreso, no como gasto
 *   - un QR que no es un comprobante se rechaza sin romper nada
 *   - una FOTO en /api/upload ya no dice "no se pudo leer el PDF"
 *
 * Se registra un usuario descartable y se borra solo por DELETE /api/account.
 *
 * OJO: `localhost` NO es un entorno aparte. El .env local apunta a la MISMA
 * base de Supabase que usa Render, asi que todo lo que este script escriba es
 * produccion. El usuario se borra solo; el PADRON DE EMISORES no, porque esta
 * deliberadamente fuera del borrado de cuenta (un RUT es la misma empresa para
 * todos). Por eso este script NUNCA manda `description` con un RUT real: la
 * primera version lo nombro 'Unitex' y despues lo piso con 'Unitex devolucion'
 * —el texto de un caso de prueba— y ese nombre le aparecio a una persona
 * escaneando su ticket de verdad. El comercio ni siquiera es Unitex: es
 * Vinitex. Para el padron se usan RUTs inventados, y al final se chequea que
 * la fila del RUT real quedo como estaba.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const db = require('../db');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const PASS = `Pw-${Math.random().toString(36).slice(2, 12)}!`;

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
    console.log(`   ${ok ? 'ok   ' : 'FALLA'} ${etiqueta.padEnd(52)} ${detalle}`);
  };

  const alta = await api('POST', '/auth/register', {
    name: 'Recibo', email: `recibo-${Date.now()}@ejemplo.local`, password: PASS,
  });
  if (!alta.data?.token) { console.error('no se pudo registrar:', alta.status, alta.data); process.exit(1); }
  token = alta.data.token;

  const { rows: antes } = await db.query('SELECT nombre FROM cfe_emisores WHERE rut = $1',
    ['215080550011']);
  const padronAntes = antes[0]?.nombre || null;

  try {
    // 1. El camino feliz.
    let r = await api('POST', '/receipts/qr', { qr: QR_REAL });
    chequeo('carga el comprobante', r.status === 201 && r.data.nueva === true, `HTTP ${r.status}`);
    chequeo('con el TOTAL del QR, exacto', r.data.comprobante?.total === 1007,
      `$${r.data.comprobante?.total}`);
    chequeo('y su fecha', r.data.comprobante?.fecha === '2026-07-30', r.data.comprobante?.fecha);
    chequeo('avisa que la moneda se asumió', r.data.comprobante?.monedaAsumida === true,
      'el QR no trae moneda; el ticket la imprime pero el código no');

    // 2. LO QUE IMPORTA: escanear dos veces el mismo ticket.
    r = await api('POST', '/receipts/qr', { qr: QR_REAL });
    chequeo('escanearlo de nuevo NO duplica', r.status === 200 && r.data.nueva === false, `HTTP ${r.status}`);

    const movs = await api('GET', '/transactions');
    const deTicket = (movs.data.transactions || []).filter((t) => t.source === 'receipt');
    chequeo('queda UN solo movimiento', deTicket.length === 1, `${deTicket.length} movimiento(s)`);
    chequeo('es un gasto', deTicket[0]?.type === 'debit', deTicket[0]?.type);
    chequeo('con la clave del comprobante',
      deTicket[0]?.external_id === 'cfe|215080550011|101|A|424298', deTicket[0]?.external_id);

    // 3. Nota de crédito: plata que vuelve.
    r = await api('POST', '/receipts/qr', {
      qr: QR_REAL.replace(',101,', ',102,').replace(',424298,', ',424299,'),
    });
    chequeo('una nota de crédito entra como INGRESO',
      r.status === 201 && r.data.comprobante?.tipo?.match(/Cr[eé]dito/), r.data.comprobante?.tipo);
    const movs2 = await api('GET', '/transactions');
    const nc = (movs2.data.transactions || [])
      .find((t) => t.external_id === 'cfe|215080550011|102|A|424299');
    chequeo('...y queda como credit', nc?.type === 'credit', nc?.type);

    // 4. Un QR cualquiera.
    r = await api('POST', '/receipts/qr', { qr: 'https://www.google.com' });
    chequeo('un QR que no es comprobante se rechaza', r.status === 422, `HTTP ${r.status}`);
    chequeo('...explicando dónde buscar el correcto', /Cód. de Seguridad/.test(r.data?.detail || ''),
      r.data?.detail ? 'sí' : 'sin detalle');

    // 5. La capacidad falsa de /upload.
    // /upload esta detras del gate premium, asi que un usuario libre choca con
    // el 403 antes de llegar al chequeo de imagen. Se marca premium en la base:
    // lo que se prueba aca no es el gate.
    await db.query("UPDATE users SET plan = 'premium', plan_expires_at = NOW() + INTERVAL '1 day' WHERE email = $1",
      [alta.data.user.email]);
    r = await api('POST', '/upload', {
      encryptedData: 'x', encryptedKey: 'x', iv: 'x', mimeType: 'image/jpeg', filename: 'ticket.jpg',
    });
    chequeo('una foto en /upload ya no dice "no se pudo leer el PDF"',
      r.status === 422 && /fotos/i.test(r.data?.error || ''), r.data?.error || `HTTP ${r.status}`);
    // 6. EL PADRON COMPARTIDO. El QR trae el RUT, nunca el nombre, asi que sin
    //    esto cada ticket entra como "Comprobante 215080550011". Lo que se
    //    verifica es que nombrarlo UNA vez alcance — incluso para otra persona.
    const RUT_NUEVO = '219999999999';
    const qrNuevo = QR_REAL.replace('215080550011', RUT_NUEVO);
    await db.query('DELETE FROM cfe_emisores WHERE rut = $1', [RUT_NUEVO]);

    r = await api('POST', '/receipts/qr', { qr: qrNuevo });
    chequeo('un comercio nuevo entra sin nombre', r.data.comprobante?.emisorConocido === false,
      'la app pregunta una sola vez');

    r = await api('POST', '/receipts/qr', { qr: qrNuevo, description: 'Ferreteria del Barrio' });
    chequeo('nombrarlo actualiza, no duplica', r.data.nueva === false, `HTTP ${r.status}`);
    chequeo('...y el movimiento queda nombrado',
      r.data.comprobante?.emisorNombre === 'Ferreteria del Barrio', r.data.comprobante?.emisorNombre);

    // OTRO usuario, mismo RUT: tiene que venir nombrado sin preguntar.
    const tokenViejo = token;
    const otro = await api('POST', '/auth/register', {
      name: 'Otro', email: `otro-${Date.now()}@ejemplo.local`, password: PASS,
    });
    token = otro.data.token;
    r = await api('POST', '/receipts/qr', { qr: qrNuevo });
    chequeo('OTRA persona ya lo ve nombrado',
      r.data.comprobante?.emisorConocido === true
      && r.data.comprobante?.emisorNombre === 'Ferreteria del Barrio',
      r.data.comprobante?.emisorNombre);
    await api('DELETE', '/account', { password: PASS });
    token = tokenViejo;

    // El padron es global y NO pertenece a nadie: borrar la cuenta no se lo lleva.
    const { rows: quedan } = await db.query('SELECT nombre FROM cfe_emisores WHERE rut = $1', [RUT_NUEVO]);
    chequeo('borrar una cuenta no borra el padron', quedan.length === 1,
      'un RUT es la misma empresa para todos');
    await db.query('DELETE FROM cfe_emisores WHERE rut = $1', [RUT_NUEVO]);
    // LO QUE ESTE SCRIPT NO PUEDE HACER: dejar nombrado un RUT real. El padron
    // es global y sobrevive al borrado de la cuenta de prueba, asi que un nombre
    // escrito aca se le aparece a cualquiera que escanee en ese comercio.
    const { rows: despues } = await db.query('SELECT nombre FROM cfe_emisores WHERE rut = $1',
      ['215080550011']);
    chequeo('no ensucia el padron con el RUT real',
      (despues[0]?.nombre || null) === padronAntes,
      padronAntes === null ? 'sigue sin nombre' : `sigue como "${padronAntes}"`);

  } finally {
    await api('DELETE', '/account', { password: PASS });
  }

  console.log(`\n${fallas === 0
    ? 'TODO OK: el comprobante entra una sola vez, con el importe exacto'
    : `${fallas} chequeos fallaron`}`);
  process.exit(fallas === 0 ? 0 : 1);
})().catch((e) => { console.error('error:', e.message); process.exit(1); });
