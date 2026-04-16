const express = require('express');
const multer = require('multer');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { extractTextFromPDF, parseTransactions } = require('../services/ocrParser');
const { detectSubscriptions } = require('../services/subscriptionDetector');
const { categorize } = require('../services/categorizer');

const router = express.Router();
router.use(authMiddleware);

// Multer: almacena en memoria (no en disco), max 20MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se aceptan PDFs e imágenes'));
    }
  },
});

// ─── POST /api/upload ─────────────────────────────────────────
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Archivo requerido' });
  }

  try {
    // 1. Extraer texto del PDF/imagen
    const text = await extractTextFromPDF(req.file.buffer);

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
    if (err.message.includes('Solo se aceptan')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Error procesando el archivo: ' + err.message });
  }
});

module.exports = router;
