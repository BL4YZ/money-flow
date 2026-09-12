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

// LA FECHA NO VIENE SIEMPRE IGUAL, y esto es la regresión de un escaneo que
// falló de verdad: un segundo comprobante, mismo servicio de la DGI y misma
// query, con la fecha como `30/07/2026` en vez de `20260730`. El parser exigía
// ocho dígitos y la app decía "ese QR no es un comprobante" sobre uno válido.
// Peor: este archivo afirmaba que `30-07-2026` era basura. Lo era en mi cabeza.
//
// El QR de abajo es el real salvo RUT, número, total y hash — cambiados porque
// identifican la compra de una persona y esto es un repo público. La FECHA es
// textual, que es lo que está bajo prueba.
console.log('\nLa misma fecha, escrita como la escribe el otro emisor\n');
const CON_BARRAS = 'https://www.efactura.dgi.gub.uy/consultaQR/cfe?219999999999,101,A,455724,544.00,30/07/2026,FxkQRM1Gfzd1YnkdOfhtT4bkwZI%3d';
const b = parseCfeQr(CON_BARRAS);
chequeo('dd/mm/aaaa también es un comprobante', !!b, b ? '' : 'devolvió null');
chequeo('...y da la MISMA fecha que aaaammdd', b && b.date === '2026-07-30', b && b.date);
chequeo('el total sale exacto igual', b && b.total === 544, b && `$${b.total}`);
chequeo('el código impreso sigue siendo el prefijo del hash',
  b && b.hash.startsWith('FxkQRM'), 'en el papel dice "Código Seguridad: FxkQRM"');

// El día va PRIMERO. En Uruguay se escribe así siempre — el mismo ticket pone
// "29/06/2028" como vencimiento. Leerlo al revés cargaría el gasto en otro mes
// sin que nada avisara.
const amb = parseCfeQr(CON_BARRAS.replace(',30/07/2026,', ',05/07/2026,'));
chequeo('05/07/2026 es el 5 de julio, no el 7 de mayo', amb && amb.date === '2026-07-05', amb && amb.date);

// Con guiones y en ISO: dos formas más que no cuesta nada aceptar.
chequeo('con guiones también',
  parseCfeQr(CON_BARRAS.replace(',30/07/2026,', ',30-07-2026,'))?.date === '2026-07-30', '30-07-2026');
chequeo('y en ISO también',
  parseCfeQr(CON_BARRAS.replace(',30/07/2026,', ',2026-07-30,'))?.date === '2026-07-30', '2026-07-30');

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
  ['fecha que no existe',   'https://www.efactura.dgi.gub.uy/consultaQR/cfe?215080550011,101,A,424298,1007.00,31/02/2026,x'],
  ['mes 13',                'https://www.efactura.dgi.gub.uy/consultaQR/cfe?215080550011,101,A,424298,1007.00,30/13/2026,x'],
  ['fecha con letras',      'https://www.efactura.dgi.gub.uy/consultaQR/cfe?215080550011,101,A,424298,1007.00,ayer,x'],
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
