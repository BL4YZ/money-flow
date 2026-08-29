require('dotenv').config();
// Forzar IPv4 en todas las conexiones DNS — fix para Render + Supabase
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err.message, err.stack);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
  process.exit(1);
});

console.log('Loading express...');
const express = require('express');
console.log('Loading cors...');
const cors = require('cors');
console.log('Loading express-rate-limit...');
const rateLimit = require('express-rate-limit');

console.log('Loading routes...');
const authRoute = require('./routes/auth');
console.log('auth OK');
const uploadRoute = require('./routes/upload');
console.log('upload OK');
const transactionsRoute = require('./routes/transactions');
console.log('transactions OK');
const suggestionsRoute = require('./routes/suggestions');
console.log('suggestions OK');
const pricesRoute = require('./routes/prices');
console.log('prices OK');
const subscriptionsRoute = require('./routes/subscriptions');
console.log('subscriptions OK');
const goalsRoute = require('./routes/goals');
console.log('goals OK');
const budgetsRoute = require('./routes/budgets');
console.log('budgets OK');
const billsRoute = require('./routes/bills');
console.log('bills OK');
const shoppingRoute = require('./routes/shopping');
console.log('shopping OK');
const pushTokenRoute = require('./routes/pushToken');
console.log('pushToken OK');
const webhooksRoute = require('./routes/webhooks');
console.log('webhooks OK');

const { startBillNotifier } = require('./services/billNotifier');
startBillNotifier();

const { initSchema } = require('./db');
initSchema().catch(err => console.error('Schema init error:', err.message));

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1); // Render está detrás de un proxy

// ── CORS ───────────────────────────────────────────────────────
// La app es un cliente móvil (Expo/React Native) autenticado con Bearer
// JWT, no con cookies — no depende de CORS para su propio funcionamiento
// (los requests nativos no envían Origin). Restringimos igual el acceso
// basado en navegador a un allowlist explícito, para no dejar la API
// abierta a que cualquier página web haga requests desde el browser del
// visitante. Sin ALLOWED_ORIGINS configurado, no se permite ningún origin
// de navegador (fail closed), pero clientes sin Origin (apps nativas, curl,
// webhooks) siguen funcionando normalmente.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true); // apps nativas / curl / server-to-server
    if (allowedOrigins.includes(origin)) return callback(null, true);
    const err = new Error('Not allowed by CORS');
    err.status = 403;
    callback(err);
  },
}));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones, intentá en 15 minutos' },
});
app.use(limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de login, esperá 15 minutos' },
});

// ── Request logger (dev only) ─────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const flag = res.statusCode >= 400 ? '❌' : '✓';
    console.log(`${flag} ${res.statusCode} ${req.method} ${req.path} (${ms}ms)`);
  });
  next();
});

app.use('/api/auth', authLimiter, authRoute);
app.use('/api/upload', uploadRoute);
app.use('/api/transactions', transactionsRoute);
app.use('/api/suggestions', suggestionsRoute);
app.use('/api/prices', pricesRoute);
app.use('/api/subscriptions', subscriptionsRoute);
app.use('/api/goals', goalsRoute);
app.use('/api/budgets', budgetsRoute);
app.use('/api/bills', billsRoute);
app.use('/api/shopping', shoppingRoute);
app.use('/api/push-token', pushTokenRoute);
app.use('/api/webhooks', webhooksRoute);

// DEV only — allowlist explícito en vez de blocklist: si NODE_ENV falta o
// tiene un valor inesperado en producción, estas rutas quedan deshabilitadas
// por defecto en lugar de expuestas por accidente.
if (process.env.NODE_ENV === 'development') {
  const devRoute = require('./routes/dev');
  app.use('/api/dev', devRoute);
  console.log('dev routes enabled (NODE_ENV=development)');
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`MoneyFlow API corriendo en puerto ${PORT}`);
});
