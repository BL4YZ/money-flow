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
  teclado: ['keyboard'], keyboard: ['teclado'],
  mouse: ['raton'], raton: ['mouse'],
  lapiz: ['pencil', 'stylus'],
  auriculares: ['audifonos', 'headphones'], audifonos: ['auriculares'],
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

// ─── Match de token: prefijo de palabra, no substring ─────────────
// Buscar "ipad" traía como PRIMER resultado un "Disipador CPU Cougar": la
// palabra "d-i-s-IPAD-o-r" contiene "ipad" literalmente. Con `.includes()`
// el token matcheaba, sumaba el bonus de frase exacta (+10) y el de
// sustantivo principal (+5), y se iba al tope del ranking.
//
// No alcanza con exigir palabra completa (`\bipad\b`): el match por prefijo
// es necesario para la morfología del español — "panal" tiene que encontrar
// "panales", "leche" → "leches", "fideo" → "fideos".
//
// La observación que lo resuelve: el español extiende las palabras por el
// FINAL (plurales, género), nunca por el principio. Entonces exigimos que el
// token arranque en borde de palabra Y que lo que sobre sea un sufijo
// flexivo plausible. Eso deja pasar "panal|es" y corta "sal|sa",
// "pan|talon", "mesa|da" y el "dis|ipad|or" original.
const INFLECTION_SUFFIXES = new Set(['', 's', 'es', 'as', 'os', 'a', 'o']);

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesToken(token, text) {
  const re = new RegExp(`\\b${escapeRe(token)}(\\w*)`, 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    if (INFLECTION_SUFFIXES.has(m[1])) return true;
  }
  return false;
}

// ¿El token (o alguno de sus sinónimos) está en el nombre del producto?
function tokenInProduct(token, pNorm) {
  if (matchesToken(token, pNorm)) return true;
  const syns = SYNONYMS[token];
  return syns ? syns.some((s) => matchesToken(s, pNorm)) : false;
}

// Igual que arriba pero para una frase completa ("coca cola 2l"): cada token
// de la frase tiene que aparecer, en orden y contiguo. Reemplaza al
// `includes(normalizedQuery)` que otorgaba el bonus de frase exacta.
function phraseInProduct(phrase, pNorm) {
  const parts = String(phrase).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return false;
  const body = parts.map(escapeRe).join('\\s+');
  return new RegExp(`\\b${body}(\\w*)`).test(pNorm)
    && INFLECTION_SUFFIXES.has((pNorm.match(new RegExp(`\\b${body}(\\w*)`)) || [, ''])[1]);
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
  // Periféricos: aparecen nombrando el equipo al que acompañan y sin ningún
  // conector que la regla gramatical pueda ver ("Apple Magic Keyboard iPad
  // Pro 11'' y iPad Air"), así que sólo los agarra la lista.
  'teclado', 'keyboard', 'mouse', 'raton', 'lapiz', 'pencil', 'stylus',
  'stick', 'chromecast',  // un TV Stick se enchufa a un TV, no es un TV
  'disipador', 'cooler', 'ventilador para',
];

// Regla gramatical, complementaria a la lista de palabras: "X para Y" /
// "X compatible con Y" donde Y es lo que buscamos y X no. Generaliza sin
// tener que anticipar cada sustantivo posible de accesorio — "Cámara para
// Nintendo Switch 2" se detecta aunque "cámara" no estuviera en la lista.
// "Notebook para estudiantes" buscando "notebook" NO se marca, porque el
// producto buscado aparece ANTES del "para": es el producto, no un accesorio.
const ACCESSORY_CONNECTORS = /\b(para|compatible con|apto para)\b/;

// ¿La búsqueda pidió este accesorio? Tiene que mirar sinónimos, no sólo
// igualdad literal: buscando "teclado", el producto se llama "Magic Keyboard"
// y una comparación palabra a palabra lo marcaba como accesorio ajeno —
// justo lo que el usuario estaba buscando.
// La equivalencia tiene que mirarse en LAS DOS DIRECCIONES. Con el lookup en
// un solo sentido, buscar "apple pencil" marcaba como accesorio ajeno a los
// cuatro Apple Pencil reales: el producto se llama "Lápiz Apple Pencil", la
// palabra de la lista que dispara es "lapiz", y `SYNONYMS['pencil']` no
// existía aunque sí estuviera definido `lapiz: ['pencil']`.
//
// El síntoma era intermitente y por eso confuso: sin filtro de categoría
// TODOS los resultados quedaban marcados como accesorio, la red de seguridad
// los devolvía enteros y se veía bien; con categoría, un resultado cualquiera
// no era accesorio, la red no se activaba y desaparecían los Pencils de
// verdad dejando sólo lo que no tenía nada que ver.
function queryAsksFor(word, queryTokens) {
  if (queryTokens.includes(word)) return true;
  const wordSyns = SYNONYMS[word] || [];
  return queryTokens.some((qt) => {
    if (qt === word) return true;
    if (wordSyns.includes(qt)) return true;          // lapiz → pencil
    const syns = SYNONYMS[qt];
    return syns ? syns.includes(word) : false;       // pencil → lapiz
  });
}

function isAccessoryFor(queryTokens, pNorm) {
  // 1. Lista de palabras: menciona un accesorio que la búsqueda no pidió
  const byWord = ACCESSORY_WORDS.some(
    (word) => matchesToken(word, pNorm) && !queryAsksFor(word, queryTokens)
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

// ─── "X de Y": lo buscado como ingrediente, no como producto ──────
// En español "Chocolate de Leche" / "Crema de Leche" / "Yogur con Leche"
// son chocolate, crema y yogur — no leche. Buscando "leche", los tres
// matchean el token igual que "Leche Conaprole 1L", y como suelen ser más
// baratos se quedaban con el puesto de "más barato". Detecta que el término
// buscado aparece SOLO detrás de un conector y que el producto arranca con
// otra cosa. La posición sola no alcanzaba: en "Chocolate Batón de Leche"
// la palabra cae igual entre los primeros tokens.
const MODIFIER_CONNECTORS = '(?:de|con|sabor|rellen\\w+ de|base de)';

function isModifierMention(mainToken, pNorm) {
  if (!mainToken) return false;
  const tokens = pNorm.split(' ').filter(Boolean);
  if (tokens.length === 0) return false;
  // Si el producto EMPIEZA con lo buscado, es el producto ("Leche Conaprole")
  if (tokens[0].includes(mainToken)) return false;
  const re = new RegExp(`\\b${MODIFIER_CONNECTORS}\\s+${mainToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  return re.test(pNorm);
}

// ─── "Sin X": el producto anuncia la AUSENCIA de lo buscado ───────
// "Pulpa de Tomate SIN AZÚCAR" contiene la palabra "azúcar" y matcheaba la
// búsqueda de azúcar — es literalmente el producto opuesto al pedido.
//
// Pero no se puede excluir siempre: buscando "lactosa" o "gluten", lo que la
// gente quiere ES el producto "sin lactosa" / "sin gluten". Nadie compra
// lactosa suelta.
//
// La diferencia no se resuelve con una lista de palabras sino mirando los
// datos: si en los resultados existen productos donde el término aparece
// afirmado ("Azúcar Bella Unión"), entonces los "sin azúcar" son ruido. Si
// NINGÚN producto lo afirma (nadie vende "Lactosa 1kg"), la búsqueda tiene
// que ser sobre la ausencia y los conservamos. Ver el uso en routes/prices.js.
const NEGATION_CONNECTORS = '(?:sin|libre de|cero|0%)';

function isNegatedMention(token, pNorm) {
  if (!token) return false;
  const t = escapeRe(token);
  // ¿Aparece al menos una vez SIN estar negado? Entonces no es una negación.
  const afirmado = new RegExp(`(?:^|[^a-z])(?<!${NEGATION_CONNECTORS} )${t}`);
  const negado = new RegExp(`\\b${NEGATION_CONNECTORS}\\s+${t}\\b`);
  if (!negado.test(pNorm)) return false;
  // Si el término también aparece afirmado en otra parte del nombre
  // ("Leche sin lactosa" buscando "leche"), no lo tratamos como negación.
  const sinNegaciones = pNorm.replace(new RegExp(`\\b${NEGATION_CONNECTORS}\\s+${t}\\b`, 'g'), ' ');
  return !matchesToken(token, sinNegaciones);
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

// ─── Cantidad y precio por unidad ─────────────────────────────────
// El problema #1 de los comparadores de precios ("pack size chaos"):
// comparar por precio absoluto hace que un envase chico gane siempre.
// Medido en vivo acá: "Leche Frutilla 250 ml $44" salía como más barata
// que "Leche Conaprole 1L $45" — pero son $176/L contra $45/L. Como el
// total de "Carrito óptimo" se arma con el más barato de cada ítem, la
// cifra principal recomendaba sistemáticamente la peor opción por unidad.
//
// Unidades base: ml (volumen), g (peso), m (largo), un (cantidad).
const UNIT_FAMILIES = [
  { base: 'ml', factor: 1000, re: /(\d+(?:[.,]\d+)?)\s*(?:litros?|lts?|l)\b/ },
  { base: 'ml', factor: 1,    re: /(\d+(?:[.,]\d+)?)\s*(?:mililitros?|ml|cc)\b/ },
  { base: 'g',  factor: 1000, re: /(\d+(?:[.,]\d+)?)\s*(?:kilogramos?|kilos?|kgs?)\b/ },
  { base: 'g',  factor: 1,    re: /(\d+(?:[.,]\d+)?)\s*(?:gramos?|grs?|g)\b/ },
  { base: 'm',  factor: 1,    re: /(\d+(?:[.,]\d+)?)\s*(?:metros?|mtrs?|mts?|m)\b/ },
];

// "4 un.", "12 unidades", "6 rollos", "24 comprimidos", "10 Comp."
const COUNT_RE = /(?:^|\s|x)\s*(\d+)\s*(?:un\b|unid\w*|unidades?|u\b|rollos?|comp\w*|caps\w*|capsulas?|tabletas?|sobres?|pa[ñn]os?)/;
// Conteo al final sin palabra de unidad, como lo escriben varias tiendas:
// "Pañales HUGGIES Natural Care XXG x 100" → 100 unidades.
const TRAILING_COUNT_RE = /[x×]\s*(\d+)\s*$/;
// Multipack explícito: "6 x 330 ml", "2 x 500 g", "4x1kg"
const MULTIPACK_RE = /(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(litros?|lts?|l|mililitros?|ml|cc|kilogramos?|kilos?|kgs?|gramos?|grs?|g|metros?|mtrs?|mts?|m)\b/;
// Multipack con la unidad pegada, como lo escriben varias tiendas:
// "12unx30mtrs", "16Un X30Mt" → 12 rollos × 30 m. Va antes que MULTIPACK_RE
// porque ese leería "12" x "30" perdiendo que son unidades por rollo.
const PACK_COUNT_RE = /(\d+)\s*u\w*\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(litros?|lts?|l|mililitros?|ml|cc|kilogramos?|kilos?|kgs?|gramos?|grs?|g|metros?|mtrs?|mts?|m)\b/;

function toNumber(s) {
  return parseFloat(String(s).replace(',', '.'));
}

function familyFor(unitWord) {
  const w = unitWord.toLowerCase();
  if (/^(litros?|lts?|l)$/.test(w)) return { base: 'ml', factor: 1000 };
  if (/^(mililitros?|ml|cc)$/.test(w)) return { base: 'ml', factor: 1 };
  if (/^(kilogramos?|kilos?|kgs?)$/.test(w)) return { base: 'g', factor: 1000 };
  if (/^(gramos?|grs?|g)$/.test(w)) return { base: 'g', factor: 1 };
  if (/^(metros?|mtrs?|mts?|m)$/.test(w)) return { base: 'm', factor: 1 };
  return null;
}

/**
 * Extrae la cantidad total del nombre de un producto.
 * "Leche Conaprole 1L"            → { qty: 1000, unit: 'ml' }
 * "Coca Cola 6 x 330 ml"          → { qty: 1980, unit: 'ml' }  (multipack expandido)
 * "Papel higiénico Noble 4 un. 30 m" → { qty: 120, unit: 'm' } (4 rollos × 30 m)
 * "Pañales Trial T G 60 U"        → { qty: 60,  unit: 'un' }
 * Devuelve null si no hay nada parseable.
 */
function parseQuantity(name) {
  const n = normalizeForQty(name);

  // 1. Multipack explícito ("6 x 330 ml", "12unx30mtrs") — gana sobre el resto
  const multi = n.match(PACK_COUNT_RE) || n.match(MULTIPACK_RE);
  if (multi) {
    const fam = familyFor(multi[3]);
    if (fam) {
      return { qty: toNumber(multi[1]) * toNumber(multi[2]) * fam.factor, unit: fam.base };
    }
  }

  // 2. Medida por familia (litros, gramos, metros…)
  let measure = null;
  for (const fam of UNIT_FAMILIES) {
    const m = n.match(fam.re);
    if (m) { measure = { qty: toNumber(m[1]) * fam.factor, unit: fam.base }; break; }
  }

  // 3. Conteo de unidades ("4 un.", "60 U", "2 rollos", "... x 100")
  const countMatch = n.match(COUNT_RE) || n.match(TRAILING_COUNT_RE);
  const count = countMatch ? toNumber(countMatch[1]) : null;

  // Conteo + medida = multipack implícito ("4 un. 30 m" → 120 m)
  if (measure && count && count > 1) return { qty: measure.qty * count, unit: measure.unit };
  if (measure) return measure;
  if (count) return { qty: count, unit: 'un' };
  return null;
}

// Normalización propia para cantidades: NO colapsa "500 ml" en "500ml"
// (necesitamos el número y la unidad por separado) pero sí baja a minúscula
// y saca puntuación que rompa los regex.
function normalizeForQty(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9.,x×\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Etiqueta legible para mostrar el precio por unidad: por L / por kg / por m / c/u
const UNIT_DISPLAY = {
  ml: { per: 1000, label: 'L' },
  g:  { per: 1000, label: 'kg' },
  m:  { per: 100,  label: '100m' },
  un: { per: 1,    label: 'un' },
};

/**
 * Agrega `unitPrice` + `unitLabel` a cada ítem que tenga cantidad parseable.
 * `unitPrice` queda en la escala que se muestra (por litro, por kilo, por
 * metro, por unidad) para que el frontend no tenga que convertir nada.
 */
function withUnitPrices(items) {
  return items.map((item) => {
    const q = parseQuantity(item.name);
    if (!q || !(q.qty > 0) || !(item.price > 0)) return item;
    const disp = UNIT_DISPLAY[q.unit];
    if (!disp) return item;
    return {
      ...item,
      unitPrice: Math.round((item.price / q.qty) * disp.per * 100) / 100,
      unitLabel: disp.label,
      unitQty: q.qty,
      unitBase: q.unit,
    };
  });
}

// Comparador para elegir la mejor oferta entre productos igual de relevantes:
// si ambos tienen precio por unidad en la MISMA unidad base, gana el mejor
// precio por unidad; si no, se cae al precio absoluto (comportamiento previo).
// ─── Respaldo de tienda: quedarse con la cabeza, no con la cola ───
// El respaldo confía en el buscador de la tienda cuando el nuestro no encontró
// nada, y eso resuelve "ibuprofeno" → Perifar/Actron. Pero arrastra también la
// expansión difusa de la propia tienda, que vive en la COLA de su listado:
// Farmashop devuelve para "barbijo" cuatro "Tapaboca Safy" (que es exactamente
// lo buscado) en las posiciones 1-4 y cuatro "Muñeca Barbie" en las 5-8 — su
// buscador estiró "barbijo" hasta "Barbie".
//
// Como las tiendas rankean sus propios resultados por relevancia, quedarse con
// los primeros de cada una conserva lo bueno y corta lo que el propio buscador
// puso último por poco confiable.
function topPerStore(items, k = 4) {
  const vistos = {};
  return items.filter((i) => {
    const key = i.storeId || i.store || '?';
    vistos[key] = (vistos[key] || 0) + 1;
    return vistos[key] <= k;
  });
}

// ─── Coherencia de CATEGORÍA dentro de un set de resultados ───────
// El problema: productos de categorías distintas que comparten el sustantivo.
// "Agua Lavandina" es lejía, "Aceite 15W40" es aceite de motor — los dos
// empiezan con la palabra buscada, así que ninguna regla de texto (accesorio,
// modificador, sustantivo principal) los distingue de un agua mineral o de un
// aceite de girasol. Hace falta taxonomía, no más reglas sobre el nombre.
//
// De dónde sale: la API de El Dorado (VTEX) devuelve la categoría real del
// producto — "/Bebidas/Bebidas Sin Alcohol/Aguas y Aguas Saborizadas/" contra
// "/Limpieza/Limpieza Hogar/Desinfectantes/". Es la única tienda que da la
// ruta legible (Tata sólo da IDs numéricos, el resto nada).
//
// Cómo se generaliza a las tiendas que NO la dan: no se propaga la categoría
// sino su VOCABULARIO. Con la rama mayoritaria del set identificada, las
// palabras que aparecen sólo en la rama minoritaria ("lavandina",
// "desinfectante") pasan a ser señal de "otra categoría" para CUALQUIER
// tienda. Una sola tienda con taxonomía alcanza para limpiar el set entero, y
// el vocabulario se aprende por búsqueda en vez de estar escrito a mano.
const CATEGORY_MAJORITY = 0.6;
const MIN_CATEGORIZED = 4;

function topCategory(path) {
  const seg = String(path || '').split('/').filter(Boolean);
  return seg.length ? normalize(seg[0]) : null;
}

function learnOffCategoryTokens(items, queryTokens = []) {
  const conCat = items.filter((i) => i.category && topCategory(i.category));
  if (conCat.length < MIN_CATEGORIZED) return new Set();

  const conteo = {};
  conCat.forEach((i) => {
    const c = topCategory(i.category);
    conteo[c] = (conteo[c] || 0) + 1;
  });
  const [dominante, n] = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0];
  if (n / conCat.length < CATEGORY_MAJORITY) return new Set();  // set mezclado, no opinamos

  // Vocabulario de la rama mayoritaria: nada que aparezca acá puede usarse
  // como señal de "otra categoría".
  const vocabOk = new Set();
  conCat.filter((i) => topCategory(i.category) === dominante)
    .forEach((i) => tokenize(i.name).forEach((t) => vocabOk.add(t)));

  // Palabras exclusivas de la rama minoritaria. Se excluyen los tokens de la
  // propia búsqueda ("agua" aparece en ambas ramas y no distingue nada) y los
  // muy cortos, que suelen ser códigos o abreviaturas.
  const off = new Set();
  conCat.filter((i) => topCategory(i.category) !== dominante)
    .forEach((i) => tokenize(i.name).forEach((t) => {
      if (t.length >= 4 && !vocabOk.has(t) && !queryTokens.includes(t) && !/\d/.test(t)) off.add(t);
    }));
  return off;
}

// Marca (no excluye) los ítems de cualquier tienda que usen el vocabulario de
// la categoría minoritaria.
function markOffCategoryItems(items, queryTokens = []) {
  const off = learnOffCategoryTokens(items, queryTokens);
  if (off.size === 0) return items;
  return items.map((i) => {
    const t = tokenize(i.name);
    return t.some((w) => off.has(w)) ? { ...i, _offCategory: true } : i;
  });
}

// ─── Coherencia de unidad dentro de un set de resultados ──────────
// compareByValue sólo compara precio por unidad cuando la unidad BASE coincide
// (comparar $/kg contra $/L no significa nada). Cuando no coincide cae a
// precio absoluto — y ahí el envase más chico gana siempre.
//
// Eso hacía que buscando "refresco" ganara un sobre de "Refresco TANG naranja
// mango 15 g" a $30: es polvo para preparar, se mide en gramos, así que nunca
// se compara por litro contra una botella y su precio absoluto es imbatible.
// El mismo patrón aparece con cualquier concentrado, saborizante o repuesto
// que se venda junto al producto listo.
//
// Se marca (no se excluye) el ítem cuya unidad difiere de la dominante del
// set. Requiere una mayoría clara y al menos 3 ítems con unidad, para que en
// categorías donde el envase varía de por sí (hogar, ropa) no haga nada.
function markOffUnitItems(items) {
  const bases = items.map((i) => i.unitBase).filter(Boolean);
  if (bases.length < 3) return items;

  const conteo = {};
  bases.forEach((b) => { conteo[b] = (conteo[b] || 0) + 1; });
  const [dominante, n] = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0];
  if (n / bases.length < 0.6) return items;   // sin mayoría clara, no opinamos

  return items.map((i) => (
    i.unitBase && i.unitBase !== dominante ? { ...i, _offUnit: true } : i
  ));
}

function compareByValue(a, b) {
  if (a.unitPrice && b.unitPrice && a.unitBase === b.unitBase) {
    return a.unitPrice - b.unitPrice;
  }
  return a.price - b.price;
}

// ─── BM25 ─────────────────────────────────────────────────────────
// Reemplaza el "+3 por keyword" plano por un score con dos propiedades que
// esa fórmula no tenía: IDF (una palabra rara y discriminante como
// "anticaspa" pesa más que una común como "shampoo", sin calibrarlo a mano)
// y saturación (que un término aparezca 5 veces no lo hace 5× más relevante).
const BM25_K1 = 1.2;
const BM25_B = 0.75;

// El "corpus" es el set de resultados de ESTA búsqueda. Es chico (50-200
// ítems), pero es exactamente la pregunta que importa: dentro de estos
// candidatos, ¿qué término de mi búsqueda discrimina más?
function buildCorpusStats(items) {
  const docs = items.map((it) => tokenize(it.name));
  const df = new Map();
  let totalLen = 0;
  docs.forEach((toks) => {
    totalLen += toks.length;
    new Set(toks).forEach((t) => df.set(t, (df.get(t) || 0) + 1));
  });
  return { df, N: docs.length || 1, avgLen: totalLen / (docs.length || 1) || 1 };
}

function bm25Score(queryTokens, productTokens, stats) {
  if (queryTokens.length === 0 || productTokens.length === 0) return 0;
  const freq = new Map();
  productTokens.forEach((t) => freq.set(t, (freq.get(t) || 0) + 1));
  const docLen = productTokens.length;

  let score = 0;
  for (const qt of queryTokens) {
    // Cuenta también matches por substring/sinónimo, no sólo token exacto:
    // los títulos pegan unidades y modelos ("1lt", "55") y perderíamos señal.
    let f = freq.get(qt) || 0;
    if (f === 0 && productTokens.some((pt) => pt.includes(qt) || tokenInProduct(qt, pt))) f = 1;
    if (f === 0) continue;

    const n = stats.df.get(qt) || 0;
    const idf = Math.log(1 + (stats.N - n + 0.5) / (n + 0.5));
    score += idf * (f * (BM25_K1 + 1)) / (f + BM25_K1 * (1 - BM25_B + BM25_B * (docLen / stats.avgLen)));
  }
  return score;
}

// ─── Tolerancia a typos ───────────────────────────────────────────
// Sólo como red de seguridad: se usa cuando la búsqueda exacta trae muy
// pocos resultados, y los matches difusos siempre rankean por debajo de los
// exactos. La distancia permitida escala con el largo de la palabra y los
// tokens cortos exigen match exacto (si no, "pan" matchearía "pon", "san"…).
function levenshtein(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 99; // corte temprano
  const prev = new Array(b.length + 1);
  const cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

function allowedTypos(token) {
  if (token.length < 5) return 0;   // tokens cortos: siempre exacto
  if (token.length < 8) return 1;
  return 2;
}

// ¿El token matchea algún token del producto tolerando N typos?
// Nunca aplica a tokens con dígitos: un modelo mal matcheado ("i5" vs "i7",
// "switch 2" vs "switch 3") es peor que no encontrar nada.
function tokenInProductFuzzy(token, productTokens) {
  if (/\d/.test(token)) return false;
  const budget = allowedTypos(token);
  if (budget === 0) return false;
  return productTokens.some((pt) => !/\d/.test(pt) && levenshtein(token, pt) <= budget);
}

// ─── Entity resolution: agrupar el MISMO producto entre tiendas ───
//
// Un comparador serio no compara "lo más barato que matchea tu búsqueda en
// cada tienda": primero resuelve qué listados son el mismo producto y recién
// después compara precios. Ejemplo real de estos datos: "Papel Higiénico
// HIGIENOL Max 8 Rollos x 90 mts" (Tienda Inglesa, $538) y "Papel higiénico
// HIGIENOL Max 90 m x 8 un." (Disco, $520) son el mismo paquete escrito
// distinto — sin agrupar son dos filas sueltas y el usuario no ve que hay
// $18 de diferencia por lo mismo.
//
// Pipeline estándar de entity resolution: bloquear (por cantidad) → comparar
// (Jaccard ponderado por IDF + guardas duras) → clusterizar (union-find).
//
// El sesgo es CONSERVADOR: un merge equivocado muestra "$45 en Disco, $12 en
// Tata" para productos distintos, que es peor que no agrupar. Umbral calibrado
// contra datos reales: en 0.5 empieza a unir marcas distintas (Calcar con
// Conaprole) y la línea regular con la Ultra; en 0.72 no comete errores.
const GROUPING_THRESHOLD = 0.72;
const MAX_BLOCK_SIZE = 120; // corta el O(n²) en bloques patológicos

// Variantes mutuamente excluyentes: si difieren acá NO son el mismo producto
// por más que todo lo demás coincida. Es la guarda dura contra el error más
// caro (confundir entera con descremada, o zero con común).
const VARIANT_GROUPS = [
  ['entera', 'descremada', 'semidescremada'],
  ['deslactosada', 'lactosa'],
  ['zero', 'light', 'diet', 'regular', 'original'],
  ['chocolatada', 'frutilla', 'vainilla', 'natural'],
  ['blanco', 'negro', 'integral'],
  ['grande', 'chico', 'mediano'],
  ['frio', 'calor'],
];

function variantSignature(tokens) {
  return VARIANT_GROUPS.map((grupo) => grupo.filter((v) => tokens.includes(v)).sort().join('+'));
}

function variantConflict(sigA, sigB) {
  for (let i = 0; i < sigA.length; i++) {
    if (sigA[i] && sigB[i] && sigA[i] !== sigB[i]) return true;
  }
  return false;
}

// Jaccard ponderado por IDF: "leche" (común) pesa poco, "conaprole" (rara)
// pesa mucho. Sin la ponderación, dos leches de marcas distintas comparten
// tantas palabras genéricas que se verían casi idénticas.
function weightedJaccard(tokensA, tokensB, stats) {
  const A = new Set(tokensA), B = new Set(tokensB);
  let inter = 0, union = 0;
  for (const t of new Set([...A, ...B])) {
    const n = stats.df.get(t) || 0;
    const w = Math.log(1 + (stats.N - n + 0.5) / (n + 0.5));
    union += w;
    if (A.has(t) && B.has(t)) inter += w;
  }
  return union > 0 ? inter / union : 0;
}

/**
 * Agrupa listados equivalentes en productos canónicos.
 * Devuelve [{ name, image, minPrice, maxPrice, unitPrice, unitLabel,
 *             storeCount, offers: [...] }], ordenado por el mejor precio.
 */
function groupProducts(items) {
  if (items.length === 0) return [];

  const stats = buildCorpusStats(items);
  const enriched = items.map((it, i) => {
    const tokens = tokenize(it.name);
    const q = parseQuantity(it.name);
    return {
      item: it, i,
      norm: normalize(it.name),
      tokens,
      variantSig: variantSignature(tokens),
      blockKey: q ? `${q.unit}:${q.qty}` : 'sincant',
    };
  });

  const parent = enriched.map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };

  // Blocking: sólo se comparan productos de la misma cantidad. Además de
  // acotar el costo, es una guarda por sí misma — un pack de 1 L y uno de
  // 3 L no son el mismo producto por más parecido que sea el nombre.
  const blocks = new Map();
  enriched.forEach((e) => {
    if (!blocks.has(e.blockKey)) blocks.set(e.blockKey, []);
    blocks.get(e.blockKey).push(e);
  });

  for (const block of blocks.values()) {
    if (block.length > MAX_BLOCK_SIZE) continue;
    for (let i = 0; i < block.length; i++) {
      for (let j = i + 1; j < block.length; j++) {
        const a = block[i], b = block[j];
        if (a.item.storeId === b.item.storeId) continue;   // dos filas de la misma tienda no se fusionan
        if (variantConflict(a.variantSig, b.variantSig)) continue;
        if (a.norm === b.norm || weightedJaccard(a.tokens, b.tokens, stats) >= GROUPING_THRESHOLD) {
          union(a.i, b.i);
        }
      }
    }
  }

  const byRoot = new Map();
  enriched.forEach((e) => {
    const r = find(e.i);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(e.item);
  });

  const groups = [];
  for (const offers of byRoot.values()) {
    const ordered = [...offers].sort(compareByValue);
    const best = ordered[0];
    const prices = ordered.map((o) => o.price).filter((p) => p > 0);
    // Nombre canónico: el más descriptivo (el más largo) suele ser el que
    // trae marca y presentación completas.
    const canonical = ordered.reduce((a, b) => (b.name.length > a.name.length ? b : a), ordered[0]);
    groups.push({
      name: canonical.name,
      image: ordered.find((o) => o.image)?.image || null,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      unitPrice: best.unitPrice ?? null,
      unitLabel: best.unitLabel ?? null,
      currency: best.currency,
      originalPrice: best.originalPrice,
      storeCount: new Set(ordered.map((o) => o.storeId)).size,
      offers: ordered.map((o) => ({
        store: o.store, storeId: o.storeId, storeColor: o.storeColor,
        name: o.name, price: o.price, url: o.url,
        ...(o.listPrice ? { listPrice: o.listPrice } : {}),
        ...(o.unitPrice != null ? { unitPrice: o.unitPrice, unitLabel: o.unitLabel } : {}),
        ...(o.currency === 'USD' ? { currency: 'USD', originalPrice: o.originalPrice } : {}),
      })),
    });
  }

  return groups;
}

module.exports = {
  GROUPING_THRESHOLD,
  groupProducts,
  weightedJaccard,
  STOP_WORDS,
  SYNONYMS,
  ACCESSORY_WORDS,
  normalize,
  tokenize,
  buildSearchQuery,
  tokenInProduct,
  matchesToken,
  phraseInProduct,
  isAccessoryFor,
  hasAllModelTokens,
  isModifierMention,
  isNegatedMention,
  dedupeResults,
  filterPriceOutliers,
  parseQuantity,
  withUnitPrices,
  compareByValue,
  markOffUnitItems,
  markOffCategoryItems,
  topPerStore,
  learnOffCategoryTokens,
  buildCorpusStats,
  bm25Score,
  levenshtein,
  tokenInProductFuzzy,
};
