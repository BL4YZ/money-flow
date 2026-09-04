/**
 * Corre el set de casos de scripts/precision-cases.js contra la búsqueda real
 * y reporta métricas de precisión.
 *
 *   node scripts/precision-eval.js            # todo
 *   node scripts/precision-eval.js farmacia   # sólo una categoría
 *   node scripts/precision-eval.js --fails    # sólo el detalle de fallos
 *
 * MÉTRICAS (por qué estas):
 *
 *   Precisión      de todos los resultados devueltos, qué % es realmente lo
 *                  que se pidió. Es LA métrica: mide ruido, no aciertos. Se
 *                  calcula sobre resultados individuales, no sobre casos, así
 *                  una búsqueda con 20 resultados sucios pesa más que una con 2.
 *   Contaminación  % de resultados que son algo que explícitamente NO debía
 *                  aparecer (dulce de leche en "leche", accesorios en consolas).
 *                  Duele más que la falta de precisión: es un error visible.
 *   Cobertura      % de casos que devolvieron el mínimo esperado. Mide recall
 *                  de forma indirecta — sin catálogo de referencia no se puede
 *                  medir recall de verdad, y conviene no fingir que sí.
 *   Top-1          % de casos donde el PRIMER resultado es correcto. Es lo que
 *                  el usuario ve sin scrollear.
 *
 * Corre contra datos en vivo: hay ruido entre corridas por stock. Un caso que
 * falla por `minResults` puede ser falta de stock real y no un bug — el reporte
 * marca esos aparte para no confundirlos con errores de relevancia.
 */

const path = require('path');
const express = require('express');
const axios = require('axios');

// Bypass de auth/premium: esto mide relevancia, no autorización.
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

const CASES = require('./precision-cases');
const { parseQuantity } = require('../services/productMatcher');

// Los nombres reales traen tildes ("Azúcar", "Café", "Atún", "higiénico") y
// los regex de los casos se escriben sin ellas. Sin este plegado, la mitad de
// las aserciones fallaba por ortografía y no por relevancia — el primer run
// reportó 84% de precisión cuando la real era mucho más alta.
const deaccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

const args = process.argv.slice(2);
const onlyFails = args.includes('--fails');
const catFilter = args.find((a) => !a.startsWith('--'));

// Silenciamos el ruido del scraper para que el reporte se lea
const origLog = console.log;
console.log = (...a) => {
  const s = String(a[0] || '');
  if (s.startsWith('[scraper]') || s.startsWith('[prices]') || s.startsWith('[exchange')) return;
  origLog(...a);
};

function evaluate(c, items) {
  const fails = [];
  const n = items.length;
  let good = 0, bad = 0, top1 = null;

  if (c.expectEmpty) {
    if (n > 0) fails.push(`esperaba 0 resultados, devolvió ${n}: "${items[0].name}"`);
    return { fails, n, good, bad, top1, stockIssue: false };
  }

  if (c.minResults && n < c.minResults) {
    return { fails: [`sólo ${n} resultados (esperaba ≥${c.minResults})`], n, good, bad, top1, stockIssue: true };
  }
  if (n === 0) return { fails: ['0 resultados'], n, good, bad, top1, stockIssue: true };

  items.forEach((it, i) => {
    const name = it.name || '';
    const flat = deaccent(name); // para los regex, sin tildes
    let ok = true;
    const why = [];

    if (c.allMatch && !c.allMatch.test(flat)) { ok = false; why.push('no matchea allMatch'); }
    if (c.noneMatch && c.noneMatch.test(flat)) { ok = false; bad++; why.push('matchea noneMatch'); }
    if (c.minPrice && it.price < c.minPrice) { ok = false; why.push(`precio $${it.price} < $${c.minPrice}`); }
    if (c.maxPrice && it.price > c.maxPrice) { ok = false; why.push(`precio $${it.price} > $${c.maxPrice}`); }
    if (c.qty) {
      const q = parseQuantity(name);
      if (!q || q.unit !== c.qty.base || Math.abs(q.qty - c.qty.qty) > 1) {
        ok = false;
        why.push(`cantidad ${q ? q.qty + q.unit : 'no detectada'} ≠ ${c.qty.qty}${c.qty.base}`);
      }
    }
    if (c.allHaveUnit && it.unitPrice == null) { ok = false; why.push('sin precio por unidad'); }

    if (ok) good++;
    else if (fails.length < 3) fails.push(`  · "${name.slice(0, 62)}" $${it.price} — ${why.join(', ')}`);
    if (i === 0) top1 = ok;
  });

  if (c.topMatch && !c.topMatch.test(deaccent(items[0].name))) {
    fails.unshift(`top-1 incorrecto: "${items[0].name}"`);
    top1 = false;
  }
  return { fails, n, good, bad, top1, stockIssue: false };
}

(async () => {
  const app = express();
  app.use('/api/prices', require('../routes/prices.js'));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/prices/search`;

  const cases = catFilter ? CASES.filter((c) => c.cat === catFilter) : CASES;
  origLog(`\nEvaluando ${cases.length} casos${catFilter ? ` (${catFilter})` : ''} contra datos en vivo…\n`);

  // Los casos corren en paralelo de a CONCURRENCY. No golpea más fuerte a las
  // tiendas: el tope de 3 conexiones por host vive en el scraper y es global,
  // así que esto sólo llena el pipeline en vez de esperar una búsqueda por vez.
  // Con 260 casos en vivo la diferencia es entre ~35 min y ~10, y un ciclo de
  // feedback corto es lo que hace que la batería se corra de verdad.
  const CONCURRENCY = 4;
  const results = new Array(cases.length);
  let siguiente = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (let i = siguiente++; i < cases.length; i = siguiente++) {
      const c = cases[i];
      let items = [];
      let err = null;
      try {
        const { data } = await axios.get(base, { params: { q: c.q, category: c.cat, limit: 20 }, timeout: 90000 });
        items = data.items || [];
      } catch (e) { err = e.message; }
      results[i] = { c, ...(err
        ? { fails: [`ERROR: ${err}`], n: 0, good: 0, bad: 0, top1: false, stockIssue: false }
        : evaluate(c, items)) };
    }
  }));

  // Se imprime al final y en orden, para que el reporte se lea igual que antes
  for (const r of results) {
    const c = r.c;
    const pass = r.fails.length === 0;
    const icon = pass ? '✓' : r.stockIssue ? '·' : '✗';
    if (!onlyFails || !pass) {
      origLog(`${icon} ${(c.q + (c.label ? ` [${c.label}]` : '')).padEnd(38)} ${String(r.n).padStart(3)} res` +
        (r.n && !c.expectEmpty ? `  ${String(Math.round(100 * r.good / r.n)).padStart(3)}% ok` : ''));
      r.fails.forEach((f) => origLog(`    ${f}`));
    }
  }

  // ─── Agregados ───────────────────────────────────────────────
  const scored = results.filter((r) => !r.c.expectEmpty && r.n > 0);
  const totalRes = scored.reduce((s, r) => s + r.n, 0);
  const totalGood = scored.reduce((s, r) => s + r.good, 0);
  const totalBad = scored.reduce((s, r) => s + r.bad, 0);
  const withTop = scored.filter((r) => r.top1 !== null);
  const passed = results.filter((r) => r.fails.length === 0).length;
  const stockOnly = results.filter((r) => r.stockIssue).length;
  const realFails = results.filter((r) => r.fails.length > 0 && !r.stockIssue).length;

  const pct = (a, b) => (b === 0 ? '—' : `${(100 * a / b).toFixed(1)}%`);
  origLog('\n' + '═'.repeat(60));
  origLog(`Casos              ${results.length}`);
  origLog(`  correctos        ${passed}  (${pct(passed, results.length)})`);
  origLog(`  fallo real       ${realFails}`);
  origLog(`  sin stock        ${stockOnly}  (pocos resultados, no es error de relevancia)`);
  origLog('─'.repeat(60));
  origLog(`PRECISIÓN          ${pct(totalGood, totalRes)}   (${totalGood}/${totalRes} resultados correctos)`);
  origLog(`CONTAMINACIÓN      ${pct(totalBad, totalRes)}   (${totalBad} resultados que no debían aparecer)`);
  origLog(`TOP-1              ${pct(withTop.filter((r) => r.top1).length, withTop.length)}`);
  origLog(`COBERTURA          ${pct(results.length - stockOnly, results.length)}`);
  origLog('═'.repeat(60));

  // Desglose por categoría: dónde duele
  const cats = [...new Set(results.map((r) => r.c.cat))];
  origLog('\nPor categoría:');
  cats.forEach((cat) => {
    const rs = results.filter((r) => r.c.cat === cat);
    const sc = rs.filter((r) => !r.c.expectEmpty && r.n > 0);
    const tr = sc.reduce((s, r) => s + r.n, 0);
    const tg = sc.reduce((s, r) => s + r.good, 0);
    origLog(`  ${cat.padEnd(14)} ${String(rs.filter((r) => r.fails.length === 0).length).padStart(3)}/${String(rs.length).padEnd(3)} casos   precisión ${pct(tg, tr).padStart(6)}`);
  });

  server.close();
  process.exit(realFails > 0 ? 1 : 0);
})();
