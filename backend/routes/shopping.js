const express = require('express');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const requirePremium = require('../middleware/requirePremium');
const { scrapeAll } = require('../services/scraper');

const router = express.Router();
router.use(authMiddleware);

// ─── Normalización y relevancia ───────────────────────────────────

// Palabras vacías que no aportan a la búsqueda (artículos, preposiciones)
const STOP_WORDS = new Set([
  'de', 'con', 'para', 'el', 'la', 'los', 'las', 'un', 'una',
  'en', 'y', 'o', 'al', 'del', 'sin', 'por', 'su',
]);

// Normaliza texto: quita tildes, expande abreviaturas de volumen
function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quitar tildes
    .replace(/\b(\d+)\s*litros?\b/g, '$1l')   // "3 litros" → "3l"
    .replace(/\b(\d+)\s*lts?\b/g, '$1l')       // "3lt" → "3l"
    .replace(/\b(\d+)\s*mililitros?\b/g, '$1ml')
    .replace(/\b(\d+)\s*kilos?\b/g, '$1kg')
    .replace(/\b(\d+)\s*gramos?\b/g, '$1g')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Tokeniza quitando stop-words y letras sueltas.
// "Bidón de agua" → ["bidon", "agua"]  (independiente del orden)
function tokenize(text) {
  return normalize(text)
    .split(' ')
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

// Query "limpia" que mandamos al buscador de cada tienda (sin stop-words)
function buildSearchQuery(raw) {
  const tokens = tokenize(raw);
  return tokens.length > 0 ? tokens.join(' ') : normalize(raw);
}

// Score 0-1: proporción de tokens de la búsqueda presentes en el nombre del producto
function scoreRelevance(queryTokens, productName) {
  if (queryTokens.length === 0) return 0;
  const pNorm = normalize(productName);
  const matches = queryTokens.filter((t) => pNorm.includes(t)).length;
  return matches / queryTokens.length;
}

// ¿El producto es relevante? Exige el sustantivo principal (primer token)
// + al menos la mitad de los tokens. Evita basura (ej: "arroz" → shampoo).
const RELEVANCE_THRESHOLD = 0.5;
function isRelevant(queryTokens, productName) {
  if (queryTokens.length === 0) return true;
  const pNorm = normalize(productName);
  // El primer token es el sustantivo principal y DEBE estar presente
  if (!pNorm.includes(queryTokens[0])) return false;
  return scoreRelevance(queryTokens, productName) >= RELEVANCE_THRESHOLD;
}

// ─── Scraping + comparación (reutilizable por /compare y el job) ──

// Busca un ítem en todas las tiendas y devuelve el mejor match por tienda
async function scrapeItem(item) {
  const queryTokens = tokenize(item.name);
  const searchQuery = buildSearchQuery(item.name);
  const products = await scrapeAll(searchQuery);

  // Solo productos relevantes — si nada coincide, el ítem queda sin resultados
  // (mejor mostrar "no encontrado" que precios de productos equivocados)
  const relevant = products.filter((p) => isRelevant(queryTokens, p.name));

  // Mejor match por tienda: primero el más relevante, entre iguales el más barato
  const byStore = {};
  for (const p of relevant) {
    const score = scoreRelevance(queryTokens, p.name);
    const existing = byStore[p.storeId];
    if (
      !existing ||
      score > existing._score ||
      (score === existing._score && p.price < existing.price)
    ) {
      byStore[p.storeId] = { ...p, _score: score };
    }
  }

  const sorted = Object.values(byStore).sort((a, b) => a.price - b.price);
  return {
    item: item.name,
    itemId: item.id,
    quantity: item.quantity,
    cheapest: sorted[0] || null,
    byStore,
  };
}

// Construye la comparación agregada a partir de los resultados por ítem.
// Funciona con resultados PARCIALES (para mostrar progreso en vivo).
function buildComparison(items, itemResults) {
  const storeMap = {};
  for (const ir of itemResults) {
    for (const [storeId, product] of Object.entries(ir.byStore)) {
      if (!storeMap[storeId]) {
        storeMap[storeId] = {
          storeId,
          name: product.store,
          color: product.storeColor,
          total: 0,
          found: 0,
          missing: [],
          items: [],
        };
      }
      storeMap[storeId].total += product.price * ir.quantity;
      storeMap[storeId].found += 1;
      storeMap[storeId].items.push({
        item: ir.item,
        price: product.price,
        productName: product.name,
        url: product.url,
        image: product.image || null,
      });
    }
  }

  // Marcar ítems faltantes por tienda
  for (const store of Object.values(storeMap)) {
    const foundNames = new Set(store.items.map((i) => i.item));
    store.missing = items.filter((i) => !foundNames.has(i.name)).map((i) => i.name);
  }

  const allStores = Object.values(storeMap).sort((a, b) => {
    // Tiendas completas primero (por total), luego parciales (por cantidad)
    const aFull = a.found === items.length;
    const bFull = b.found === items.length;
    if (aFull && !bFull) return -1;
    if (!aFull && bFull) return 1;
    if (aFull && bFull) return a.total - b.total;
    return b.found - a.found;
  });

  const optimalTotal = itemResults.reduce(
    (sum, ir) => (ir.cheapest ? sum + ir.cheapest.price * ir.quantity : sum),
    0,
  );

  const cheapestFullStore = allStores.find((s) => s.found === items.length);
  const optimalSavings = cheapestFullStore
    ? Math.max(0, cheapestFullStore.total - optimalTotal)
    : 0;

  return {
    results: itemResults.map((ir) => ({
      item: ir.item,
      itemId: ir.itemId,
      quantity: ir.quantity,
      cheapest: ir.cheapest,
      options: Object.values(ir.byStore).sort((a, b) => a.price - b.price).slice(0, 4),
    })),
    byStore: allStores,
    optimalTotal,
    optimalSavings,
    totalItems: items.length,
  };
}

// ─── Job store en memoria (para resultados progresivos) ───────────
const jobs = new Map(); // jobId → { userId, status, items, itemResults, completed, total, createdAt }
const JOB_TTL = 10 * 60 * 1000; // 10 minutos

function cleanupJobs() {
  const now = Date.now();
  for (const [id, j] of jobs) {
    if (now - j.createdAt > JOB_TTL) jobs.delete(id);
  }
}
const cleanupTimer = setInterval(cleanupJobs, 5 * 60 * 1000);
if (cleanupTimer.unref) cleanupTimer.unref();

// Procesa los ítems con concurrencia limitada, actualizando el job a medida
// que cada ítem termina (así el frontend ve resultados llegando de a poco).
async function runCompareJob(jobId, items) {
  const job = jobs.get(jobId);
  if (!job) return;

  const ITEM_CONCURRENCY = 3;
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      if (job.cancelled) return; // el usuario salió / vació la lista
      const item = items[idx++];
      try {
        const ir = await scrapeItem(item);
        job.itemResults.push(ir);
      } catch (err) {
        console.error(`[compare job] ${item.name}:`, err.message);
        job.itemResults.push({
          item: item.name,
          itemId: item.id,
          quantity: item.quantity,
          cheapest: null,
          byStore: {},
        });
      }
      job.completed++;
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(ITEM_CONCURRENCY, items.length) }, worker),
    );
    if (!job.cancelled) job.status = 'done';
  } catch (err) {
    job.status = 'error';
    job.error = err.message;
  }
}

// ─── Listas / ítems ───────────────────────────────────────────────

async function getOrCreateList(userId) {
  let list = (await db.query(
    'SELECT * FROM shopping_lists WHERE user_id = $1 LIMIT 1',
    [userId]
  )).rows[0];
  if (!list) {
    list = (await db.query(
      'INSERT INTO shopping_lists (user_id) VALUES ($1) RETURNING *',
      [userId]
    )).rows[0];
  }
  return list;
}

// GET /api/shopping — list + items
router.get('/', async (req, res) => {
  try {
    const list = await getOrCreateList(req.userId);
    const items = (await db.query(
      'SELECT * FROM shopping_items WHERE list_id = $1 ORDER BY created_at ASC',
      [list.id]
    )).rows;
    res.json({ list, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shopping/items — add item
router.post('/items', [
  body('name').trim().notEmpty(),
  body('quantity').optional().isInt({ min: 1 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const list = await getOrCreateList(req.userId);
    const item = (await db.query(
      'INSERT INTO shopping_items (list_id, name, quantity) VALUES ($1, $2, $3) RETURNING *',
      [list.id, req.body.name, req.body.quantity || 1]
    )).rows[0];
    res.status(201).json({ item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/shopping/items/:id — remove item
router.delete('/items/:id', async (req, res) => {
  try {
    await db.query(
      `DELETE FROM shopping_items
       WHERE id = $1 AND list_id IN (
         SELECT id FROM shopping_lists WHERE user_id = $2
       )`,
      [req.params.id, req.userId]
    );
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Comparación de precios [premium] ─────────────────────────────

// POST /api/shopping/compare/start — arranca un job y devuelve jobId al instante
router.post('/compare/start', requirePremium, async (req, res) => {
  try {
    const list = await getOrCreateList(req.userId);
    const items = (await db.query(
      'SELECT * FROM shopping_items WHERE list_id = $1',
      [list.id]
    )).rows;

    if (items.length === 0) {
      return res.status(400).json({ error: 'La lista está vacía' });
    }

    const jobId = crypto.randomUUID();
    jobs.set(jobId, {
      userId: req.userId,
      status: 'running',
      items,
      itemResults: [],
      completed: 0,
      total: items.length,
      createdAt: Date.now(),
    });

    runCompareJob(jobId, items); // sin await — corre en segundo plano

    res.json({ jobId, totalItems: items.length });
  } catch (err) {
    console.error('[shopping/compare/start]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/shopping/compare/status/:jobId — resultados parciales + progreso
// Sin requirePremium: el job solo existe si pasó la verificación en /start,
// y validamos propiedad por userId. Evita consultar la DB en cada poll.
router.get('/compare/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Comparación no encontrada o expirada' });
  if (job.userId !== req.userId) return res.status(403).json({ error: 'No autorizado' });

  // Sin caché: si el cuerpo no cambia entre polls, Express devolvería 304 y
  // axios (validateStatus 200-299) lo trataría como error. no-store lo evita.
  res.set('Cache-Control', 'no-store');

  const comparison = buildComparison(job.items, job.itemResults);
  res.json({
    status: job.status,
    completed: job.completed,
    total: job.total,
    ...comparison,
  });
});

// POST /api/shopping/compare/:jobId/cancel — detiene el scraping en curso
// (el usuario salió de la pantalla, vació la lista o arrancó otra búsqueda).
router.post('/compare/:jobId/cancel', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (job && job.userId === req.userId) {
    job.cancelled = true;
    job.status = 'cancelled';
  }
  res.json({ ok: true });
});

// POST /api/shopping/compare — versión síncrona (compat / clientes viejos)
router.post('/compare', requirePremium, async (req, res) => {
  try {
    const list = await getOrCreateList(req.userId);
    const items = (await db.query(
      'SELECT * FROM shopping_items WHERE list_id = $1',
      [list.id]
    )).rows;

    if (items.length === 0) {
      return res.json({ results: [], byStore: [], optimalTotal: 0, optimalSavings: 0, totalItems: 0 });
    }

    const itemResults = await Promise.all(items.map((item) => scrapeItem(item)));
    res.json(buildComparison(items, itemResults));
  } catch (err) {
    console.error('[shopping/compare]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
