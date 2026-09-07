/**
 * "¿Está caro o barato?" — precio de hoy contra el precio habitual del producto.
 *
 * DE DÓNDE SALE EL "HABITUAL"
 *
 * Del SIPC: 13,4 millones de precios diarios de 2026, reducidos por
 * scripts/build-price-history.js a percentiles por producto (36 KB). Los
 * precios en oferta quedan fuera de la mediana — 1,68 millones de los 13,4 —
 * porque mezclarlos bajaría el "habitual" y haría que un precio normal
 * parezca caro.
 *
 * EL AJUSTE POR EL TIEMPO TRANSCURRIDO
 *
 * El volcado cubre enero-junio y se publicó en julio. Comparar un precio de hoy
 * contra una mediana de hace meses exagera todo hacia "caro". La tendencia
 * mensual de CADA producto se midió dentro del propio archivo y acá se usa para
 * proyectar la mediana hasta la fecha actual. El dato se corrige con el dato, en
 * vez de traer un índice externo que habría que mantener.
 *
 * EL MATCH ES ESTRICTO A PROPÓSITO
 *
 * Se exige tipo, marca Y envase. Decirle a alguien "esto está caro" comparándolo
 * contra otro producto es peor que no decir nada: el veredicto se muestra como
 * un hecho y el usuario no tiene cómo auditarlo. Ante la duda, no se opina.
 */

const path = require("path");
const { normalize, tokenize, matchesToken, parseQuantity } = require("./productMatcher");

let TIPOS = { productos: {} };
let HIST = { productos: {} };
try {
  TIPOS = require(path.join(__dirname, "..", "data", "sipc-types.json"));
  HIST = require(path.join(__dirname, "..", "data", "sipc-price-history.json"));
} catch (e) {
  console.warn("[historial] datos del SIPC no encontrados; función desactivada");
}

const TOLERANCIA_CANT = 0.1;   // ±10% de envase sigue siendo el mismo producto
const UMBRAL_CARO = 1.10;      // 10% sobre la mediana proyectada
const UMBRAL_BARATO = 0.92;

/**
 * Ficha oficial que corresponde a un producto scrapeado, o null.
 */
function fichaOficial(nombre) {
  const n = normalize(nombre);
  const q = parseQuantity(nombre);
  if (!n) return null;

  // Obligatorios: la MARCA, el ENVASE y el sustantivo del tipo. Exigir además
  // todas las palabras del tipo no funciona con los nombres de góndola: el tipo
  // oficial es "Yerba mate común" y el paquete dice "Yerba Canarias 1 Kg", sin
  // "mate" ni "común". Entre los candidatos que cumplen los tres requisitos se
  // elige el que más palabras del tipo comparte, para que "Aceite de girasol
  // Óptimo" no se confunda con "Aceite de maíz" de la misma marca y envase.
  let mejor = null;
  let mejorSolapamiento = -1;

  for (const [id, p] of Object.entries(TIPOS.productos || {})) {
    if (!HIST.productos[id]) continue;                  // sin historial no sirve
    if (!p.marca || !n.includes(p.marca)) continue;     // la marca es obligatoria
    if (!p.tipo.length || !matchesToken(p.tipo[0], n)) continue;
    if (p.qty) {
      if (!q || q.unit !== p.unit) continue;
      if (Math.abs(q.qty - p.qty) > p.qty * TOLERANCIA_CANT) continue;
    }
    const solapamiento = p.tipo.filter((t) => matchesToken(t, n)).length;
    if (solapamiento > mejorSolapamiento) {
      mejorSolapamiento = solapamiento;
      mejor = { id, ...HIST.productos[id] };
    }
  }
  return mejor;
}

/**
 * Veredicto sobre un precio. Devuelve null cuando no hay ficha — que es el caso
 * más común, porque la canasta oficial son 379 productos.
 */
function evaluar(nombre, precio, hoy = new Date()) {
  if (!Number.isFinite(precio) || precio <= 0) return null;
  const f = fichaOficial(nombre);
  if (!f || !f.mediana) return null;

  // Meses desde el final del período medido hasta hoy.
  const [anio, mes] = String(f.hasta || "").split("-").map(Number);
  let mesesPasados = 0;
  if (anio && mes) {
    mesesPasados = Math.max(0, (hoy.getFullYear() - anio) * 12 + (hoy.getMonth() + 1 - mes));
  }
  const factor = (1 + (f.tendenciaMensual || 0)) ** mesesPasados;
  const medianaHoy = f.mediana * factor;
  const ratio = precio / medianaHoy;

  let estado = "normal";
  if (ratio >= UMBRAL_CARO) estado = "caro";
  else if (ratio <= UMBRAL_BARATO) estado = "barato";

  return {
    estado,
    diferenciaPct: Math.round((ratio - 1) * 100),
    medianaHoy: Math.round(medianaHoy),
    rango: [Math.round(f.p25 * factor), Math.round(f.p75 * factor)],
    observaciones: f.n,
    periodo: [f.desde, f.hasta],
    mesesProyectados: mesesPasados,
  };
}

module.exports = { evaluar, fichaOficial, _productos: Object.keys(HIST.productos || {}).length };
