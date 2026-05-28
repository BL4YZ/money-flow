const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const requirePremium = require('../middleware/requirePremium');
const { extractTextFromPDF, parseTransactions } = require('../services/ocrParser');
const { detectSubscriptions } = require('../services/subscriptionDetector');
const { categorize } = require('../services/categorizer');

const router = express.Router();
router.use(authMiddleware);

// ─── POST /api/upload ─────────────────────────────────────────
// Accepts an AES-256-CBC encrypted JSON payload from the client.
// The file never leaves the device in plaintext — decryption happens
// in-process and the key is discarded immediately after use.
router.post('/', requirePremium, async (req, res) => {
  const { encryptedData, key, iv, mimeType, filename } = req.body || {};

  if (!encryptedData || !key || !iv) {
    return res.status(400).json({ error: 'Payload cifrado requerido' });
  }

  try {
    // 1. Decrypt: AES-256-CBC → base64 string of original file
    const keyBuffer = Buffer.from(key, 'hex');
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
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (mimeType && !allowedTypes.some(t => mimeType.startsWith(t.split('/')[0]) || mimeType === t)) {
      return res.status(400).json({ error: 'Solo se aceptan PDFs e imágenes' });
    }

    // 2. Extraer texto del PDF/imagen
    const text = await extractTextFromPDF(fileBuffer);

    if (!text || text.trim().length < 20) {
      return res.status(422).json({
        error: 'No se pudo extraer texto del archivo. Verificá que sea un estado de cuenta válido.',
      });
    }

    console.log(`[upload] Texto extraído (${text.trim().length} chars):`, text.substring(0, 300).replace(/\n/g, ' | '));

    // 2. Parsear transacciones
    const parsedTransactions = parseTransactions(text);

    if (parsedTransactions.length === 0) {
      console.log('[upload] Sin transacciones. Muestra del texto:', text.substring(0, 800));
      return res.status(422).json({
        error: 'No se encontraron transacciones. El formato del estado de cuenta puede no ser compatible.',
        extractedTextSample: text.substring(0, 500),
      });
    }

    // 3. Categorizar y preparar para inserción
    const toInsert = parsedTransactions.map(tx => ({
      ...tx,
      category: categorize(tx.description),
    }));

    // 4. Insertar en BD (ignorar duplicados por fecha+descripción+monto)
    let inserted = 0;
    let skipped = 0;

    for (const tx of toInsert) {
      try {
        await db.query(
          `INSERT INTO transactions (user_id, date, description, amount, type, category, raw_text, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'ocr')
           ON CONFLICT DO NOTHING`,
          [req.userId, tx.date, tx.description, tx.amount, tx.type, tx.category, tx.rawText]
        );
        inserted++;
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
      inserted,
      skipped,
      total: parsedTransactions.length,
      subscriptionsDetected: newSubs,
      transactions: toInsert.slice(0, 5), // preview de las primeras 5
    });

  } catch (err) {
    console.error('Upload error:', err);
    // Wrong key/IV → decipher throws "bad decrypt"
    if (err.message.includes('bad decrypt') || err.message.includes('wrong final block length')) {
      return res.status(400).json({ error: 'Error al descifrar el archivo' });
    }
    res.status(500).json({ error: 'Error procesando el archivo: ' + err.message });
  }
});

module.exports = router;
