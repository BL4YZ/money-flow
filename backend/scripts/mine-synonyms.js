/**
 * Mina sinónimos del catálogo real, en vez de escribirlos a mano.
 *
 *   node scripts/mine-synonyms.js [salida.json]
 *
 * POR QUÉ ESTO Y NO UN MODELO DE EMBEDDINGS
 *
 * El plan era búsqueda híbrida con embeddings estáticos. Medido contra la
 * restricción real, no entra: el modelo multilingüe más chico que sirve pesa
 * 103 MB cuantizado, y Render gratuito da 512 MB de RAM y 0.1 de CPU — la
 * propia documentación de Render dice "not AI inference". Con 0.1 CPU la
 * inferencia tardaría más que el scrape que intenta evitar.
 *
 * Pero el problema concreto que los embeddings iban a resolver es chico y
 * específico: sinonimia del retail uruguayo. "championes" y "zapatillas",
 * "pancho" y "salchicha", "lacteado" y "molde". Eso no necesita un modelo
 * entrenado en 119 idiomas — se puede aprender del catálogo que ya scrapeamos.
 *
 * CÓMO
 *
 * Dos palabras son parecidas si aparecen en los mismos contextos. Acá el
 * contexto es doble y ya lo tenemos:
 *
 *   1. La CATEGORÍA de la tienda (ver categoryMap.js). Todo lo que vive en
 *      "/Almacén/Panificados/Pan de Molde/" comparte función, aunque los
 *      nombres no compartan una sola palabra.
 *   2. El resto del NOMBRE del producto.
 *
 * Se cuenta co-ocurrencia, se pondera con PPMI —para que "de" y "1kg" no
 * dominen por frecuentes— y se mide coseno entre vectores de términos.
 *
 * La salida es un JSON de unos pocos MB que reemplaza a la lista SYNONYMS
 * escrita a mano, y se puede regenerar cuando el catálogo cambie.
 */

const fs = require("fs");
const path = require("path");

// Los scripts corren fuera del server: la base no está y no hace falta.
const dbPath = path.resolve(__dirname, "../db/index.js");
require.cache[require.resolve(dbPath)] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { query: async () => ({ rows: [] }), pool: {} },
};

const { scrapeAll } = require("../services/scraper");
const { tokenize, normalize } = require("../services/productMatcher");

// Términos amplios que traen catálogo variado. El objetivo no es buscar bien
// sino recolectar nombres reales de muchas secciones distintas.
const SEMILLAS = [
  ["supermercado", ["pan", "leche", "queso", "carne", "pollo", "arroz", "fideos", "aceite",
    "yerba", "cafe", "galletitas", "refresco", "cerveza", "jugo", "agua", "limpieza",
    "detergente", "papel", "panales", "yogur", "helado", "chocolate", "snacks", "conservas"]],
  ["farmacia", ["analgesico", "vitaminas", "crema", "alcohol", "curitas", "solar"]],
  ["belleza", ["shampoo", "jabon", "desodorante", "perfume", "maquillaje", "afeitar"]],
  ["ropa", ["remera", "pantalon", "campera", "calzado", "abrigo"]],
  ["hogar", ["cocina", "heladera", "tv", "notebook", "celular", "audio", "muebles"]],
];

const MIN_FREQ = 4;          // un término que aparece 3 veces no da señal, da ruido
const MIN_COOC = 3;
const TOP_POR_TERMINO = 6;
const MIN_SIMILITUD = 0.35;

// Palabras que aparecen en todo y no distinguen nada
const RUIDO = new Set(["kg", "gr", "grs", "ml", "lt", "lts", "un", "uni", "unidades",
  "pack", "promo", "x2", "x3", "x4", "x6", "x12", "cc", "mts"]);

function esUtil(t) {
  return t.length >= 4 && !RUIDO.has(t) && !/^\d/.test(t);
}

(async () => {
  const salida = process.argv[2]
    || path.join(__dirname, "..", "data", "synonyms-mined.json");

  const orig = console.log;
  console.log = (...a) => {
    const s = String(a[0] || "");
    if (s.startsWith("[scraper]") || s.startsWith("[categorias]") || s.startsWith("[cache")) return;
    orig(...a);
  };

  // ─── 1. Recolectar catálogo ─────────────────────────────────────
  const documentos = [];   // cada doc = tokens del nombre + tokens de la categoría
  let productos = 0;
  const total = SEMILLAS.reduce((s, [, q]) => s + q.length, 0);
  let hechas = 0;

  for (const [cat, queries] of SEMILLAS) {
    for (const q of queries) {
      hechas++;
      try {
        const r = await scrapeAll(q, null, cat);
        productos += r.length;
        for (const it of r) {
          const tks = tokenize(it.name).filter(esUtil);
          const cats = it.category ? tokenize(normalize(it.category)).filter(esUtil) : [];
          if (tks.length > 0) documentos.push({ tks, cats });
        }
      } catch (e) { /* una semilla que falla no invalida la corrida */ }
      orig(`  [${String(hechas).padStart(2)}/${total}] ${cat}/${q} — ${productos} productos`);
    }
  }

  // ─── 2. Frecuencias y co-ocurrencia ─────────────────────────────
  const freq = new Map();
  const cooc = new Map();   // "a|b" → veces juntos
  const clave = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  for (const { tks, cats } of documentos) {
    // El contexto de un término son las otras palabras del nombre MÁS las de su
    // categoría: así "lacteado" queda ligado a "molde" aunque nunca aparezcan
    // en el mismo nombre.
    const contexto = [...new Set([...tks, ...cats])];
    contexto.forEach((t) => freq.set(t, (freq.get(t) || 0) + 1));
    for (let i = 0; i < contexto.length; i++) {
      for (let j = i + 1; j < contexto.length; j++) {
        const k = clave(contexto[i], contexto[j]);
        cooc.set(k, (cooc.get(k) || 0) + 1);
      }
    }
  }

  const vocab = [...freq.entries()].filter(([, f]) => f >= MIN_FREQ).map(([t]) => t);
  const idx = new Map(vocab.map((t, i) => [t, i]));
  const N = documentos.length;

  // ─── 3. PPMI ────────────────────────────────────────────────────
  // Sin esto, las palabras más frecuentes se parecen a todo: "leche" co-ocurre
  // con medio catálogo por ser común, no por significar algo parecido.
  const vectores = new Map(vocab.map((t) => [t, new Map()]));
  for (const [k, c] of cooc) {
    if (c < MIN_COOC) continue;
    const [a, b] = k.split("|");
    if (!idx.has(a) || !idx.has(b)) continue;
    const pmi = Math.log((c * N) / (freq.get(a) * freq.get(b)));
    if (pmi <= 0) continue;                 // sólo asociación positiva
    vectores.get(a).set(b, pmi);
    vectores.get(b).set(a, pmi);
  }

  const normas = new Map();
  for (const [t, v] of vectores) {
    let s = 0;
    for (const x of v.values()) s += x * x;
    normas.set(t, Math.sqrt(s));
  }

  function coseno(a, b) {
    const va = vectores.get(a), vb = vectores.get(b);
    const na = normas.get(a), nb = normas.get(b);
    if (!va || !vb || !na || !nb) return 0;
    const [chico, grande] = va.size < vb.size ? [va, vb] : [vb, va];
    let dot = 0;
    for (const [k, x] of chico) { const y = grande.get(k); if (y) dot += x * y; }
    return dot / (na * nb);
  }

  // ─── 4. Vecinos más cercanos ────────────────────────────────────
  const relacionados = {};
  for (const t of vocab) {
    const candidatos = new Set();
    for (const vecino of vectores.get(t).keys()) {
      for (const segundo of (vectores.get(vecino) || new Map()).keys()) candidatos.add(segundo);
    }
    candidatos.delete(t);
    const puntuados = [...candidatos]
      .map((c) => [c, coseno(t, c)])
      .filter(([, s]) => s >= MIN_SIMILITUD)
      .sort((x, y) => y[1] - x[1])
      .slice(0, TOP_POR_TERMINO);
    if (puntuados.length > 0) {
      relacionados[t] = puntuados.map(([c, s]) => [c, Number(s.toFixed(3))]);
    }
  }

  fs.mkdirSync(path.dirname(salida), { recursive: true });
  fs.writeFileSync(salida, JSON.stringify(relacionados));

  orig("\n" + "═".repeat(62));
  orig(`productos recolectados : ${productos}`);
  orig(`documentos             : ${documentos.length}`);
  orig(`vocabulario (freq≥${MIN_FREQ})   : ${vocab.length}`);
  orig(`términos con vecinos   : ${Object.keys(relacionados).length}`);
  orig(`tamaño del archivo     : ${(fs.statSync(salida).size / 1024).toFixed(0)} KB`);
  orig("═".repeat(62));

  // Muestra dirigida: lo que este minero tiene que encontrar para servir.
  orig("\nSinónimos que importan para este dominio:");
  ["zapatillas", "championes", "pancho", "salchicha", "lacteado", "molde",
   "gaseosa", "refresco", "panal", "detergente", "barbijo", "tapaboca"]
    .forEach((t) => {
      const r = relacionados[t];
      orig(`  ${t.padEnd(13)} ${r ? r.map(([c, s]) => `${c}(${s})`).join("  ") : "— sin vecinos"}`);
    });
})();
