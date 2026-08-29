const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const requirePremium = require('../middleware/requirePremium');
const { extractTextFromPDF, parseTransactions } = require('../services/ocrParser');
const { detectSubscriptions } = require('../services/subscriptionDetector');
const { categorize } = require('../services/categorizer');
const { getPublicKeyPem, decryptAesKey } = require('../services/uploadKeys');

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
    // Wrong key/IV, or corrupted/mismatched RSA-encrypted key → decrypt throws
    const decryptErrors = ['bad decrypt', 'wrong final block length', 'oaep', 'decoding error'];
    if (decryptErrors.some(m => err.message.toLowerCase().includes(m))) {
      return res.status(400).json({ error: 'Error al descifrar el archivo' });
    }
    res.status(500).json({ error: 'Error procesando el archivo: ' + err.message });
  }
});

module.exports = router;
