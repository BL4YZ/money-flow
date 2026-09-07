/**
 * Sucursales cercanas.
 *
 * El comparador dice "Tata es el más barato para tu lista". La pregunta que
 * sigue siempre es "¿y dónde queda?". Con las 879 sucursales geolocalizadas del
 * SIPC, "el más barato" pasa a ser "el más barato, a 600 m".
 *
 * Se cargan una vez al arrancar (184 KB) y se resuelve todo en memoria: son
 * menos de mil puntos, así que recorrerlos enteros cuesta menos que cualquier
 * índice espacial y no agrega una dependencia.
 */

const path = require("path");

let TIENDAS = [];
try {
  TIENDAS = require(path.join(__dirname, "..", "data", "sipc-stores.json"));
} catch (e) {
  console.warn("[cercanía] sipc-stores.json no encontrado; función desactivada");
}

const R_TIERRA_KM = 6371;
const rad = (g) => (g * Math.PI) / 180;

/**
 * Distancia en kilómetros entre dos puntos. Haversine: para las decenas de km
 * que abarca una ciudad el error contra una geodésica real es de metros, y no
 * justifica traerse una librería.
 */
function distanciaKm(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R_TIERRA_KM * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Sucursales más cercanas a un punto.
 *
 * @param {number} lat, lng   ubicación del usuario
 * @param {object} opts
 *   storeIds  restringe a estas cadenas (las que tienen precio online)
 *   radioKm   descarta lo que esté más lejos; sin esto, en el interior
 *             devolvería sucursales de Montevideo como "cercanas"
 *   limite    cuántas devolver
 */
function cercanas(lat, lng, { storeIds = null, radioKm = 15, limite = 5 } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || TIENDAS.length === 0) return [];

  const candidatas = storeIds
    ? TIENDAS.filter((t) => t.storeId && storeIds.includes(t.storeId))
    : TIENDAS;

  return candidatas
    .map((t) => ({ ...t, distanciaKm: Number(distanciaKm(lat, lng, t.lat, t.lng).toFixed(2)) }))
    .filter((t) => t.distanciaKm <= radioKm)
    .sort((a, b) => a.distanciaKm - b.distanciaKm)
    .slice(0, limite);
}

/**
 * La sucursal más cercana de CADA cadena pedida. Es lo que necesita el
 * comparador: no "las 5 más cercanas" —que podrían ser cinco Tata— sino
 * "el Tata más cercano y el Disco más cercano", para poder decidir.
 */
function masCercanaPorCadena(lat, lng, storeIds, radioKm = 15) {
  const out = {};
  for (const id of storeIds || []) {
    const c = cercanas(lat, lng, { storeIds: [id], radioKm, limite: 1 });
    if (c.length > 0) out[id] = c[0];
  }
  return out;
}

module.exports = { cercanas, masCercanaPorCadena, distanciaKm, _total: TIENDAS.length };
