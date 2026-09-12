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

      -- De qué movimiento salió el depósito, cuando salió de uno. Es lo que
      -- hace REVERSIBLE la acreditación: sin esto, deshacer un vínculo obliga
      -- a adivinar cuál de los depósitos vino de ese movimiento comparando
      -- monto y texto. Importa porque la acreditación la dispara una
      -- sugerencia, y una sugerencia se equivoca.
      ALTER TABLE goal_deposits ADD COLUMN IF NOT EXISTS transaction_id UUID;

      -- Identificador del movimiento segun el propio banco (fecha + su numero
      -- de referencia). Es lo que permite volver a subir el mismo resumen sin
      -- duplicar, y sobre todo CORREGIR un import anterior.
      --
      -- Hasta acá el INSERT decía ON CONFLICT DO NOTHING pero el único índice
      -- único era el de la primary key, que es un UUID nuevo en cada fila: no
      -- había con qué chocar, así que la deduplicación nunca existió y cada
      -- subida del mismo archivo insertaba todo otra vez.
      --
      -- El índice es PARCIAL a propósito: las filas viejas y las cargadas a
      -- mano tienen external_id NULL y no deben competir entre sí.
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS external_id TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_user_external
        ON transactions (user_id, external_id) WHERE external_id IS NOT NULL;

      -- REPARACIÓN DE DATOS, una sola vez. Había dos categorizadores con
      -- distinto vocabulario de salida (ver services/categorizer.js), así que
      -- las filas guardadas están partidas entre 'Comida'/'Restaurantes' y
      -- 'Ingreso'/'Salario' — dos porciones de la misma torta. Sin esto, unificar
      -- el código deja los datos viejos partidos igual.
      --
      -- 'Ingreso' NO se renombra a ciegas: la regla vieja era
      -- /salario|sueldo|pago|deposito/, o sea que ahí adentro hay sueldos y
      -- también transferencias, y 'pago' es tan amplio que arrastró cosas que no
      -- son ingreso. Se vuelve a decidir mirando la descripción, igual que haría
      -- el categorizador de hoy; lo que no se puede ubicar va a 'Otros' en vez de
      -- inventarle una categoría.
      UPDATE transactions SET category = 'Restaurantes' WHERE category = 'Comida';
      UPDATE transactions SET category = CASE
        WHEN description ~* '(salario|sueldo|haberes|remuneraci)' THEN 'Salario'
        WHEN description ~* '(transfer|dep[oó]sito|ingreso)'      THEN 'Transferencia'
        ELSE 'Otros'
      END WHERE category = 'Ingreso';

      -- REPARACIÓN DE SALDOS DE METAS, una sola vez.
      --
      -- goals.current_amount se escribía suelto desde cuatro lugares y sólo
      -- dos de ellos dejaban una fila en goal_deposits, así que el saldo y el
      -- historial contaban cosas distintas. En pantalla eso se veía como una
      -- meta al 12% con $5.827 que al mismo tiempo decía "Hacé tu primer
      -- depósito": el anillo lee el saldo y la proyección lee los depósitos.
      --
      -- Se repara SÓLO hacia arriba: si el saldo supera lo que explica el
      -- historial, se agrega la fila que falta. Esa plata es real para el
      -- usuario y borrarla sería destruir un dato suyo.
      --
      -- El caso inverso —historial mayor que el saldo— NO se toca acá: subir el
      -- saldo hasta la suma podría revertir un "Deshacer" que el usuario sí
      -- hizo. Lo reporta scripts/verify-goal-balance.js para mirarlo a mano.
      --
      -- Idempotente por construcción: después de correr, la condición es falsa.
      INSERT INTO goal_deposits (goal_id, user_id, amount, note)
      SELECT g.id, g.user_id, g.current_amount - COALESCE(d.total, 0), 'Saldo anterior'
      FROM goals g
      LEFT JOIN (SELECT goal_id, SUM(amount) AS total FROM goal_deposits GROUP BY goal_id) d
        ON d.goal_id = g.id
      WHERE g.current_amount > COALESCE(d.total, 0);

      -- MULTIMONEDA. En Uruguay se cobra en pesos y se ahorra en dolares, y
      -- mucha gente tiene las dos cuentas; tambien hay quien cobra en dolares.
      -- Hasta aca todo se sumaba como si fuera una sola moneda.
      --
      -- Tres columnas, y la tercera es la que sostiene la regla:
      --   currency   en que moneda esta el importe original
      --   rate_uyu   cuantos pesos valia UNA unidad de esa moneda ESE DIA
      --   amount_uyu el importe en pesos, GENERADO por la base
      --
      -- rate_uyu se congela en la fecha del movimiento a proposito. Convertir
      -- siempre con la cotizacion de hoy hace que un ahorro en dolares "crezca"
      -- cuando sube el dolar, y eso es falso: no ahorraste mas, cambio el tipo
      -- de cambio. Ver services/exchangeRate.js.
      --
      -- amount_uyu es GENERATED ALWAYS ... STORED y no una columna que alguien
      -- mantenga: es la misma leccion que goals.current_amount, que se separo
      -- de su historial justamente por ser un numero guardado a mano. Asi la
      -- base no deja que se desincronice.
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'UYU';
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS rate_uyu NUMERIC(14,4) NOT NULL DEFAULT 1;
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS amount_uyu NUMERIC(18,2)
        GENERATED ALWAYS AS (amount * rate_uyu) STORED;

      -- Moneda preferida para MOSTRAR. Distinta de la moneda de cada movimiento:
      -- esto es como quiere ver los totales el usuario, no en que opero.
      ALTER TABLE users ADD COLUMN IF NOT EXISTS display_currency VARCHAR(10) NOT NULL DEFAULT 'UYU';

      -- Nombre del comercio detras de un RUT.
      --
      -- El QR del comprobante trae el RUT pero NO el nombre, asi que sin esto
      -- cada ticket entra como "Comprobante 215080550011". El nombre lo pone la
      -- primera persona que escanea ahi.
      --
      -- ES GLOBAL, SIN user_id, Y ESO ES A PROPOSITO: un RUT es la misma empresa
      -- para todo el mundo. Que alguien nombre a Vinitex una vez le ahorra el
      -- paso a todos los demas — y no hay dato personal en la tabla, solo
      -- informacion comercial que ya viene impresa en el ticket. Por lo mismo NO
      -- entra en el borrado de cuenta: no es de nadie.
      CREATE TABLE IF NOT EXISTS cfe_emisores (
        rut        VARCHAR(12) PRIMARY KEY,
        nombre     VARCHAR(120) NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- REPARACION DE UN NOMBRE QUE PUSE YO, NO UN USUARIO. scripts/verify-
      -- receipts.js mandaba una descripcion con el RUT real del ticket que se usa
      -- de ejemplo: lo nombro 'Unitex' y despues lo piso con 'Unitex devolucion',
      -- el texto del caso de la nota de credito. Como el .env local apunta a la
      -- misma base que Render, eso se escribio en produccion, y como el padron es
      -- global y sobrevive al borrado de la cuenta de prueba, le aparecio a una
      -- persona escaneando su ticket: un gasto suyo rotulado como la devolucion
      -- de otro comercio. El comercio es VINITEX (CONAPLUS S.A.) — 'Unitex' fue
      -- ademas un error mio leyendo el logo.
      --
      -- Se corrige SOLO si el nombre sigue siendo uno de esos dos: si alguien ya
      -- lo arreglo a mano desde la app, su correccion manda sobre esta.
      UPDATE cfe_emisores SET nombre = 'Vinitex', updated_at = NOW()
       WHERE rut = '215080550011' AND nombre IN ('Unitex', 'Unitex devolución');

      -- Y los movimientos que ya se guardaron con ese rotulo. Igual de acotado:
      -- solo los que salieron del escaner, solo de ese RUT, y solo si nadie les
      -- cambio el texto despues.
      UPDATE transactions SET description = 'Vinitex'
       WHERE source = 'receipt'
         AND external_id LIKE 'cfe|215080550011|%'
         AND description IN ('Unitex', 'Unitex devolución', 'Comprobante 215080550011');

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
