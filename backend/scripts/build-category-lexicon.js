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
const {
  tokenize, normalize, matchesToken, parseQuantity,
  variantSignature, variantConflict, VARIANT_GROUPS,
} = require("../services/productMatcher");
const productType = require("../services/productType");
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

// Los marcadores de VARIANTE no son sinónimos de la categoría: son la línea
// del producto. Sin esto se aprende `molde → cero` (por "Pan Blanco Bimbo
// Cero", n=11), y con eso cualquier producto "cero" satisfaría "molde". Salen
// de VARIANT_GROUPS, que es la misma lista con la que el agrupador decide qué
// nunca se fusiona; "cero" se suma a mano porque la lista trae la forma
// inglesa "zero" y la góndola uruguaya escribe la castellana.
const VARIANTES = new Set([...VARIANT_GROUPS.flat(), "cero"]);

const esRuido = (t) =>
  t.length < MIN_LARGO || /\d/.test(t) || MARCAS.has(t) || VARIANTES.has(t);

// Las marcas como frase completa, para poder exigir "misma marca" al emparejar.
const MARCAS_FRASE = new Set();
try {
  const sipc = require("../data/sipc-types.json");
  Object.keys(sipc.marcas || {}).forEach((m) => { if (m.length >= 4) MARCAS_FRASE.add(m); });
} catch (e) { /* sin catálogo no se empareja, que es el lado seguro */ }

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

/**
 * Le presta la categoría a las tiendas que no publican ninguna, emparejando el
 * MISMO producto entre cadenas.
 *
 * Es lo que rompe el techo del método. Sólo se puede aprender vocabulario que
 * viva dentro de una categoría etiquetada, y la palabra que falta —"rodajas"—
 * es de Cencosud, que no etiqueta nada. Pero el producto sí existe de los dos
 * lados:
 *
 *   Tata   "Pan Blanco Bimbo Cero 500 G"           → /Almacén/…/Pan de Molde/
 *   Disco  "Pan blanco en rodajas BIMBO cero 500 g" → (sin categoría)
 *
 * Misma marca, mismo "cero", mismos 500 g: es el mismo pan. Emparejarlos mete
 * el vocabulario de Cencosud DENTRO de la categoría de Tata, y ahí "rodajas"
 * pasa a ser aprendible.
 *
 * NO SE PUEDE USAR `groupProducts` TAL CUAL, y el motivo es instructivo:
 * pondera por IDF, así que "rodajas" —rara, y por eso informativa— pesa
 * muchísimo como término NO compartido y hunde el score bajo el umbral de 0.72.
 * La palabra que queremos aprender es justo la que impide el emparejamiento.
 * El umbral que hace segura la agrupación en pantalla la vuelve inútil para
 * aprender. Verificado: con groupProducts sólo emparejaba Tienda Inglesa, cuya
 * diferencia era un "Cero" repetido y no vocabulario nuevo.
 *
 * Así que acá el parecido no se puntúa: se EXIGE. Cuatro guardas duras —misma
 * cantidad, misma marca, misma familia del MEF, sin variantes en conflicto— y
 * entonces la palabra sobrante puede ser cualquiera. Si dos candidatos
 * etiquetados no coinciden en categoría, no se propaga nada.
 *
 * PERO ESTO NO IDENTIFICA EL MISMO SKU, y conviene no creerse otra cosa. Une
 * "Pan Blanco Bimbo Artesano 500 G" con "Pan blanco en rodajas BIMBO cero
 * 500 g": misma marca, mismo gramaje, distinta línea. Para lo único que se usa
 * —prestar la CATEGORÍA— alcanza, porque las dos son pan de molde y es la
 * categoría lo que viaja, no el precio ni la identidad del producto. Para
 * cualquier otro uso (comparar precios, deduplicar en pantalla) haría falta
 * `groupProducts`, que es estricto justamente porque ahí un error se ve.
 */
const MIN_TOKENS_COMPARTIDOS = 3;

function mismaCosa(a, b, marcas) {
  if (a.storeId === b.storeId) return false;

  // 1. Misma CANTIDAD. Un pack de 500 g y uno de 1 kg no son el mismo producto
  //    por parecido que sea el nombre. (Misma guarda que groupProducts.)
  const qa = parseQuantity(a.name);
  const qb = parseQuantity(b.name);
  if (!qa || !qb || qa.unit !== qb.unit || qa.qty !== qb.qty) return false;

  // 2. Misma MARCA, y tiene que haber una. Es lo que sostiene todo lo demás:
  //    sin marca compartida, "pan blanco 500 g" matchea con cualquier pan.
  const ma = [...marcas].filter((m) => normalize(a.name).includes(m));
  const mb = [...marcas].filter((m) => normalize(b.name).includes(m));
  if (ma.length === 0 || mb.length === 0) return false;
  if (!ma.some((m) => mb.includes(m))) return false;

  // 3. Misma FAMILIA oficial del MEF cuando ambas se conocen.
  const fa = productType.familiaDeProducto(a.name);
  const fb = productType.familiaDeProducto(b.name);
  if (fa && fb && fa !== fb) return false;

  // 4. Y variantes excluyentes (entera/descremada, con/sin lactosa) nunca se
  //    fusionan, más un piso de palabras en común para que la marca sola no
  //    alcance.
  const ta = tokenize(a.name);
  const tb = tokenize(b.name);
  if (variantConflict(variantSignature(ta), variantSignature(tb))) return false;
  const comunes = ta.filter((t) => tb.includes(t)).length;
  return comunes >= MIN_TOKENS_COMPARTIDOS;
}

function propagarCategorias(productos, auditPares) {
  const marcas = MARCAS_FRASE;
  const conCat = productos.filter((p) => p.category);
  const sinCat = productos.filter((p) => !p.category);

  let prestadas = 0;
  for (const s of sinCat) {
    const candidatos = conCat.filter((c) => mismaCosa(c, s, marcas));
    if (candidatos.length === 0) continue;
    const cats = [...new Set(candidatos.map((c) => c.category))];
    if (cats.length !== 1) continue;   // desacuerdo → no se opina
    s.category = cats[0];
    s._categoriaPrestada = true;
    prestadas++;
    if (auditPares && auditPares.length < 40) {
      auditPares.push(`${candidatos[0].storeId}: ${candidatos[0].name}\n        ↳ ${s.storeId}: ${s.name}\n        ${cats[0]}`);
    }
  }
  return prestadas;
}

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
  let prestadasTotal = 0;
  const auditPares = [];
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
    // Antes de contar: prestarle la categoría a las cadenas que no la publican.
    prestadasTotal += propagarCategorias(productos, auditPares);
    if ((i + 1) % 10 === 0) origLog(`   ${i + 1}/${consultas.length}  (${prestadasTotal} categorías prestadas)`);

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
  origLog(`productos con categoría : ${totalDocs}   (${prestadasTotal} prestadas por emparejamiento)`);
  origLog(`tokens de categoría     : ${Object.keys(docsPorCat).length}`);
  origLog(`entradas del léxico     : ${Object.keys(lexico).length} claves, ${auditoria.length} pares`);
  origLog(`${"═".repeat(72)}\n`);

  // Los emparejamientos van PRIMERO y a propósito: si une mal dos productos,
  // el vocabulario que salga de ahí no vale nada por más alto que sea el lift.
  if (auditPares.length) {
    origLog("EMPAREJAMIENTOS QUE PRESTARON CATEGORÍA (muestra)\n");
    auditPares.slice(0, 20).forEach((x) => origLog(`     ${x}\n`));
    origLog("");
  }

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
