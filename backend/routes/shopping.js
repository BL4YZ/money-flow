const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { scrapeAll } = require('../services/scraper');

const router = express.Router();
router.use(authMiddleware);

// Normaliza texto: quita tildes, plurales simples, expande abreviaturas de volumen
function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar tildes
    .replace(/\b(\d+)\s*litros?\b/g, '$1l')   // "3 litros" → "3l"
    .replace(/\b(\d+)\s*lts?\b/g, '$1l')       // "3lt" → "3l"
    .replace(/\b(\d+)\s*mililitros?\b/g, '$1ml')
    .replace(/\b(\d+)\s*kilos?\b/g, '$1kg')
    .replace(/\b(\d+)\s*gramos?\b/g, '$1g')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Devuelve score 0-1: cuántos tokens de la query aparecen en el nombre del producto
function scoreRelevance(query, productName) {
  const qTokens = normalize(query).split(' ').filter(Boolean);
  const pNorm   = normalize(productName);
  if (qTokens.length === 0) return 0;
  const matches = qTokens.filter(t => pNorm.includes(t));
  return matches.length / qTokens.length;
}

const RELEVANCE_THRESHOLD = 0.6; // al menos 60% de los tokens deben coincidir

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

// POST /api/shopping/compare — scrape all items and return price comparison
router.post('/compare', async (req, res) => {
  try {
    const list = await getOrCreateList(req.userId);
    const items = (await db.query(
      'SELECT * FROM shopping_items WHERE list_id = $1',
      [list.id]
    )).rows;

    if (items.length === 0) {
      return res.json({ results: [], byStore: [], optimalTotal: 0, optimalSavings: 0 });
    }

    // Scrape all items in parallel
    const itemResults = await Promise.all(
      items.map(async (item) => {
        const products = await scrapeAll(item.name);

        // Filtrar por relevancia — descartar productos que no coinciden con la búsqueda
        const relevant = products.filter(p => scoreRelevance(item.name, p.name) >= RELEVANCE_THRESHOLD);
        const pool = relevant.length > 0 ? relevant : products; // fallback a todos si no hay nada relevante

        // Mejor match por tienda: primero el más relevante, entre iguales el más barato
        const byStore = {};
        for (const p of pool) {
          const score = scoreRelevance(item.name, p.name);
          const existing = byStore[p.storeId];
          if (!existing) {
            byStore[p.storeId] = { ...p, _score: score };
          } else {
            // Priorizar relevancia; si empatan, el más barato
            if (score > existing._score || (score === existing._score && p.price < existing.price)) {
              byStore[p.storeId] = { ...p, _score: score };
            }
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
      })
    );

    // Aggregate totals per store
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

    // Mark missing items per store
    for (const store of Object.values(storeMap)) {
      const foundNames = new Set(store.items.map(i => i.item));
      store.missing = items.filter(i => !foundNames.has(i.name)).map(i => i.name);
    }

    const allStores = Object.values(storeMap).sort((a, b) => {
      // Full stores first (sorted by total), then partial (sorted by found count)
      const aFull = a.found === items.length;
      const bFull = b.found === items.length;
      if (aFull && !bFull) return -1;
      if (!aFull && bFull) return 1;
      if (aFull && bFull) return a.total - b.total;
      return b.found - a.found;
    });

    // Optimal: cheapest per item across any store
    const optimalTotal = itemResults.reduce((sum, ir) => {
      return ir.cheapest ? sum + ir.cheapest.price * ir.quantity : sum;
    }, 0);

    const cheapestFullStore = allStores.find(s => s.found === items.length);
    const optimalSavings = cheapestFullStore
      ? Math.max(0, cheapestFullStore.total - optimalTotal)
      : 0;

    res.json({
      results: itemResults.map(ir => ({
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
    });
  } catch (err) {
    console.error('[shopping/compare]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
