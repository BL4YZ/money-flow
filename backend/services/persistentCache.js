/**
 * Nivel 2 del caché: Postgres.
 *
 * POR QUÉ NO ALCANZA CON MEMORIA NI CON DISCO
 *
 * El caché del scraper vivía sólo en un `Map`, y el mapa de categorías se
 * guardaba en un archivo. Ninguno de los dos sobrevive en producción: en el
 * plan gratuito de Render el filesystem es **efímero** — se borra en cada
 * deploy, reinicio y apagado — y el servicio **duerme a los 15 minutos de
 * inactividad**. Para una app de uso esporádico eso significa que casi toda
 * primera búsqueda del día scrapea las 17 tiendas de cero.
 *
 * La documentación de Render recomienda Postgres justamente para esto, y ya
 * tenemos uno. Entonces: memoria como L1 (instantáneo), Postgres como L2
 * (sobrevive la siesta).
 *
 * REGLA DE ORO: el caché nunca puede romper la app. Si la base está caída,
 * pausada o —como en los scripts de evaluación— mockeada, cada función acá
 * falla en silencio y el scraper sigue funcionando como antes. Un caché que
 * tira la búsqueda es peor que no tener caché.
 */

const db = require("../db");

let disponible = true;   // se apaga solo al primer error, para no golpear una base caída
let avisado = false;

function apagar(err) {
  if (!avisado) {
    console.warn(`[cache-l2] deshabilitado: ${err.message}`);
    avisado = true;
  }
  disponible = false;
}

/**
 * Lee varias claves de una sola vez. Una búsqueda toca hasta 17 tiendas y
 * hacer 17 round-trips secuenciales anularía la ventaja de tener caché.
 */
async function leerVarias(claves) {
  if (!disponible || claves.length === 0) return new Map();
  try {
    const { rows } = await db.query(
      `SELECT key, value, fresh_until, stale_until
         FROM kv_cache
        WHERE key = ANY($1::text[]) AND stale_until > NOW()`,
      [claves],
    );
    const out = new Map();
    for (const r of rows) {
      out.set(r.key, {
        data: r.value,
        freshUntil: new Date(r.fresh_until).getTime(),
        staleUntil: new Date(r.stale_until).getTime(),
      });
    }
    return out;
  } catch (err) {
    apagar(err);
    return new Map();
  }
}

async function leer(clave) {
  const m = await leerVarias([clave]);
  return m.get(clave) || null;
}

/**
 * Escribe sin que nadie la espere: el resultado del scrape ya se le devolvió
 * al usuario, guardar es trabajo de fondo.
 */
function escribir(clave, data, freshUntil, staleUntil) {
  if (!disponible) return;
  db.query(
    `INSERT INTO kv_cache (key, value, fresh_until, stale_until, updated_at)
     VALUES ($1, $2::jsonb, to_timestamp($3 / 1000.0), to_timestamp($4 / 1000.0), NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           fresh_until = EXCLUDED.fresh_until,
           stale_until = EXCLUDED.stale_until,
           updated_at = NOW()`,
    [clave, JSON.stringify(data), freshUntil, staleUntil],
  ).catch(apagar);
}

/**
 * Borra lo vencido. Sin esto la tabla crece sin techo: cada término buscado
 * por cada tienda deja una fila. Se llama en el arranque, no en cada búsqueda.
 */
async function limpiar() {
  if (!disponible) return 0;
  try {
    const { rowCount } = await db.query(`DELETE FROM kv_cache WHERE stale_until < NOW()`);
    if (rowCount > 0) console.log(`[cache-l2] ${rowCount} entradas vencidas borradas`);
    return rowCount;
  } catch (err) {
    apagar(err);
    return 0;
  }
}

module.exports = { leer, leerVarias, escribir, limpiar, estaDisponible: () => disponible };
