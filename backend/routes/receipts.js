const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { parseCfeQr } = require('../services/cfeQr');
const { categorize } = require('../services/categorizer');
const { getUsdToUyuRateOn } = require('../services/exchangeRate');

const router = express.Router();
router.use(authMiddleware);

// ─── POST /api/receipts/qr ────────────────────────────────────
//
// Un comprobante escaneado se convierte en un movimiento.
//
// Llega el TEXTO del QR, no la imagen: lo decodifica el teléfono con su escáner
// nativo. Ver services/cfeQr.js para por qué (resumen: es mejor que cualquier
// librería JS, corrige el encuadre en vivo, y así el servidor no necesita
// OpenCV — que en los 512 MB de Render no entra).
//
// ES IDEMPOTENTE, y eso es el punto: el `external_id` sale de
// RUT+tipo+serie+número, que identifica el comprobante de forma única en todo
// el país. Escanear dos veces el mismo ticket —o que lo escaneen dos personas
// de la misma casa— no puede cargar el gasto dos veces.
router.post('/qr', [
  body('qr').isString().notEmpty(),
  body('description').optional().isString().trim(),
  body('currency').optional().isIn(['UYU', 'USD']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const cfe = parseCfeQr(req.body.qr);
  if (!cfe) {
    // No es un error del usuario: apuntó la cámara a algo que no es un
    // comprobante. Se dice qué pasó, sin tratarlo como falla.
    return res.status(422).json({
      error: 'Ese QR no es un comprobante fiscal',
      detail: 'Buscá el código que está al pie del ticket, cerca de "Cód. de Seguridad".',
    });
  }

  try {
    // EL NOMBRE DEL COMERCIO NO VIENE EN EL QR, sólo el RUT. Se busca en el
    // padrón compartido: si alguien ya nombró ese RUT, este escaneo entra
    // nombrado sin preguntar nada. Es la diferencia entre "Unitex" y
    // "Comprobante 215080550011" en la lista de movimientos.
    const dado = (req.body.description || '').trim();
    const { rows: conocidos } = await db.query(
      'SELECT nombre FROM cfe_emisores WHERE rut = $1', [cfe.rutEmisor],
    );
    const nombreConocido = conocidos[0]?.nombre || null;

    // Si lo nombran acá y no estaba, queda para todos. Lo que el usuario escribe
    // gana sobre lo guardado: quien está mirando el ticket sabe más.
    if (dado && dado !== nombreConocido) {
      await db.query(
        `INSERT INTO cfe_emisores (rut, nombre) VALUES ($1, $2)
         ON CONFLICT (rut) DO UPDATE SET nombre = EXCLUDED.nombre, updated_at = NOW()`,
        [cfe.rutEmisor, dado.slice(0, 120)],
      ).catch(() => {});   // que falle el padrón no puede tumbar el movimiento
    }

    const descripcion = dado || nombreConocido || `Comprobante ${cfe.rutEmisor}`;

    // EL QR NO TRAE LA MONEDA. El ticket la imprime ("Moneda: UYU") pero no va
    // en el código, así que un comprobante en dólares entraría como pesos si se
    // asumiera. Se acepta del cliente y, sin dato, se asume UYU —que es lo
    // abrumadoramente común— pero queda anotado como supuesto, no como hecho.
    const moneda = req.body.currency === 'USD' ? 'USD' : 'UYU';
    const cotizacion = moneda === 'USD' ? await getUsdToUyuRateOn(cfe.date) : 1;

    const r = await db.query(
      `INSERT INTO transactions
         (user_id, date, description, amount, type, category, source, external_id, currency, rate_uyu, raw_text)
       VALUES ($1, $2, $3, $4, $5, $6, 'receipt', $7, $8, $9, $10)
       ON CONFLICT (user_id, external_id) WHERE external_id IS NOT NULL
       DO UPDATE SET
         description = EXCLUDED.description,
         amount      = EXCLUDED.amount,
         type        = EXCLUDED.type,
         category    = EXCLUDED.category,
         currency    = EXCLUDED.currency,
         rate_uyu    = EXCLUDED.rate_uyu
       RETURNING id, (xmax = 0) AS es_nueva`,
      [
        req.userId, cfe.date, descripcion, cfe.total, cfe.type,
        categorize(descripcion), cfe.externalId, moneda, cotizacion,
        // La URL de verificación de la DGI: deja comprobar el comprobante
        // después. Es del comercio, no del usuario — no hay dato personal acá.
        cfe.verificacion,
      ],
    );

    res.status(r.rows[0].es_nueva ? 201 : 200).json({
      nueva: r.rows[0].es_nueva,
      transactionId: r.rows[0].id,
      comprobante: {
        emisor: cfe.rutEmisor,
        // La app usa esto para preguntar el nombre UNA vez por comercio, en vez
        // de pedirlo en cada escaneo o dejarlo como un RUT para siempre.
        emisorNombre: dado || nombreConocido || null,
        emisorConocido: !!(dado || nombreConocido),
        tipo: cfe.tipoNombre,
        serie: cfe.serie,
        numero: cfe.numero,
        total: cfe.total,
        fecha: cfe.date,
        currency: moneda,
        monedaAsumida: !req.body.currency,
        verificacion: cfe.verificacion,
      },
    });
  } catch (err) {
    console.error('POST /receipts/qr error:', err.message);
    res.status(500).json({ error: 'Error al guardar el comprobante' });
  }
});

module.exports = router;
