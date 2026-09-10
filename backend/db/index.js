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

      -- Día del mes en que se cobra la suscripción (para próximos cobros)
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_day INTEGER;

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

      -- Historial de depósitos por meta (para proyección, cuota y streak)
      CREATE TABLE IF NOT EXISTS goal_deposits (
        id         SERIAL PRIMARY KEY,
        goal_id    UUID NOT NULL,
        user_id    UUID NOT NULL,
        amount     NUMERIC(12,2) NOT NULL CHECK (amount > 0),
        note       VARCHAR(200),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Vinculación de transacciones a metas (para auto-acreditar)
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS goal_id UUID;

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

      -- Cache que sobrevive al reinicio. En el plan gratuito de Render el
      -- filesystem es EFIMERO (se borra en cada deploy, reinicio y apagado por
      -- inactividad) y el servicio duerme a los 15 minutos: con el cache solo en
      -- memoria, la primera busqueda despues de cada siesta scrapea todo de cero.
      -- Render mismo recomienda Postgres para esto. Ver services/persistentCache.js.
      CREATE TABLE IF NOT EXISTS kv_cache (
        key          TEXT PRIMARY KEY,
        value        JSONB NOT NULL,
        fresh_until  TIMESTAMPTZ,
        stale_until  TIMESTAMPTZ,
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS kv_cache_stale_idx ON kv_cache (stale_until);

      -- Registro de busquedas y clicks. Es la materia prima de Learning to
      -- Rank: sin historial de que eligio la gente, no hay nada que aprender, y
      -- ese dato NO se puede recuperar despues. Loguear ahora cuesta una tabla;
      -- no loguear cuesta todos los meses que pasen hasta que alguien se acuerde.
      --
      -- Se guardan las dos mitades porque una sin la otra no sirve: los clicks
      -- dicen que se eligio, y "shown" dice contra que competia y en que orden.
      -- Sin las impresiones no se puede calcular CTR por posicion, que es la
      -- correccion mas basica (el puesto 1 se clickea mas por ser el puesto 1).
      CREATE TABLE IF NOT EXISTS search_log (
        id            SERIAL PRIMARY KEY,
        user_id       UUID,
        query         TEXT NOT NULL,
        category      TEXT,
        results_count INTEGER NOT NULL DEFAULT 0,
        shown         JSONB,          -- [{pos, store, name, price}] en el orden mostrado
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS search_log_created_idx ON search_log (created_at);

      CREATE TABLE IF NOT EXISTS search_click (
        id            SERIAL PRIMARY KEY,
        search_log_id INTEGER,
        user_id       UUID,
        position      INTEGER,        -- ranking en el que estaba lo clickeado
        store_id      TEXT,
        product_name  TEXT,
        price         NUMERIC(12,2),
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS search_click_log_idx ON search_click (search_log_id);

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
  // Cliente dedicado, para lo que necesita una transacción de verdad. El
  // borrado de cuenta toca siete tablas y varias no tienen FK con cascade: si
  // falla a la mitad quedan filas huérfanas apuntando a un usuario que ya no
  // existe. Quien lo pide DEBE llamar a release() en un finally.
  getClient: async () => {
    const p = await initPool();
    return p.connect();
  },
  initPool,
  initSchema,
};
