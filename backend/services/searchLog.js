/**
 * Registro de búsquedas y clicks.
 *
 * POR QUÉ AHORA
 *
 * Learning to Rank —el método que mejor rinde en búsqueda de e-commerce— aprende
 * de lo que la gente realmente elige. Ese historial no se puede reconstruir
 * después: cada día sin loguear es un día de datos que no vuelve. Loguear cuesta
 * dos tablas; no loguear cuesta todos los meses que pasen hasta que alguien se
 * acuerde.
 *
 * QUÉ SE GUARDA Y POR QUÉ LAS DOS MITADES
 *
 * Los clicks solos no alcanzan. "Este producto se clickeó" no dice nada sin
 * saber contra qué competía y en qué puesto estaba: el primer resultado se
 * clickea más por ser el primero, no por ser mejor. Por eso cada búsqueda deja
 * su lista mostrada (la impresión) y cada click apunta a esa búsqueda.
 *
 * REGLA: esto es telemetría, no una función del producto. Nunca puede demorar
 * ni romper una búsqueda — se escribe sin que nadie la espere y todo error se
 * traga. Si la base está caída, el usuario no se entera.
 */

const db = require("../db");

let disponible = true;
let avisado = false;

function apagar(err) {
  if (!avisado) {
    console.warn(`[search-log] deshabilitado: ${err.message}`);
    avisado = true;
  }
  disponible = false;
}

// Cuántos resultados de la lista mostrada se guardan. Los 10 primeros cubren lo
// que el usuario ve sin scrollear varias pantallas, y guardar 24 por búsqueda
// multiplicaría el peso de la tabla sin agregar señal útil.
const MAX_MOSTRADOS = 10;

/**
 * Registra una búsqueda con lo que se le mostró al usuario.
 * Devuelve el id para que el click pueda referenciarlo — pero el que llama NO
 * debe esperar por esto si eso demora la respuesta.
 */
async function registrarBusqueda({ userId, query, category, items }) {
  if (!disponible) return null;
  try {
    const mostrados = (items || []).slice(0, MAX_MOSTRADOS).map((it, i) => ({
      pos: i + 1,
      store: it.storeId || it.store || null,
      name: (it.name || "").slice(0, 160),
      price: it.price ?? it.minPrice ?? null,
    }));
    const { rows } = await db.query(
      `INSERT INTO search_log (user_id, query, category, results_count, shown)
       VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
      [userId || null, String(query).slice(0, 200), category || null,
       (items || []).length, JSON.stringify(mostrados)],
    );
    return rows[0]?.id ?? null;
  } catch (err) {
    apagar(err);
    return null;
  }
}

function registrarClick({ userId, searchLogId, position, storeId, productName, price }) {
  if (!disponible) return;
  db.query(
    `INSERT INTO search_click (search_log_id, user_id, position, store_id, product_name, price)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [searchLogId || null, userId || null, position ?? null,
     storeId || null, String(productName || "").slice(0, 200), price ?? null],
  ).catch(apagar);
}

/**
 * Borra historial viejo. Sin esto las tablas crecen para siempre; 180 días es
 * más que suficiente para entrenar y mantiene chico el free tier de Supabase.
 */
async function limpiar(dias = 180) {
  if (!disponible) return;
  try {
    await db.query(`DELETE FROM search_click WHERE created_at < NOW() - ($1 || ' days')::interval`, [String(dias)]);
    await db.query(`DELETE FROM search_log   WHERE created_at < NOW() - ($1 || ' days')::interval`, [String(dias)]);
  } catch (err) { apagar(err); }
}

module.exports = { registrarBusqueda, registrarClick, limpiar };
