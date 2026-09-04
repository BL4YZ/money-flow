/**
 * Precisión del COMPARADOR DE CARRITO (routes/shopping.js).
 *
 *   node scripts/precision-eval-cart.js            # todos los casos
 *   node scripts/precision-eval-cart.js farmacia   # una categoría
 *
 * Por qué existe aparte de precision-eval.js: son dos políticas de ranking
 * distintas sobre las mismas primitivas. El buscador (`/api/prices/search`)
 * devuelve una lista navegable; el carrito se queda con UN producto por
 * tienda y de ahí sale el total del "Carrito óptimo". Un error acá no ensucia
 * una lista: cambia la cifra que el usuario usa para decidir dónde comprar.
 *
 * Esa diferencia es justamente la que dejó pasar el bug: durante todo el
 * desarrollo de la batería de precisión, esta ruta no tenía NINGUNA cobertura.
 * Buscando "apple pencil" el umbral de 0.5 (media palabra alcanza) dejaba
 * pasar vinagre de manzana, vodka Green Apple, un Apple Watch y whisky Jack
 * Daniel's Apple — y como se elige el más barato por tienda, el titular
 * "MEJOR PRECIO" era un "Incienso red apple square" de $30 en lugar de un
 * lápiz de $4.909.
 *
 * Reusa los MISMOS casos que precision-eval.js (scripts/precision-cases.js) y
 * agrega la aserción que sólo tiene sentido acá: el producto elegido como más
 * barato tiene que ser correcto, porque es el que alimenta el total.
 */

const path = require('path');

const authPath = path.resolve(__dirname, '../middleware/auth.js');
require.cache[require.resolve(authPath)] = {
  id: authPath, filename: authPath, loaded: true,
  exports: (req, _res, next) => { req.userId = 'eval'; next(); },
};
const premPath = path.resolve(__dirname, '../middleware/requirePremium.js');
require.cache[require.resolve(premPath)] = {
  id: premPath, filename: premPath, loaded: true,
  exports: (_req, _res, next) => next(),
};
// El módulo abre un pool de Postgres al cargarse; acá no se toca la base.
const dbPath = path.resolve(__dirname, '../db/index.js');
require.cache[require.resolve(dbPath)] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { query: async () => ({ rows: [] }), pool: {} },
};

const { scrapeItem } = require('../routes/shopping.js').__testing;
const CASES = require('./precision-cases');
const { parseQuantity } = require('../services/productMatcher');

const deaccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

const args = process.argv.slice(2);
const catFilter = args.find((a) => !a.startsWith('--'));

const origLog = console.log;
console.log = (...a) => {
  const s = String(a[0] || '');
  if (s.startsWith('[scraper]') || s.startsWith('[shopping') || s.startsWith('[exchange')) return;
  origLog(...a);
};

function evaluate(c, res) {
  const opciones = Object.values(res.byStore || {}); // indexado por storeId
  const fails = [];
  let good = 0, bad = 0;

  if (c.expectEmpty) {
    if (opciones.length > 0) fails.push(`esperaba 0, eligió "${opciones[0].name}"`);
    return { fails, n: opciones.length, good, bad, cheapOk: null, stockIssue: false };
  }
  if (opciones.length === 0) {
    return { fails: ['ningún producto encontrado'], n: 0, good, bad, cheapOk: null, stockIssue: true };
  }

  opciones.forEach((it) => {
    const flat = deaccent(it.name || '');
    let ok = true;
    if (c.allMatch && !c.allMatch.test(flat)) ok = false;
    if (c.noneMatch && c.noneMatch.test(flat)) { ok = false; bad++; }
    if (c.minPrice && it.price < c.minPrice) ok = false;
    if (c.qty) {
      const q = parseQuantity(it.name);
      if (!q || q.unit !== c.qty.base || Math.abs(q.qty - c.qty.qty) > 1) ok = false;
    }
    if (ok) good++;
    else if (fails.length < 3) fails.push(`  · "${(it.name || '').slice(0, 58)}" $${it.price} [${it.store}]`);
  });

  // LA aserción propia de esta pantalla: el más barato alimenta el total del
  // carrito, así que si ese está mal, el número principal está mal.
  const barato = res.cheapest;
  let cheapOk = null;
  if (barato) {
    const flat = deaccent(barato.name || '');
    cheapOk = !(c.allMatch && !c.allMatch.test(flat))
      && !(c.noneMatch && c.noneMatch.test(flat))
      && !(c.minPrice && barato.price < c.minPrice);
    if (!cheapOk) fails.unshift(`MÁS BARATO incorrecto → "${barato.name}" $${barato.price}`);
  }
  return { fails, n: opciones.length, good, bad, cheapOk, stockIssue: false };
}

(async () => {
  const cases = (catFilter ? CASES.filter((c) => c.cat === catFilter) : CASES)
    .filter((c) => c.allMatch || c.noneMatch || c.minPrice || c.expectEmpty);
  origLog(`\nComparador de carrito — ${cases.length} casos contra datos en vivo…\n`);

  // Paralelo de a 4, igual que precision-eval.js — el tope por host del
  // scraper es global, así que esto llena el pipeline sin golpear más.
  const CONCURRENCY = 4;
  const results = new Array(cases.length);
  let siguiente = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (let i = siguiente++; i < cases.length; i = siguiente++) {
      const c = cases[i];
      try {
        results[i] = { c, ...evaluate(c, await scrapeItem({ name: c.q, quantity: 1, id: 0 }, c.cat)) };
      } catch (e) {
        results[i] = { c, fails: [`ERROR: ${e.message}`], n: 0, good: 0, bad: 0, cheapOk: false, stockIssue: false };
      }
    }
  }));

  for (const r of results) {
    const c = r.c;
    const icon = r.fails.length === 0 ? '✓' : r.stockIssue ? '·' : '✗';
    origLog(`${icon} ${(c.q + (c.label ? ` [${c.label}]` : '')).padEnd(38)} ${String(r.n).padStart(2)} tiendas` +
      (r.n ? `  ${String(Math.round(100 * r.good / r.n)).padStart(3)}% ok` : ''));
    r.fails.forEach((f) => origLog(`    ${f}`));
  }

  const scored = results.filter((r) => !r.c.expectEmpty && r.n > 0);
  const tot = scored.reduce((s, r) => s + r.n, 0);
  const gd = scored.reduce((s, r) => s + r.good, 0);
  const bd = scored.reduce((s, r) => s + r.bad, 0);
  const conCheap = scored.filter((r) => r.cheapOk !== null);
  const stockOnly = results.filter((r) => r.stockIssue).length;
  const realFails = results.filter((r) => r.fails.length > 0 && !r.stockIssue).length;
  const pct = (a, b) => (b === 0 ? '—' : `${(100 * a / b).toFixed(1)}%`);

  origLog('\n' + '═'.repeat(60));
  origLog(`Casos              ${results.length}   (correctos ${results.length - realFails - stockOnly}, fallo real ${realFails}, sin stock ${stockOnly})`);
  origLog('─'.repeat(60));
  origLog(`PRECISIÓN          ${pct(gd, tot)}   (${gd}/${tot} elecciones por tienda)`);
  origLog(`CONTAMINACIÓN      ${pct(bd, tot)}`);
  origLog(`MÁS BARATO OK      ${pct(conCheap.filter((r) => r.cheapOk).length, conCheap.length)}   ← alimenta el total del carrito`);
  origLog('═'.repeat(60));

  process.exit(realFails > 0 ? 1 : 0);
})();
