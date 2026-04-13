const express = require('express');
const axios = require('axios');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// ─── Tiendas configuradas ─────────────────────────────────────────
const STORES = [
  {
    id: 'eldorado',
    name: 'El Dorado',
    color: '#E63946',
    api: 'https://www.eldorado.com.uy/api/catalog_system/pub/products/search',
    baseUrl: 'https://www.eldorado.com.uy',
  },
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  'Accept': 'application/json',
  'Accept-Language': 'es-UY,es;q=0.9',
};

function parseVtexProducts(data, store) {
  return data
    .map(p => {
      const item = p.items?.[0];
      if (!item) return null;
      const offer = item.sellers?.[0]?.commertialOffer;
      if (!offer || !offer.Price) return null;
      return {
        store: store.name,
        storeId: store.id,
        storeColor: store.color,
        name: p.productName,
        price: offer.Price,
        listPrice: offer.ListPrice,
        image: item.images?.[0]?.imageUrl || null,
        url: `${store.baseUrl}/${p.linkText}/p`,
        available: offer.AvailableQuantity > 0,
      };
    })
    .filter(Boolean);
}

// ─── Rutas públicas (sin authMiddleware) ─────────────────────────

// GET /api/prices/auth/debug
router.get('/auth/debug', (req, res) => {
  res.json({ message: 'ML OAuth deshabilitado. Usando scraping de supermercados.' });
});

// ─── Rutas protegidas ─────────────────────────────────────────────
router.use(authMiddleware);

// GET /api/prices/search?q=leche&limit=10
router.get('/search', async (req, res) => {
  const { q, limit = 10 } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Búsqueda demasiado corta' });
  }

  try {
    const results = await Promise.allSettled(
      STORES.map(store =>
        axios.get(store.api, {
          params: { ft: q.trim(), _from: 0, _to: Math.min(parseInt(limit), 20) - 1 },
          headers: HEADERS,
          timeout: 8000,
        }).then(r => parseVtexProducts(r.data, store))
      )
    );

    const items = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .sort((a, b) => a.price - b.price);

    if (items.length === 0) {
      return res.json({ query: q, items: [], stats: null, stores: [] });
    }

    const prices = items.map(i => i.price);
    const stats = {
      min: Math.min(...prices),
      max: Math.max(...prices),
      avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
      count: items.length,
    };

    const storeNames = [...new Set(items.map(i => i.store))];

    res.json({ query: q, items, stats, stores: storeNames });
  } catch (err) {
    console.error('Prices search error:', err.message);
    res.status(500).json({ error: 'Error al buscar precios' });
  }
});

module.exports = router;
