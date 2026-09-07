/**
 * Mapa de categorías de Tata: id numérico → nombre legible.
 *
 * POR QUÉ EXISTE
 *
 * La categoría real de un producto es la única señal que separa cosas que el
 * texto del nombre no distingue: "Agua Lavandina" (Limpieza) de un agua mineral
 * (Bebidas), o los "Pan Lacteado TaTa" que SÍ son pan de molde aunque no lleven
 * la palabra "molde" en el nombre. El Dorado ya devuelve la ruta legible y el
 * scraper la guarda; Tata devuelve sólo ids numéricos:
 *
 *   ["191","129","131"]  →  Almacén / Panificados / Pan de Molde
 *   ["196","116","118"]  →  Frescos / Lácteos / Leches
 *
 * CÓMO SE APRENDE
 *
 * La búsqueda ya trae `categoriesIds` gratis en su respuesta. El nombre está en
 * el JSON-LD de la ficha del producto (BreadcrumbList), a una request de
 * distancia — carísimo si se pidiera por producto en cada búsqueda, y barato si
 * se pide UNA vez por combinación de ids nueva.
 *
 * Entonces: la búsqueda nunca espera. Cuando aparece una combinación
 * desconocida se encola, un worker lento la resuelve en segundo plano, y a
 * partir de ahí esa categoría ya está para siempre. El mapa se llena solo con
 * el uso y se guarda en disco para sobrevivir reinicios.
 *
 * El breadcrumb trae la ruta Y después ruido (nombre del producto repetido y la
 * marca); sólo los primeros N elementos, con N = cantidad de ids, son la ruta.
 */

const fs = require("fs");
const path = require("path");
const l2 = require("./persistentCache");

// Clave única en kv_cache. El mapa entero entra en una fila: son ~200 pares
// id→nombre, no justifica una tabla propia.
const CLAVE_L2 = "categorias:tata";
const TTL_L2 = 180 * 24 * 60 * 60 * 1000;   // las categorías de un super no cambian


const CACHE_FILE = path.join(__dirname, "..", ".category-map.json");
const MAX_ENTRADAS = 5000;      // techo de memoria; el catálogo real es mucho menor
const PAUSA_ENTRE_APRENDIZAJES = 3000;  // ms: esto es trabajo de fondo, no corre carreras
const MAX_COLA = 200;

const mapa = new Map();          // "191" → "Almacén"
const combinacionesVistas = new Set(); // "191,129,131" ya resueltas o encoladas
let cola = [];
let trabajando = false;

// ─── Persistencia (best-effort) ───────────────────────────────────
// Si el disco no está disponible (Render reinicia con FS efímero) el mapa
// simplemente se vuelve a aprender: no es un error que valga la pena propagar.
function cargar() {
  try {
    const crudo = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    Object.entries(crudo.ids || {}).forEach(([id, nombre]) => mapa.set(id, nombre));
    (crudo.combos || []).forEach((c) => combinacionesVistas.add(c));
    console.log(`[categorias] ${mapa.size} categorías cargadas de disco`);
  } catch (e) { /* primera corrida, o FS de sólo lectura */ }
}

let guardadoPendiente = null;
function guardar() {
  // Debounce: aprender 12 categorías seguidas no debe escribir 12 veces.
  if (guardadoPendiente) return;
  guardadoPendiente = setTimeout(() => {
    guardadoPendiente = null;
    try {
      const payload = {
        ids: Object.fromEntries(mapa),
        combos: [...combinacionesVistas].slice(-MAX_ENTRADAS),
      };
      const ahora = Date.now();
      l2.escribir(CLAVE_L2, payload, ahora + TTL_L2, ahora + TTL_L2);
      fs.writeFileSync(CACHE_FILE, JSON.stringify(payload));
    } catch (e) { /* idem */ }
  }, 5000);
  if (guardadoPendiente.unref) guardadoPendiente.unref();
}

cargar();

// El archivo local sólo sirve en desarrollo: en Render el filesystem se borra
// en cada apagado por inactividad. Postgres es el que de verdad persiste.
(async () => {
  const guardado = await l2.leer(CLAVE_L2);
  if (!guardado || !guardado.data) return;
  let nuevas = 0;
  Object.entries(guardado.data.ids || {}).forEach(([id, nombre]) => {
    if (!mapa.has(id)) { mapa.set(id, nombre); nuevas++; }
  });
  (guardado.data.combos || []).forEach((c) => combinacionesVistas.add(c));
  if (nuevas > 0) console.log(`[categorias] ${nuevas} recuperadas de Postgres`);
})().catch(() => {});

// ─── Consulta ─────────────────────────────────────────────────────

/**
 * Ruta legible para una lista de ids, o null si todavía no se aprendió.
 * Devuelve el mismo formato que El Dorado ("/Almacén/Panificados/Pan de Molde/")
 * para que downstream no tenga que saber de qué tienda vino.
 */
function rutaDeCategorias(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return null;
  const nombres = ids.map((id) => mapa.get(String(id)));
  if (nombres.some((n) => !n)) return null;   // incompleto: mejor null que media ruta
  return `/${nombres.join("/")}/`;
}

// ─── Aprendizaje en segundo plano ─────────────────────────────────

function encolar(ids, slug, baseUrl) {
  if (!Array.isArray(ids) || ids.length === 0 || !slug) return;
  const clave = ids.join(",");
  if (combinacionesVistas.has(clave)) return;
  if (rutaDeCategorias(ids)) { combinacionesVistas.add(clave); return; }
  if (cola.length >= MAX_COLA) return;        // no acumular trabajo sin fin
  combinacionesVistas.add(clave);             // se marca al encolar: no se pide dos veces
  cola.push({ ids, slug, baseUrl });
  arrancar();
}

function nombresDelBreadcrumb(html) {
  const bloque = String(html).match(/BreadcrumbList[\s\S]{0,1500}/i);
  if (!bloque) return null;
  return [...bloque[0].matchAll(/"name":\s*"([^"]+)"/g)].map((m) => m[1]);
}

async function arrancar() {
  if (trabajando) return;
  trabajando = true;
  // `fetchWithRetry` vive en scraper.js y scraper.js requiere este módulo:
  // se pide acá adentro para no crear un ciclo de imports al cargar.
  const { fetchWithRetry } = require("./scraper");

  while (cola.length > 0) {
    const { ids, slug, baseUrl } = cola.shift();
    try {
      const r = await fetchWithRetry(`${baseUrl}/${slug}/p`, {
        headers: { Accept: "text/html" },
        timeout: 15000,
      });
      const nombres = nombresDelBreadcrumb(r.data);
      // Sólo los primeros `ids.length` son la ruta; lo que sigue es el nombre
      // del producto repetido y la marca.
      if (nombres && nombres.length >= ids.length) {
        ids.forEach((id, i) => {
          if (mapa.size < MAX_ENTRADAS) mapa.set(String(id), nombres[i]);
        });
        guardar();
        console.log(`[categorias] aprendida ${ids.join(",")} → ${nombres.slice(0, ids.length).join("/")}`);
      }
    } catch (e) {
      // Si falla, la combinación queda marcada igual: reintentar en bucle una
      // ficha que no carga cuesta más de lo que ese dato vale.
    }
    await new Promise((res) => setTimeout(res, PAUSA_ENTRE_APRENDIZAJES));
  }
  trabajando = false;
}

module.exports = { rutaDeCategorias, encolar, _mapa: mapa };
