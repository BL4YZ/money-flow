const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const requirePremium = require('../middleware/requirePremium');
const { extractTextFromPDF, parseTransactions, parseCSVTransactions, pareceCSV } = require('../services/ocrParser');
const { detectSubscriptions } = require('../services/subscriptionDetector');
const { categorize } = require('../services/categorizer');
const { getPublicKeyPem, decryptAesKey } = require('../services/uploadKeys');
const { getUsdToUyuRateOn } = require('../services/exchangeRate');

const router = express.Router();
router.use(authMiddleware);

// ─── GET /api/upload/public-key ────────────────────────────────
// RSA-2048 public key used by the client to encrypt the AES key before
// sending it (hybrid encryption). This is public data by design — safe
// to expose to any authenticated client.
router.get('/public-key', (req, res) => {
  try {
    res.json({ publicKey: getPublicKeyPem() });
  } catch (err) {
    console.error('[upload] public-key error:', err.message);
    res.status(500).json({ error: 'Servicio de cifrado no disponible' });
  }
});

// ─── POST /api/upload ─────────────────────────────────────────
// Hybrid encryption: the client encrypts the file with a fresh AES-256
// key (AES-256-CBC), then encrypts that key with the server's RSA public
// key (OAEP/SHA-256) so the AES key travels protected even if the request
// body itself is ever logged or intercepted somewhere along the way —
// only this server's private key can recover it. Decryption happens
// in-process and the key is discarded immediately after use.
router.post('/', requirePremium, async (req, res) => {
  const { encryptedData, encryptedKey, iv, mimeType, filename } = req.body || {};

  if (!encryptedData || !encryptedKey || !iv) {
    return res.status(400).json({ error: 'Payload cifrado requerido' });
  }

  // UNA IMAGEN NO ES UN PDF, y hasta acá se le pasaba igual a pdf-parse.
  //
  // La lista de tipos aceptados incluye image/jpeg, image/png y image/webp, y el
  // selector de archivos de la app ofrece `image/*` — o sea que la foto de un
  // ticket se podía elegir y el error que salía era "no se pudo leer el PDF".
  // Una capacidad anunciada que no existía, igual que el "con IA avanzada" que
  // hubo que sacar del texto.
  //
  // Va ANTES de descifrar: el mimeType viene en el request, no en el contenido,
  // así que no hay razón para gastar un RSA en algo que se va a rechazar.
  //
  // Mientras la lectura de imágenes no esté, el error dice la verdad y manda al
  // camino que SÍ funciona: el escáner del comprobante, que además saca el
  // importe exacto del QR en vez de adivinarlo de la foto.
  if ((mimeType || '').startsWith('image/')) {
    return res.status(422).json({
      error: 'Todavía no leemos fotos acá',
      detail: 'Para un ticket, usá el escáner: leyendo el QR del comprobante el importe sale exacto. Los resúmenes del banco van en CSV o PDF.',
    });
  }

  try {
    // 1. Recover the AES key (RSA-OAEP) then decrypt: AES-256-CBC → base64 string of original file
    const keyBuffer = decryptAesKey(encryptedKey);
    const ivBuffer  = Buffer.from(iv, 'hex');

    // encryptedData is a Base64-encoded OpenSSL-compatible ciphertext (CryptoJS format)
    // Strip the "Salted__" prefix if present (CryptoJS passphrase mode); for key+iv mode it's raw base64.
    const cipherBuffer = Buffer.from(encryptedData, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, ivBuffer);
    const decrypted = Buffer.concat([decipher.update(cipherBuffer), decipher.final()]);

    // decrypted is the UTF-8 base64 string of the original file
    const base64Str = decrypted.toString('utf8');
    const fileBuffer = Buffer.from(base64Str, 'base64');

    // Validate file type
    const allowedTypes = [
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
      'text/csv', 'text/comma-separated-values', 'application/csv',
      'application/vnd.ms-excel',   // lo que manda Windows para un .csv
    ];
    const esCSV = pareceCSV(fileBuffer, mimeType, filename);
    if (!esCSV && mimeType && !allowedTypes.some((t) => mimeType.startsWith(t.split('/')[0]) || mimeType === t)) {
      return res.status(400).json({ error: 'Solo se aceptan PDFs, imágenes o CSV' });
    }

    // 2. Extraer movimientos.
    //
    // El CSV va por su propio camino y no pasa por pdf-parse: el banco ya lo
    // entrega estructurado. Verificado contra un resumen real de Santander —
    // el CSV da 16 movimientos y el mismo resumen en PDF da 0, porque el texto
    // sale tabulado y ninguno de los tres parsers de PDF lo reconoce.
    let parsedTransactions;
    if (esCSV) {
      parsedTransactions = parseCSVTransactions(fileBuffer);
      if (parsedTransactions.length === 0) {
        return res.status(422).json({
          error: 'No se encontraron movimientos en el CSV. Verificá que sea el resumen de cuenta y no otro archivo.',
        });
      }
    } else {
      const text = await extractTextFromPDF(fileBuffer);

      if (!text || text.trim().length < 20) {
        return res.status(422).json({
          error: 'No se pudo extraer texto del archivo. Verificá que sea un estado de cuenta válido.',
        });
      }

      // NO SE LOGUEA EL CONTENIDO. Acá había dos console.log que escribían los
      // primeros 300 y 800 caracteres del resumen — nombre del titular, número
      // de cuenta y movimientos — a los logs de Render. Todo el pipeline usa
      // RSA+AES para que un request filtrado no sea descifrable, y esto lo
      // anulaba escribiendo el plaintext al lado. Sólo va el tamaño.
      console.log(`[upload] texto extraído: ${text.trim().length} chars`);

      parsedTransactions = parseTransactions(text);
    }

    if (parsedTransactions.length === 0) {
      // Sin muestra del texto, ni en el log ni en la respuesta. `text` acá es
      // el resumen del usuario: los 800 caracteres que se escribían al log y
      // los 500 que viajaban en el JSON traían el nombre del titular, el
      // número de cuenta y los movimientos. Que la respuesta de error lleve
      // datos financieros es peor todavía que loguearlos: sale por la red y
      // queda en cualquier proxy o herramienta de errores del camino.
      return res.status(422).json({
        error: 'No se encontraron transacciones. El formato del estado de cuenta puede no ser compatible. Probá con el CSV en vez del PDF.',
      });
    }

    // 3. Categorizar y resolver la moneda de cada movimiento.
    //
    // Un resumen es de UNA cuenta, y en Uruguay la gente tiene una en pesos y
    // otra en dolares. La moneda sale del preambulo del archivo; si el cliente
    // la manda explicita, gana la del cliente (el usuario esta mirando su propio
    // resumen y sabe cual es). Si no hay ninguna de las dos, se asume UYU.
    const monedaDelArchivo = req.body.currency
      || parsedTransactions.find((t) => t.currency)?.currency
      || 'UYU';

    // La cotizacion se congela en la FECHA DE CADA MOVIMIENTO, no en la de hoy:
    // con la de hoy, un gasto en dolares de enero cambia de valor cada vez que
    // se mira. Se pide una sola vez por fecha distinta — exchangeRate cachea por
    // fecha porque la cotizacion de un dia pasado no cambia nunca.
    const cotizaciones = new Map();
    if (monedaDelArchivo === 'USD') {
      const fechas = [...new Set(parsedTransactions.map((t) => t.date))];
      await Promise.all(fechas.map(async (f) => {
        cotizaciones.set(f, await getUsdToUyuRateOn(f));
      }));
    }

    const toInsert = parsedTransactions.map(tx => ({
      ...tx,
      category: categorize(tx.description),
      currency: monedaDelArchivo,
      rateUyu: monedaDelArchivo === 'USD' ? (cotizaciones.get(tx.date) || 1) : 1,
    }));

    // 4. Insertar en BD (ignorar duplicados por fecha+descripción+monto)
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const tx of toInsert) {
      try {
        // Volver a subir el mismo resumen ACTUALIZA en vez de duplicar. No es
        // un detalle: el import anterior podía traer importes equivocados —
        // pasó de verdad, con la columna de saldo leída como monto— y la única
        // forma de arreglarlo desde la app es volver a subir el archivo.
        //
        // La clave NO incluye el importe justamente por eso: si lo incluyera,
        // un monto corregido no coincidiría con la fila vieja y se insertaría
        // al lado en vez de repararla.
        //
        // `xmax = 0` distingue una inserción de una actualización, para poder
        // decirle al usuario qué pasó de verdad. Antes se contaba `inserted++`
        // aunque el ON CONFLICT no hubiera insertado nada.
        const r = await db.query(
          `INSERT INTO transactions (user_id, date, description, amount, type, category, raw_text, source, external_id, currency, rate_uyu)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'ocr', $8, $9, $10)
           ON CONFLICT (user_id, external_id) WHERE external_id IS NOT NULL
           DO UPDATE SET
             description = EXCLUDED.description,
             amount      = EXCLUDED.amount,
             type        = EXCLUDED.type,
             category    = EXCLUDED.category,
             currency    = EXCLUDED.currency,
             rate_uyu    = EXCLUDED.rate_uyu
           RETURNING (xmax = 0) AS es_nueva`,
          [req.userId, tx.date, tx.description, tx.amount, tx.type, tx.category, tx.rawText, tx.externalId || null,
           tx.currency, tx.rateUyu]
        );
        if (r.rows[0] && r.rows[0].es_nueva) inserted++;
        else updated++;
      } catch (err) {
        skipped++;
      }
    }

    // 5. Detectar suscripciones automáticamente
    const detectedSubs = detectSubscriptions(toInsert);
    let newSubs = 0;

    for (const sub of detectedSubs) {
      try {
        await db.query(
          `INSERT INTO subscriptions (user_id, name, amount, cancel_url, last_charged, auto_detected)
           VALUES ($1, $2, $3, $4, $5, true)
           ON CONFLICT DO NOTHING`,
          [req.userId, sub.name, sub.amount, sub.cancelUrl, sub.lastCharged]
        );
        newSubs++;
      } catch (_) {}
    }

    res.json({
      success: true,
      // Que moneda se uso, para que la app pueda avisarlo en vez de que el
      // usuario descubra despues que su resumen en dolares entro como pesos.
      currency: monedaDelArchivo,
      currencyDetected: !!parsedTransactions.find((t) => t.currency),
      inserted,
      updated,
      skipped,
      total: parsedTransactions.length,
      subscriptionsDetected: newSubs,
      transactions: toInsert.slice(0, 5), // preview de las primeras 5
    });

  } catch (err) {
    console.error('Upload error:', err);
    // Wrong key/IV, or corrupted/mismatched RSA-encrypted key → decrypt throws
    const decryptErrors = ['bad decrypt', 'wrong final block length', 'oaep', 'decoding error'];
    if (decryptErrors.some(m => err.message.toLowerCase().includes(m))) {
      return res.status(400).json({ error: 'Error al descifrar el archivo' });
    }
    res.status(500).json({ error: 'Error procesando el archivo: ' + err.message });
  }
});

module.exports = router;
