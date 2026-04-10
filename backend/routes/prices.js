const express = require('express');
const axios = require('axios');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const SITE = process.env.MERCADOLIBRE_SITE || 'MLU';
const ML_BASE = 'https://api.mercadolibre.com';

// ─── GET /api/prices/search?q=zapatillas&limit=10 ─────────────
router.get('/search', async (req, res) => {
  const { q, limit = 10 } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Búsqueda demasiado corta' });
  }

  try {
    const response = await axios.get(`${ML_BASE}/sites/${SITE}/search`, {
      params: {
        q: q.trim(),
        limit: Math.min(parseInt(limit), 20),
        sort: 'price_asc',
      },
      timeout: 5000,
    });

    const items = response.data.results.map(item => ({
      id: item.id,
      title: item.title,
      price: item.price,
      currency: item.currency_id,
      condition: item.condition,
      thumbnail: item.thumbnail,
      url: item.permalink,
      seller: item.seller?.nickname,
      freeShipping: item.shipping?.free_shipping || false,
    }));

    const prices = items.map(i => i.price);
    const stats = prices.length > 0 ? {
      min: Math.min(...prices),
      max: Math.max(...prices),
      avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    } : null;

    res.json({
      query: q,
      site: SITE,
      items,
      stats,
      total: response.data.paging?.total || 0,
    });

  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'MercadoLibre tardó demasiado, intentá de nuevo' });
    }
    console.error('Prices error:', err.message);
    res.status(500).json({ error: 'Error al buscar precios' });
  }
});

module.exports = router;
