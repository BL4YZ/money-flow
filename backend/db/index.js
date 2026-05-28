const dns = require('dns').promises;
const { Pool } = require('pg');

let pool = null;

async function initPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;

  if (process.env.NODE_ENV !== 'production') {
    // Local: conectar directo sin DNS trick
    console.log('DB: modo local, conexión directa');
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  } else {
    const url = new URL(connectionString);
    try {
      // Render no soporta IPv6 saliente — forzar IPv4
      const addresses = await dns.resolve4(url.hostname);
      const ipv4 = addresses[0];
      console.log(`DB: ${url.hostname} → ${ipv4} (IPv4)`);
      pool = new Pool({
        host: ipv4,
        port: parseInt(url.port) || 5432,
        database: url.pathname.slice(1),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
    } catch (err) {
      console.error('DNS IPv4 resolve falló, usando connection string directo:', err.message);
      pool = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
    }
  }

  pool.on('error', (err) => console.error('DB pool error:', err.message));
  return pool;
}

async function initSchema() {
  const p = await initPool();
  try {
    await p.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token VARCHAR(200);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(20) NOT NULL DEFAULT 'free';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;

      CREATE TABLE IF NOT EXISTS bills (
        id            SERIAL PRIMARY KEY,
        user_id       UUID NOT NULL,
        name          VARCHAR(200) NOT NULL,
        amount        NUMERIC(12,2),
        due_day       INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
        category      VARCHAR(100) NOT NULL DEFAULT 'Servicios',
        reminder_days INTEGER NOT NULL DEFAULT 3,
        is_active     BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS budgets (
        id           SERIAL PRIMARY KEY,
        user_id      UUID NOT NULL,
        category     VARCHAR(100) NOT NULL,
        amount       NUMERIC(12,2) NOT NULL,
        created_at   TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, category)
      );

      CREATE TABLE IF NOT EXISTS shopping_lists (
        id         SERIAL PRIMARY KEY,
        user_id    UUID NOT NULL,
        name       VARCHAR(200) NOT NULL DEFAULT 'Mi lista',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS shopping_items (
        id         SERIAL PRIMARY KEY,
        list_id    INTEGER NOT NULL,
        name       VARCHAR(200) NOT NULL,
        quantity   INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW()
      );

    `);
    console.log('Schema: budgets table ready');
  } catch (err) {
    console.error('Schema: budgets table creation failed:', err.message);
    throw err;
  }
}

module.exports = {
  query: async (text, params) => {
    const p = await initPool();
    return p.query(text, params);
  },
  initPool,
  initSchema,
};
