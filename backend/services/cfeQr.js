/**
 * El QR de un comprobante fiscal uruguayo (CFE de la DGI).
 *
 * Todo e-Ticket y toda e-Factura traen un QR impreso que apunta al servicio de
 * verificación de la DGI, con los datos en la query separados por comas:
 *
 *   https://www.efactura.dgi.gub.uy/consultaQR/cfe?
 *     215080550011,101,A,424298,1007.00,20260730,nh28472Ha%2FIdlJGEd%2BYJdXTUBp8%3D
 *     └ RUT emisor  └tipo └serie └número └total  └fecha   └hash de seguridad
 *
 * POR QUÉ ESTO IMPORTA MÁS QUE LEER EL TICKET. El importe y la fecha salen
 * EXACTOS: no hay OCR que se equivoque de coma, ni foto torcida, ni papel
 * térmico lavado. Y `RUT+tipo+serie+número` identifica el comprobante de forma
 * única en todo el país, que es exactamente la clave que hace falta para no
 * cargar dos veces la misma compra.
 *
 * Verificado contra un ticket real: los seis campos coinciden con lo impreso,
 * incluido el "Cód. de Seguridad: nh2847" que es el prefijo del hash.
 *
 * LO QUE EL QR NO TRAE: los productos, la forma de pago y el desglose de IVA.
 * Para eso sigue haciendo falta leer la imagen — pero con el total del QR como
 * ancla, así que un error de lectura se detecta en vez de guardarse.
 *
 * ESTE MÓDULO NO DECODIFICA IMÁGENES, y es a propósito. El QR se lee en el
 * teléfono con el escáner nativo (mejor que cualquier librería JS, y con
 * feedback en vivo para reencuadrar). Acá sólo llega el texto ya decodificado,
 * así que el servidor no necesita OpenCV ni nada pesado — que en el plan
 * gratuito de Render, con 512 MB, no entraría.
 */

const HOST_DGI = 'efactura.dgi.gub.uy';

// Tipos de CFE. Los 10x son de consumo final (e-Ticket) y los 11x con RUT
// comprador (e-Factura). Las notas de CRÉDITO devuelven plata: van como ingreso,
// no como gasto, y confundirlas invierte el signo del movimiento.
const TIPOS = {
  101: { nombre: 'e-Ticket',                        signo: 'debit'  },
  102: { nombre: 'Nota de Crédito de e-Ticket',     signo: 'credit' },
  103: { nombre: 'Nota de Débito de e-Ticket',      signo: 'debit'  },
  111: { nombre: 'e-Factura',                       signo: 'debit'  },
  112: { nombre: 'Nota de Crédito de e-Factura',    signo: 'credit' },
  113: { nombre: 'Nota de Débito de e-Factura',     signo: 'debit'  },
};

/**
 * Devuelve los datos del comprobante, o null si el texto no es un QR de la DGI.
 *
 * Null y no una excepción: por acá va a pasar cualquier cosa que el usuario
 * apunte con la cámara — el QR de una gaseosa, un link, un WhatsApp — y eso no
 * es un error del que haya que avisar, es simplemente "no es un comprobante".
 */
function parseCfeQr(texto) {
  if (!texto || typeof texto !== 'string') return null;

  let url;
  try {
    url = new URL(texto.trim());
  } catch (_) {
    return null;
  }
  // El host se verifica: un QR que imite el formato pero apunte a otro lado no
  // es un comprobante de la DGI.
  if (!url.hostname.toLowerCase().endsWith(HOST_DGI)) return null;

  // La query viene como un solo valor separado por comas, no como pares
  // clave=valor, así que se toma cruda y se decodifica a mano.
  const crudo = decodeURIComponent(url.search.replace(/^\?/, ''));
  const partes = crudo.split(',');
  if (partes.length < 6) return null;

  const [rut, tipoStr, serie, numero, totalStr, fecha] = partes.map((p) => p.trim());
  // El hash puede contener comas codificadas: lo que sobra se vuelve a unir.
  const hash = partes.slice(6).join(',').trim() || null;

  const tipo = parseInt(tipoStr, 10);
  const total = parseFloat(totalStr);

  // Validaciones de forma. Si algo no cuadra es que no era un QR de CFE, o que
  // vino cortado — en los dos casos, mejor null que datos a medias.
  if (!/^\d{12}$/.test(rut)) return null;
  if (!Number.isFinite(tipo)) return null;
  if (!Number.isFinite(total) || total < 0) return null;
  if (!/^\d{8}$/.test(fecha)) return null;
  if (!serie || !numero) return null;

  const meta = TIPOS[tipo] || { nombre: `Comprobante ${tipo}`, signo: 'debit' };

  return {
    rutEmisor: rut,
    tipoCfe: tipo,
    tipoNombre: meta.nombre,
    type: meta.signo,
    serie,
    numero,
    total,
    // ISO para que entre directo en la columna `date`.
    date: `${fecha.slice(0, 4)}-${fecha.slice(4, 6)}-${fecha.slice(6, 8)}`,
    hash,
    // Clave de idempotencia: RUT + tipo + serie + número es único en el país.
    // Mismo rol que el `external_id` del resumen bancario, y por eso el mismo
    // formato de prefijo — así se ve de dónde vino cada fila.
    externalId: `cfe|${rut}|${tipo}|${serie}|${numero}`,
    // La URL sirve para que el usuario verifique el comprobante en la DGI.
    verificacion: texto.trim(),
  };
}

module.exports = { parseCfeQr, TIPOS };
