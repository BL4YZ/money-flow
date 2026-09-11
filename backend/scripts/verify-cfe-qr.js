/**
 * El QR de un comprobante fiscal: ¿se lee bien y rechaza lo que no es?
 *
 *   node scripts/verify-cfe-qr.js
 *
 * El caso principal es un QR REAL, decodificado de la foto de un e-Ticket de
 * Unitex/CONAPLUS. Los seis campos se cruzaron contra lo impreso en el papel:
 * RUT, serie A, número 424298, total 1.007,00, fecha 30/07/2026, y el
 * "Cód. de Seguridad: nh2847" que es el prefijo del hash.
 *
 * No corre ningún decodificador de imágenes: eso pasa en el teléfono. Acá se
 * verifica el parseo del texto, que es lo que hace el servidor.
 */
const { parseCfeQr } = require('../services/cfeQr');

// Tal cual salió del QR de la foto.
const REAL = 'https://www.efactura.dgi.gub.uy/consultaQR/cfe?215080550011,101,A,424298,1007.00,20260730,nh28472Ha%2FIdlJGEd%2BYJdXTUBp8%3D';

let fallas = 0;
const chequeo = (etiqueta, ok, detalle = '') => {
  if (!ok) fallas++;
  console.log(`   ${ok ? 'ok   ' : 'FALLA'} ${etiqueta.padEnd(50)} ${detalle}`);
};

console.log('\nQR real de un e-Ticket (Unitex/CONAPLUS)\n');
const r = parseCfeQr(REAL);

chequeo('lo reconoce como comprobante', !!r, r ? '' : 'devolvió null');
if (r) {
  chequeo('RUT del emisor', r.rutEmisor === '215080550011', r.rutEmisor);
  chequeo('tipo de comprobante', r.tipoCfe === 101 && r.tipoNombre === 'e-Ticket', `${r.tipoCfe} ${r.tipoNombre}`);
  chequeo('serie y número', r.serie === 'A' && r.numero === '424298', `${r.serie} ${r.numero}`);
  chequeo('TOTAL exacto, sin OCR', r.total === 1007, `$${r.total}`);
  chequeo('fecha en ISO', r.date === '2026-07-30', r.date);
  chequeo('hash decodificado (%2F → /, %3D → =)',
    r.hash === 'nh28472Ha/IdlJGEd+YJdXTUBp8=', r.hash);
  chequeo('el código impreso es el prefijo del hash',
    r.hash.startsWith('nh2847'), 'en el papel dice "Cód. de Seguridad: nh2847"');
  chequeo('un e-Ticket es un gasto', r.type === 'debit', r.type);
  chequeo('clave única para no duplicar',
    r.externalId === 'cfe|215080550011|101|A|424298', r.externalId);
}

console.log('\nUna nota de crédito devuelve plata, no la gasta\n');
const nc = parseCfeQr(REAL.replace(',101,', ',102,'));
chequeo('nota de crédito → ingreso', nc && nc.type === 'credit', nc && nc.type);
chequeo('...y se nombra distinto', nc && /Cr[eé]dito/i.test(nc.tipoNombre), nc && nc.tipoNombre);

console.log('\nLo que NO es un comprobante tiene que dar null, sin explotar\n');
const basura = [
  ['texto suelto',          'hola que tal'],
  ['una URL cualquiera',    'https://www.google.com'],
  ['otro host con el mismo formato', 'https://malicioso.com/consultaQR/cfe?215080550011,101,A,424298,1007.00,20260730,x'],
  ['campos de menos',       'https://www.efactura.dgi.gub.uy/consultaQR/cfe?215080550011,101,A'],
  ['RUT que no es RUT',     'https://www.efactura.dgi.gub.uy/consultaQR/cfe?123,101,A,424298,1007.00,20260730,x'],
  ['fecha inválida',        'https://www.efactura.dgi.gub.uy/consultaQR/cfe?215080550011,101,A,424298,1007.00,30-07-2026,x'],
  ['total no numérico',     'https://www.efactura.dgi.gub.uy/consultaQR/cfe?215080550011,101,A,424298,mil,20260730,x'],
  ['vacío',                 ''],
  ['null',                  null],
];
for (const [etiqueta, entrada] of basura) {
  let out, exploto = false;
  try { out = parseCfeQr(entrada); } catch (_) { exploto = true; }
  chequeo(etiqueta, !exploto && out === null, exploto ? 'LANZÓ EXCEPCIÓN' : `devolvió ${JSON.stringify(out)}`);
}

console.log(`\n${fallas === 0
  ? 'TODO OK: el QR da importe y fecha exactos, y una clave para no duplicar'
  : `${fallas} chequeos fallaron`}\n`);
process.exit(fallas === 0 ? 0 : 1);
