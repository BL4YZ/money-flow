/**
 * Primitivas compartidas de matching de productos.
 *
 * `routes/shopping.js` (comparador de carrito) y `routes/prices.js` (buscador)
 * tenían implementaciones duplicadas de normalización, tokenización y
 * detección de accesorios: cada bug de relevancia había que arreglarlo dos
 * veces y podían desincronizarse en silencio. Acá viven las piezas comunes.
 *
 * Lo que NO se comparte a propósito: la fórmula de ranking. shopping.js usa
 * un score 0-1 y se queda con el mejor match por tienda; prices.js usa un
 * score aditivo y devuelve una lista ordenada navegable. Son políticas
 * distintas para UX distintas, no duplicación.
 */

// ─── Normalización ────────────────────────────────────────────────
const STOP_WORDS = new Set([
  'de', 'con', 'para', 'el', 'la', 'los', 'las', 'un', 'una',
  'en', 'y', 'o', 'al', 'del', 'sin', 'por', 'su',
]);

// Sinónimos: un token de la búsqueda matchea si el producto usa otra palabra
// equivalente. Claves normalizadas (sin tildes). Ampliable según haga falta.
const SYNONYMS = {
  gaseosa: ['refresco'], refresco: ['gaseosa'],
  papa: ['papas'], papas: ['papa'],
  palta: ['aguacate'], aguacate: ['palta'],
  pancho: ['salchicha', 'salchichas'], salchicha: ['pancho', 'salchichas'],
  bidon: ['botellon'], botellon: ['bidon'],
  fideos: ['pasta', 'pastas'], pasta: ['fideos'],
  detergente: ['lavavajilla', 'lavavajillas'],
  panal: ['panales'], panales: ['panal'],
  yerba: ['yerba mate'],
  choclo: ['maiz'], maiz: ['choclo'],
  durazno: ['duraznos', 'melocoton'],
  arveja: ['arvejas', 'guisantes'],
};

// Quita tildes y unifica abreviaturas de volumen/peso ("3 litros" → "3l"),
// para que la cantidad quede como un token compuesto y no como un dígito
// suelto que matchearía cualquier producto que mencione ese número.
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    // Cada familia de unidad incluye la forma escrita Y la abreviatura que
    // realmente usan las etiquetas ("2 L", "500 ml", "1 kg", "400 g"). Antes
    // solo se plegaba la forma escrita: la búsqueda "coca cola 2 litros"
    // quedaba como "2l" pero el producto "Coca Cola 2 L" seguía siendo
    // "2 l" (dos tokens) y no matcheaba. El orden importa: ml antes que l.
    .replace(/\b(\d+)\s*(?:mililitros?|ml)\b/g, '$1ml')
    .replace(/\b(\d+)\s*(?:litros?|lts?|l)\b/g, '$1l')
    .replace(/\b(\d+)\s*(?:kilogramos?|kilos?|kgs?)\b/g, '$1kg')
    .replace(/\b(\d+)\s*(?:gramos?|grs?|g)\b/g, '$1g')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Los tokens con dígitos sobreviven aunque sean de 1 carácter: el "2" de
// "Nintendo Switch 2" es lo único que lo distingue de la consola original.
function tokenize(text) {
  return normalize(text)
    .split(' ')
    .filter((w) => (w.length > 1 || /\d/.test(w)) && !STOP_WORDS.has(w));
}

// Query "limpia" que se le manda al buscador de cada tienda (sin stop-words)
function buildSearchQuery(raw) {
  const tokens = tokenize(raw);
  return tokens.length > 0 ? tokens.join(' ') : normalize(raw);
}

// ¿El token (o alguno de sus sinónimos) está en el nombre del producto?
function tokenInProduct(token, pNorm) {
  if (pNorm.includes(token)) return true;
  const syns = SYNONYMS[token];
  return syns ? syns.some((s) => pNorm.includes(s)) : false;
}

// ─── Detección de accesorios ──────────────────────────────────────
// Los accesorios repiten el nombre completo del producto principal en su
// título (SEO de e-commerce): "Nintendo Switch 2 Pack Volantes Joy-Con"
// matchea el 100% de los tokens de "nintendo switch 2" igual que la consola
// real, y al desempatar por precio el accesorio (mucho más barato) ganaba.
const ACCESSORY_WORDS = [
  'funda', 'case', 'estuche', 'protector', 'templado', 'vidrio',
  'pack', 'combo', 'kit',
  'volante', 'volantes', 'joystick', 'control', 'mando', 'gamepad',
  'cargador', 'cable', 'adaptador', 'powerbank', 'bateria',
  'soporte', 'base', 'mochila', 'bolso',
  'auriculares', 'audifonos', 'correa', 'grip', 'skin', 'vinilo',
  'camara', 'microfono',
  'juego', 'videojuego', 'accesorio', 'accesorios', 'repuesto', 'repuestos',
  'memoria', 'microsd', 'playstand', 'stand', 'dock', 'webcam',
  'estacion', 'portal', 'remoto',
];

// Regla gramatical, complementaria a la lista de palabras: "X para Y" /
// "X compatible con Y" donde Y es lo que buscamos y X no. Generaliza sin
// tener que anticipar cada sustantivo posible de accesorio — "Cámara para
// Nintendo Switch 2" se detecta aunque "cámara" no estuviera en la lista.
// "Notebook para estudiantes" buscando "notebook" NO se marca, porque el
// producto buscado aparece ANTES del "para": es el producto, no un accesorio.
const ACCESSORY_CONNECTORS = /\b(para|compatible con|apto para)\b/;

function isAccessoryFor(queryTokens, pNorm) {
  // 1. Lista de palabras: menciona un accesorio que la búsqueda no pidió
  const byWord = ACCESSORY_WORDS.some(
    (word) => pNorm.includes(word) && !queryTokens.includes(word)
  );
  if (byWord) return true;

  // 2. Gramática: "<algo> para <lo que busqué>"
  const match = pNorm.match(ACCESSORY_CONNECTORS);
  if (!match) return false;
  const head = pNorm.slice(0, match.index);          // lo que va antes del "para"
  const tail = pNorm.slice(match.index + match[0].length); // lo que va después

  const contentTokens = queryTokens.filter((t) => !/^\d+$/.test(t));
  if (contentTokens.length === 0) return false;

  const tailHasQuery = contentTokens.some((t) => tokenInProduct(t, tail));
  const headHasQuery = contentTokens.some((t) => tokenInProduct(t, head));
  return tailHasQuery && !headHasQuery;
}

// ─── Tokens de modelo/generación obligatorios ─────────────────────
// Un número (o código alfanumérico) después de un nombre propio suele ser la
// generación/modelo: "Switch 2" vs "Switch", "S24" vs "S23", "i7" vs "i5".
// Se exige match de palabra completa: si no, el "2" de la búsqueda matchea
// dentro de "32GB" o "2024" y deja pasar cualquier cosa.
function hasAllModelTokens(queryTokens, pNorm) {
  return queryTokens
    .filter((t) => /\d/.test(t))
    .every((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(pNorm));
}

// ─── Limpieza de resultados ───────────────────────────────────────

// Quita duplicados exactos (misma tienda + mismo nombre + mismo precio).
// Varias tiendas listan el mismo producto más de una vez y desperdiciaba
// lugares en la lista de resultados.
function dedupeResults(items) {
  const seen = new Set();
  return items.filter((it) => {
    const key = `${it.storeId}|${normalize(it.name)}|${it.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Descarta listados con precio absurdamente bajo respecto al resto de la
// misma búsqueda. Son placeholders rotos del lado de la tienda: confirmado
// en vivo un "Microondas" a $239 (sin marca ni modelo) conviviendo con
// microondas reales de $3.400 a $11.900 en Disco/Géant/Devoto. Importa
// porque el total de "Carrito óptimo" se calcula con el más barato de cada
// ítem: un placeholder corrompe la cifra principal de la app.
const OUTLIER_HARD_RATIO = 0.15; // <15% de la mediana: basura sin importar el nombre
const OUTLIER_SOFT_RATIO = 0.5;  // <50% Y sin marca/modelo en el nombre
const MIN_ITEMS_FOR_OUTLIERS = 5;

function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ¿El nombre no aporta información más allá de lo que ya dice la búsqueda?
// "Microondas" para la búsqueda "microondas" → sí (sospechoso).
// "Microondas Samsung MG23K3515AS" → no (tiene marca y modelo).
function addsNoInfo(queryTokens, productName) {
  const tokens = tokenize(productName);
  if (tokens.length === 0 || tokens.length > 2) return false;
  return tokens.every((t) => queryTokens.includes(t));
}

function filterPriceOutliers(items, queryTokens = []) {
  const priced = items.filter((i) => i.price > 0);
  if (priced.length < MIN_ITEMS_FOR_OUTLIERS) return items;

  const med = median(priced.map((i) => i.price));
  if (!med) return items;

  return items.filter((i) => {
    if (!(i.price > 0)) return true;
    if (i.price < med * OUTLIER_HARD_RATIO) return false;
    if (i.price < med * OUTLIER_SOFT_RATIO && addsNoInfo(queryTokens, i.name)) return false;
    return true;
  });
}

module.exports = {
  STOP_WORDS,
  SYNONYMS,
  ACCESSORY_WORDS,
  normalize,
  tokenize,
  buildSearchQuery,
  tokenInProduct,
  isAccessoryFor,
  hasAllModelTokens,
  dedupeResults,
  filterPriceOutliers,
};
