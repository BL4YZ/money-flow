const express = require('express');
const axios = require('axios');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const SITE = process.env.MERCADOLIBRE_SITE || 'MLU';
const ML_BASE = 'https://api.mercadolibre.com';
const BACKEND_URL = process.env.BACKEND_URL || 'https://money-flow-co41.onrender.com';

const pkceStore = new Map(); // state → codeVerifier (reservado para si se activa PKCE)

// ─── Token de usuario (Authorization Code) ───────────────────────
// Persiste en memoria; se renueva automáticamente con refresh_token.
// Si el servidor reinicia, usa las env vars como semilla.
let userAccessToken = process.env.ML_ACCESS_TOKEN || null;
let userRefreshToken = process.env.ML_REFRESH_TOKEN || null;
let userTokenExpiry = parseInt(process.env.ML_TOKEN_EXPIRY || '0');

async function getUserToken() {
  if (userAccessToken && Date.now() < userTokenExpiry) return userAccessToken;

  if (!userRefreshToken) {
    throw new Error('NO_TOKEN');
  }

  // Renovar con refresh_token
  const resp = await axios.post(`${ML_BASE}/oauth/token`, null, {
    params: {
      grant_type: 'refresh_token',
      client_id: process.env.ML_CLIENT_ID,
      client_secret: process.env.ML_CLIENT_SECRET,
      refresh_token: userRefreshToken,
    },
    timeout: 8000,
  });

  userAccessToken = resp.data.access_token;
  userRefreshToken = resp.data.refresh_token || userRefreshToken;
  userTokenExpiry = Date.now() + (resp.data.expires_in - 300) * 1000;
  console.log('ML token renovado exitosamente');
  return userAccessToken;
}

// ─── GET /api/prices/auth/debug  ─────────────────────────────────
router.get('/auth/debug', (req, res) => {
  const clientId = process.env.ML_CLIENT_ID;
  const redirectUri = `${BACKEND_URL}/api/prices/callback`;
  const authUrl = `https://auth.mercadolibre.com.uy/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  res.json({
    clientId,
    redirectUri,
    authUrl,
    backendUrl: BACKEND_URL,
  });
});

// ─── GET /api/prices/auth  (sin authMiddleware — es para el dueño) ─
router.get('/auth', (req, res) => {
  const clientId = process.env.ML_CLIENT_ID;
  if (!clientId) return res.status(503).send('ML_CLIENT_ID no configurado');

  const redirectUri = `${BACKEND_URL}/api/prices/callback`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
  });

  res.redirect(`https://auth.mercadolibre.com/authorization?${params}`);
});

// ─── GET /api/prices/callback  (sin authMiddleware) ──────────────
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) return res.status(400).send(`ML error: ${error}`);
  if (!code) return res.status(400).send('No code recibido');

  const codeVerifier = pkceStore.get(state);
  pkceStore.delete(state);

  try {
    const redirectUri = `${BACKEND_URL}/api/prices/callback`;
    const tokenParams = {
      grant_type: 'authorization_code',
      client_id: process.env.ML_CLIENT_ID,
      client_secret: process.env.ML_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    };
    if (codeVerifier) tokenParams.code_verifier = codeVerifier;

    const resp = await axios.post(`${ML_BASE}/oauth/token`, null, {
      params: tokenParams,
      timeout: 8000,
    });

    userAccessToken = resp.data.access_token;
    userRefreshToken = resp.data.refresh_token;
    userTokenExpiry = Date.now() + (resp.data.expires_in - 300) * 1000;

    console.log('ML OAuth exitoso. Access token obtenido.');

    res.send(`
      <html><body style="font-family:sans-serif;padding:40px;max-width:600px">
        <h2>✅ MercadoLibre autorizado</h2>
        <p>Ya podés buscar precios en la app.</p>
        <p><strong>Para que persista si el servidor reinicia, agregá estas variables en Render → Environment:</strong></p>
        <pre style="background:#f0f0f0;padding:16px;border-radius:8px;word-break:break-all">ML_ACCESS_TOKEN=${userAccessToken}
ML_REFRESH_TOKEN=${userRefreshToken}
ML_TOKEN_EXPIRY=${userTokenExpiry}</pre>
        <p style="color:#666;font-size:14px">El refresh_token dura ~6 meses. Si expira, volvé a entrar a /api/prices/auth</p>
      </body></html>
    `);
  } catch (err) {
    console.error('ML callback error:', err.response?.data || err.message);
    res.status(500).send(`Error: ${JSON.stringify(err.response?.data || err.message)}`);
  }
});

// ─── Rutas protegidas (requieren JWT de la app) ───────────────────
router.use(authMiddleware);

// GET /api/prices/status — para saber si ML está autorizado
router.get('/status', (req, res) => {
  const authorized = !!(userAccessToken && Date.now() < userTokenExpiry) || !!userRefreshToken;
  res.json({ authorized, expiresIn: Math.max(0, Math.round((userTokenExpiry - Date.now()) / 1000)) });
});

// GET /api/prices/search?q=zapatillas&limit=10
router.get('/search', async (req, res) => {
  const { q, limit = 10 } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Búsqueda demasiado corta' });
  }

  try {
    const token = await getUserToken();

    const response = await axios.get(`${ML_BASE}/sites/${SITE}/search`, {
      params: {
        q: q.trim(),
        limit: Math.min(parseInt(limit), 20),
        sort: 'price_asc',
      },
      headers: { 'Authorization': `Bearer ${token}` },
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

    res.json({ query: q, site: SITE, items, stats, total: response.data.paging?.total || 0 });

  } catch (err) {
    if (err.message === 'NO_TOKEN') {
      return res.status(503).json({ error: 'Comparador no autorizado. El admin debe visitar /api/prices/auth' });
    }
    if (err.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'MercadoLibre tardó demasiado, intentá de nuevo' });
    }
    console.error('Prices error:', JSON.stringify(err.response?.data), 'status:', err.response?.status);
    res.status(500).json({ error: 'Error al buscar precios', detail: err.response?.data });
  }
});

module.exports = router;
