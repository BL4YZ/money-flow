/**
 * Aprende vocabulario de góndola desde la TAXONOMÍA que publican las tiendas.
 *
 *   node scripts/build-category-lexicon.js            # construye y guarda
 *   node scripts/build-category-lexicon.js --dry      # sólo muestra, no guarda
 *
 * QUÉ RESUELVE
 *
 * Las tiendas nombran el mismo producto de formas que no comparten ni una
 * palabra. Buscando "pan de molde", Tata vende "Pan Lacteado", Disco "Pan
 * blanco en rodajas" y Bimbo "lactal". El catálogo del MEF resolvió
 * molde↔lacteado —tiene un tipo literal "Pan de molde lacteado"— pero no dice
 * nada de "rodajas", y ninguna regla sobre las letras puede inventar ese
 * vínculo.
 *
 * DE DÓNDE SALE LA SEÑAL
 *
 * De la clasificación que YA HIZO el comerciante. Tata publica
 * `/Almacén/Panificados/Pan de Molde/` y adentro pone productos llamados "Pan
 * Lacteado", "Pan Blanco", "Pan Lactal", "Pan ... en rodajas". Esa categoría es
 * un conjunto de ejemplos etiquetados por alguien que conoce el rubro: las
 * palabras que aparecen ahí adentro son las que la góndola usa para decir
 * "molde".
 *
 * Y separa lo que el texto no podía: `/Frescos/Panadería/` trae "casero",
 * "rústico" y "rebanado" — pan de panadería, que NO es pan de molde. La misma
 * distinción que costó revertir una regla entera cuando se intentó deducirla
 * de la cobertura del corpus (ver productMatcher.requiredTokens).
 *
 * POR QUÉ NO ES EL MINERO DE SINÓNIMOS OTRA VEZ
 *
 * `scripts/mine-synonyms.js` estimaba la ventana de contexto con estadística y
 * aprendía `tata → spaghetti`. Acá la ventana no se estima: es la categoría
 * declarada por la tienda. Pero la FORMA es la misma, así que sale con el mismo
 * protocolo: se construye, se inspecciona a mano y se mide en las dos baterías
 * antes de que toque una búsqueda real.
 *
 * SÓLO APRENDE DE LAS TIENDAS QUE PUBLICAN CATEGORÍA (Tata y El Dorado) y se
 * aplica a las que no (Cencosud, Tienda Inglesa). Ese es todo el punto: el
 * léxico viaja de donde hay taxonomía a donde no la hay.
 */

const fs = require("fs");
const path = require("path");

const dbPath = path.resolve(__dirname, "../db/index.js");
require.cache[require.resolve(dbPath)] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { query: async () => ({ rows: [] }), pool: {} },
};

const { scrapeAll } = require("../services/scraper");
const { tokenize, normalize, matchesToken } = require("../services/productMatcher");
const CASES = require("./precision-cases");

// ─── Umbrales ─────────────────────────────────────────────────────
// Deliberadamente estrictos: un par aprendido de más contamina TODAS las
// búsquedas, y un par de menos sólo deja las cosas como están hoy.
const MIN_SOPORTE = 4;      // productos distintos que respaldan el par
const MIN_LIFT = 3.0;       // cuánto más frecuente adentro que en general
const MIN_P_CATEGORIA = 0.15; // y que no sea una rareza dentro de la categoría
const MIN_LARGO = 4;        // "gas", "kg" o "un" no son vocabulario

// SÓLO el último segmento. Con dos, "/Pastas y salsas/Pastas/" enseñaba
// "salsas → tata" con un producto que era fideos: el token venía del nombre de
// la categoría hermana, no de la del producto.
const SEGMENTOS_UTILES = 1;

// Las MARCAS no son vocabulario. Sin esto lo más fuerte que aprende es
// "molde → bimbo" y diez pares "→ tata": con eso cualquier producto de la
// marca satisface el token, incluido un pan de hamburguesa Bimbo.
const MARCAS = new Set();
try {
  const sipc = require("../data/sipc-types.json");
  Object.keys(sipc.marcas || {}).forEach((m) => tokenize(m).forEach((t) => MARCAS.add(t)));
} catch (e) { /* sin catálogo, se aprende peor pero se aprende */ }
for (const s of require("../services/scraper").SCRAPE_STORES) {
  tokenize(s.name).forEach((t) => MARCAS.add(t));
}

const esRuido = (t) => t.length < MIN_LARGO || /\d/.test(t) || MARCAS.has(t);

// Un token que en la ruta viene detrás de "sin" está NEGADO: "Bebidas Sin
// Alcohol" no habla de alcohol, y "Coca Cola Sin Azucar" no es azúcar.
// Aprendía alcohol→salus y refrescos→azucar por esto.
function sinNegados(texto, tokens) {
  const n = normalize(texto);
  return tokens.filter((t) => {
    // OJO con los escapes: dentro de un template literal `\b` es un backspace,
    // no un borde de palabra. Van dobles.
    const re = new RegExp(`\\bsin\\s+(?:\\w+\\s+){0,2}${t}\\b`, "i");
    return !re.test(n);
  });
}

const origLog = console.log;
console.log = (...a) => {
  const s = String(a[0] || "");
  if (/^\[(scraper|cache|tipos|historial|categorias|shopping|exchange)/.test(s) || s.startsWith("DB:")) return;
  origLog(...a);
};

(async () => {
  const seco = process.argv.includes("--dry");
  const consultas = [...new Set(
    CASES.filter((c) => !c.expectEmpty && c.cat === "supermercado").map((c) => c.q)
  )];

  origLog(`Recorriendo ${consultas.length} consultas de supermercado…`);

  // cuenta[T][W] = productos de una categoría que contiene T cuyo nombre trae W
  const cuenta = {};
  const docsPorCat = {};    // cuántos productos vio cada T
  const global = {};        // frecuencia de W en todo el corpus con categoría
  let totalDocs = 0;
  const ejemplos = {};      // T|W → un nombre de producto, para poder auditar

  for (let i = 0; i < consultas.length; i++) {
    const q = consultas[i];
    let productos = [];
    try {
      productos = await scrapeAll(q, null, "supermercado");
    } catch (e) {
      origLog(`   (falló "${q}": ${e.message})`);
      continue;
    }
    if ((i + 1) % 10 === 0) origLog(`   ${i + 1}/${consultas.length}`);

    for (const p of productos) {
      if (!p.category) continue;   // sólo Tata y El Dorado
      const segmentos = String(p.category).split("/").filter(Boolean);
      const ultimo = segmentos.slice(-SEGMENTOS_UTILES).join(" ");
      const catTokens = new Set(
        sinNegados(ultimo, tokenize(ultimo).filter((t) => !esRuido(t)))
      );
      const nameTokens = new Set(
        sinNegados(p.name, tokenize(p.name).filter((t) => !esRuido(t)))
      );
      if (catTokens.size === 0 || nameTokens.size === 0) continue;

      totalDocs++;
      for (const w of nameTokens) global[w] = (global[w] || 0) + 1;

      for (const t of catTokens) {
        docsPorCat[t] = (docsPorCat[t] || 0) + 1;
        cuenta[t] = cuenta[t] || {};
        for (const w of nameTokens) {
          if (w === t) continue;   // trivial
          // "chicles → chicle" o "libros → libro" son la misma palabra: eso ya
          // lo resuelve matchesToken con los sufijos de flexión.
          if (matchesToken(t, w) || matchesToken(w, t)) continue;
          cuenta[t][w] = (cuenta[t][w] || 0) + 1;
          const k = `${t}|${w}`;
          if (!ejemplos[k]) ejemplos[k] = `${p.name}  →  ${p.category}`;
        }
      }
    }
  }

  // ─── Selección por LIFT ─────────────────────────────────────────
  const lexico = {};
  const auditoria = [];

  for (const [t, ws] of Object.entries(cuenta)) {
    const nCat = docsPorCat[t] || 0;
    if (nCat < MIN_SOPORTE) continue;

    const aceptados = [];
    for (const [w, soporte] of Object.entries(ws)) {
      if (soporte < MIN_SOPORTE) continue;
      const pCat = soporte / nCat;
      if (pCat < MIN_P_CATEGORIA) continue;
      const pAll = (global[w] || 0) / totalDocs;
      if (pAll === 0) continue;
      const lift = pCat / pAll;
      if (lift < MIN_LIFT) continue;
      aceptados.push({ w, soporte, pCat, lift });
    }
    if (aceptados.length === 0) continue;

    aceptados.sort((a, b) => b.lift - a.lift);
    lexico[t] = aceptados.map((a) => a.w);
    for (const a of aceptados) {
      auditoria.push({ t, ...a, ejemplo: ejemplos[`${t}|${a.w}`] });
    }
  }

  // ─── Informe para revisar A MANO antes de confiarle nada ────────
  auditoria.sort((a, b) => b.lift - a.lift);
  origLog(`\n${"═".repeat(72)}`);
  origLog(`productos con categoría : ${totalDocs}`);
  origLog(`tokens de categoría     : ${Object.keys(docsPorCat).length}`);
  origLog(`entradas del léxico     : ${Object.keys(lexico).length} claves, ${auditoria.length} pares`);
  origLog(`${"═".repeat(72)}\n`);

  origLog("PARES APRENDIDOS (lift, soporte)\n");
  for (const a of auditoria) {
    origLog(`  ${a.t.padEnd(16)} → ${a.w.padEnd(16)} lift ${a.lift.toFixed(1).padStart(6)}  n=${a.soporte}`);
    origLog(`       ${a.ejemplo}`);
  }

  if (seco) { origLog("\n(--dry: no se guardó nada)"); process.exit(0); }

  const salida = path.join(__dirname, "..", "data", "category-lexicon.json");
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  fs.writeFileSync(salida, JSON.stringify({
    generado: new Date().toISOString().slice(0, 10),
    fuente: "taxonomía publicada por Tata y El Dorado",
    umbrales: { MIN_SOPORTE, MIN_LIFT, MIN_P_CATEGORIA, MIN_LARGO },
    docs: totalDocs,
    lexico,
  }, null, 2));
  origLog(`\nguardado: ${salida} (${(fs.statSync(salida).size / 1024).toFixed(1)} KB)`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
