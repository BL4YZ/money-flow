const express = require('express');
const axios = require('axios');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const SITE = process.env.MERCADOLIBRE_SITE || 'MLU';
const ML_BASE = 'https://api.mercadolibre.com';

// Cache del token de MercadoLibre (expira en 6 horas)
let mlToken = null;
let mlTokenExpiry = 0;

async function getMLToken() {
  if (mlToken && Date.now() < mlTokenExpiry) return mlToken;

  const clientId = process.env.ML_CLIENT_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('ML_CLIENT_ID y ML_CLIENT_SECRET no configurados en variables de entorno');
  }

  const response = await axios.post(`${ML_BASE}/oauth/token`, {
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  }, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 8000,
  });

  mlToken = response.data.access_token;
  mlTokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000; // 5 min de margen
  return mlToken;
}

// ─── GET /api/prices/token ────────────────────────────────────
// El frontend llama esto para obtener un token y buscar directo en ML
router.get('/token', async (req, res) => {
  try {
    const token = await getMLToken();
    res.json({ token });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// ─── GET /api/prices/search?q=zapatillas&limit=10 ─────────────
router.get('/search', async (req, res) => {
  const { q, limit = 10 } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Búsqueda demasiado corta' });
  }

  try {
    const token = await getMLToken();

    const response = await axios.get(`${ML_BASE}/sites/${SITE}/search`, {
      params: {
        q: q.trim(),
        limit: Math.min(parseInt(limit), 20),
        sort: 'price_asc',
        access_token: token,
      },
      timeout: 8000,
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
    if (err.message.includes('no configurados')) {
      return res.status(503).json({ error: 'Comparador no configurado. Contactá al administrador.' });
    }
    if (err.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'MercadoLibre tardó demasiado, intentá de nuevo' });
    }
    console.error('Prices error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Error al buscar precios' });
  }
});

module.exports = router;
