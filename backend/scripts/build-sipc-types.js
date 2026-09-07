/**
 * Genera data/sipc-types.json desde el catálogo oficial del MEF.
 *
 *   node scripts/build-sipc-types.js
 *
 * QUÉ RESUELVE
 *
 * El buscador no puede distinguir productos de categorías distintas que comparten
 * el sustantivo. "Agua Lavandina" y "Agua Salus" empiezan igual; "Puré de tomate"
 * y "Puré de papas" también. Ya intenté separarlos con reglas sobre el texto y
 * tuve que revertirlo tras medir: desde las letras no se puede.
 *
 * El SIPC (Sistema de Información de Precios al Consumidor, datos abiertos del
 * MEF) publica 379 productos de la canasta con el TIPO, la MARCA y el ENVASE en
 * campos separados. Ahí está la señal que falta, y es oficial:
 *
 *   Hipoclorito de sodio   ← Agua Jane, Sello Rojo, Solución Cristal
 *   Agua de mesa sin gas   ← Salus, Matutina, Nativa
 *   Pan de molde lacteado  ← Los Sorchantes, Bimbo, Pan Catalán
 *
 * La marca es la pieza clave: "Lavandina AGUA JANE 2Lt" se clasifica como
 * hipoclorito, no como agua, aunque su nombre empiece con "agua".
 *
 * SÓLO SE GUARDAN LAS MARCAS INEQUÍVOCAS. Una marca que aparece en más de un
 * tipo (Conaprole hace leche y pulpa de tomate) no distingue nada y se descarta:
 * es la misma disciplina que ya costó una reversión: una señal ambigua hace más
 * daño que la falta de señal.
 */

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { normalize, tokenize } = require("../services/productMatcher");

const URL_PRODUCTOS =
  "https://catalogodatos.gub.uy/dataset/c2edcd30-8a99-45da-b208-b76056de430e/" +
  "resource/03e4e104-5a4a-4597-988f-7ba6df749ff8/download/productos.csv";

// Marcas demasiado genéricas para clasificar por sí solas.
const MARCAS_IGNORADAS = new Set(["sin marca", "varias", "generico", "generica"]);

(async () => {
  const salida = path.join(__dirname, "..", "data", "sipc-types.json");

  // El portal de datos abiertos devuelve 500 cada tanto; con reintentos alcanza.
  console.log("Descargando catálogo oficial del MEF…");
  let r = null;
  for (let intento = 1; intento <= 4 && !r; intento++) {
    try {
      r = await axios.get(URL_PRODUCTOS, {
        responseType: "arraybuffer",
        timeout: 40000,
        headers: { "User-Agent": "MoneyFlow/1.0" },
      });
    } catch (e) {
      const st = e.response ? e.response.status : e.message;
      console.log(`   intento ${intento} falló (${st})`);
      if (intento === 4) throw e;
      await new Promise((res) => setTimeout(res, 2500 * intento));
    }
  }
  // El CSV viene en windows-1252: leerlo como utf-8 rompe todos los acentos.
  const texto = new TextDecoder("windows-1252").decode(r.data);
  const filas = texto.split(/\r?\n/).slice(1).filter((l) => l.trim())
    .map((l) => l.split(";"));

  // ─── Tipos y sus palabras ───────────────────────────────────────
  const tipos = new Map();          // "agua de mesa sin gas" → { nombre, tokens }
  const marcaATipos = new Map();    // "agua jane" → Set de tipos

  for (const [, producto, marca] of filas) {
    if (!producto) continue;
    const claveTipo = normalize(producto);
    if (!tipos.has(claveTipo)) {
      tipos.set(claveTipo, { nombre: producto, tokens: tokenize(producto) });
    }
    const m = normalize(marca || "");
    if (!m || MARCAS_IGNORADAS.has(m) || m.length < 3) continue;
    if (!marcaATipos.has(m)) marcaATipos.set(m, new Set());
    marcaATipos.get(m).add(claveTipo);
  }

  // La FAMILIA es el sustantivo con el que arranca el tipo. "Agua de mesa con
  // gas", "sin gas" y "Agua en bidón" son el mismo producto en distinto envase:
  // exigir tipo exacto descartaba marcas como Salus por "ambigua" cuando en
  // realidad es inequívoca. Lo que hay que distinguir es agua de hipoclorito,
  // no un agua con gas de una sin gas.
  const familiaDe = (claveTipo) => (tokenize(claveTipo)[0] || claveTipo);
  const familias = Object.fromEntries(
    [...tipos.keys()].map((k) => [k, familiaDe(k)])
  );

  const marcas = {};
  let ambiguas = 0;
  for (const [m, set] of marcaATipos) {
    const fams = new Set([...set].map((t) => familias[t]));
    if (fams.size === 1) marcas[m] = [...fams][0];
    else ambiguas++;
  }

  // Tokens que aparecen en UNA sola familia. "hipoclorito", "molde" o "pulpa"
  // identifican por sí solos; "agua", "blanco" o "comun" no. Con esto se puede
  // clasificar un producto que trae la palabra distintiva sin repetir el nombre
  // completo del tipo, que es lo habitual en los nombres comerciales.
  const tokenAFamilias = {};
  for (const [clave, v] of tipos) {
    for (const t of v.tokens) {
      (tokenAFamilias[t] = tokenAFamilias[t] || new Set()).add(familias[clave]);
    }
  }
  const tokenFamilias = Object.fromEntries(
    Object.entries(tokenAFamilias).map(([t, s2]) => [t, [...s2]])
  );
  // Los tokens con digitos NUNCA son exclusivos, por mas que aparezcan en un
  // solo tipo. "Agua oxigenada 10 volumen" hacia que el "10" quedara marcado
  // como exclusivo de la familia agua, y con eso cualquier producto que
  // mencionara un 10 —"Pan para sandwich x 10 un."— se clasificaba como agua.
  // Un numero describe el envase, nunca el tipo de producto.
  const exclusivos = Object.fromEntries(
    Object.entries(tokenAFamilias)
      .filter(([t, s2]) => s2.size === 1 && !/\d/.test(t) && t.length >= 3)
      .map(([t, s2]) => [t, [...s2][0]])
  );

  // Catálogo producto por producto, para poder atar un producto scrapeado a su
  // ficha oficial y comparar contra su precio histórico. Se guardan los tokens
  // ya calculados y la cantidad del envase: hacerlo en runtime por cada
  // resultado de cada búsqueda sería trabajo repetido para siempre.
  const { parseQuantity } = require("../services/productMatcher");
  const productos = {};
  for (const [id, producto, marca, especificacion] of filas) {
    if (!id || !producto) continue;
    const q = parseQuantity(especificacion || "");
    productos[id] = {
      tipo: tokenize(producto),
      marca: normalize(marca || ""),
      qty: q ? q.qty : null,
      unit: q ? q.unit : null,
    };
  }

  const salidaJson = {
    generado: new Date().toISOString().slice(0, 10),
    fuente: "SIPC / MEF Uruguay - catalogodatos.gub.uy",
    // tipo → [tokens], y tipo → familia. La familia es lo que se compara.
    tipos: Object.fromEntries([...tipos].map(([k, v]) => [k, v.tokens])),
    familias,
    exclusivos,
    tokenFamilias,
    productos,
    marcas,
  };

  fs.mkdirSync(path.dirname(salida), { recursive: true });
  fs.writeFileSync(salida, JSON.stringify(salidaJson));

  console.log(`\nproductos del catálogo : ${filas.length}`);
  console.log(`tipos                  : ${tipos.size}`);
  console.log(`marcas inequívocas     : ${Object.keys(marcas).length}`);
  console.log(`familias               : ${new Set(Object.values(familias)).size}`);
  console.log(`tokens exclusivos      : ${Object.keys(exclusivos).length}`);
  console.log(`con envase parseado    : ${Object.values(productos).filter((x) => x.qty).length} de ${Object.keys(productos).length}`);
  console.log(`marcas descartadas     : ${ambiguas} (abarcan familias distintas)`);
  console.log(`archivo                : ${(fs.statSync(salida).size / 1024).toFixed(0)} KB`);

  console.log("\nLas marcas que resuelven los bugs abiertos:");
  ["agua jane", "salus", "sello rojo", "los sorchantes", "bimbo", "gourmet"]
    .forEach((m) => console.log(`   ${m.padEnd(16)} → ${marcas[m] || "— descartada por ambigua"}`));
})().catch((e) => {
  console.error("Falló:", e.message);
  process.exit(1);
});
