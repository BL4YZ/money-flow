const dns = require('dns').promises;
const { Pool } = require('pg');

let pool = null;

async function initPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  const url = new URL(connectionString);

  try {
    // Resolver hostname a IPv4 explícitamente — Render no soporta IPv6 saliente
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

  pool.on('error', (err) => console.error('DB pool error:', err.message));
  return pool;
}

module.exports = {
  query: async (text, params) => {
    const p = await initPool();
    return p.query(text, params);
  },
  initPool,
};
