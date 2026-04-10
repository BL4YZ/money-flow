require('dotenv').config();

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

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1); // Render está detrás de un proxy

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

app.use('/api/auth', authLimiter, authRoute);
app.use('/api/upload', uploadRoute);
app.use('/api/transactions', transactionsRoute);
app.use('/api/suggestions', suggestionsRoute);
app.use('/api/prices', pricesRoute);
app.use('/api/subscriptions', subscriptionsRoute);
app.use('/api/goals', goalsRoute);

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
