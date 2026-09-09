/**
 * Por qué el carrito dice "falta X" en una tienda que sí lo tiene.
 *
 *   node scripts/diag-cart-misses.js "pan de molde bimbo" "azucar 500g"
 *
 * Reproduce la escalera de routes/shopping.js paso a paso sobre los datos
 * crudos del scrape y dice EN QUÉ PASO muere cada candidato, por tienda. Sin
 * esto la única señal es "falta", que no distingue "la tienda no lo vende" de
 * "el matcher lo descartó" — y son problemas opuestos.
 */

const path = require('path');
for (const rel of ['../middleware/auth.js', '../middleware/requirePremium.js']) {
  const p = path.resolve(__dirname, rel);
  require.cache[require.resolve(p)] = {
    id: p, filename: p, loaded: true, exports: (_q, _r, next) => next(),
  };
}
const dbPath = path.resolve(__dirname, '../db/index.js');
require.cache[require.resolve(dbPath)] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { query: async () => ({ rows: [] }), pool: {} },
};

const { scrapeAll } = require('../services/scraper');
const productType = require('../services/productType');
const {
  normalize, tokenize, buildSearchQuery, tokenInProduct,
  isAccessoryFor, isModifierMention, isNegatedMention,
  formatTokenQuantities, tokenSatisfied,
} = require('../services/productMatcher');
const { isRelevant } = require('../routes/shopping.js').__testing;

const origLog = console.log;
console.log = (...a) => {
  const s = String(a[0] || '');
  if (s.startsWith('[scraper]') || s.startsWith('[shopping') || s.startsWith('[exchange') ||
      s.startsWith('[cache]') || s.startsWith('[tipos]') || s.startsWith('[historial]')) return;
  origLog(...a);
};

const TERMINOS = process.argv.slice(2);
if (TERMINOS.length === 0) {
  console.error('uso: node scripts/diag-cart-misses.js "pan de molde bimbo" ...');
  process.exit(1);
}

(async () => {
  for (const termino of TERMINOS) {
    const queryTokens = tokenize(termino);
    const productos = await scrapeAll(buildSearchQuery(termino), null, null);

    console.log(`\n${'='.repeat(72)}`);
    console.log(`"${termino}"   tokens: [${queryTokens.join(', ')}]`);
    console.log(`scrape crudo: ${productos.length} productos`);

    // Paso 1: relevancia (la misma que usa el carrito).
    const relevantes = productos.filter((p) => isRelevant(queryTokens, p.name));

    // Paso 2: la escalera de match COMPLETO, tal como está hoy — sobre el
    // conjunto de TODAS las tiendas juntas.
    const completos = relevantes.filter((p) =>
      queryTokens.every((t) => tokenInProduct(t, normalize(p.name))));

    // Lo que el buscador SÍ sabe y el carrito no.
    const familias = productType.familiasDeBusqueda(queryTokens);
    const cants = formatTokenQuantities(queryTokens, relevantes);

    const porTienda = {};
    for (const p of relevantes) {
      (porTienda[p.store] = porTienda[p.store] || []).push(p);
    }

    console.log(`relevantes: ${relevantes.length}   con TODOS los tokens: ${completos.length}`);
    if (familias) console.log(`familias que pide la búsqueda: {${[...familias].join(', ')}}`);
    console.log('');

    for (const [tienda, items] of Object.entries(porTienda).sort()) {
      const completosAqui = items.filter((p) =>
        queryTokens.every((t) => tokenInProduct(t, normalize(p.name))));
      const sobreviveHoy = completos.length > 0 ? completosAqui.length : items.length;

      console.log(`  ${tienda}  —  ${items.length} relevantes, ${completosAqui.length} completos, ` +
        `sobrevive hoy: ${sobreviveHoy}`);

      for (const p of items.slice(0, 4)) {
        const pNorm = normalize(p.name);
        const faltan = queryTokens.filter((t) => !tokenInProduct(t, pNorm));
        if (faltan.length === 0) { console.log(`      OK   ${p.name}`); continue; }

        // ¿Alguna de las señales que el buscador tiene lo rescataría?
        const fam = productType.familiaDeProducto(p.name);
        const porFamilia = !!fam && familias && familias.has(fam);
        const porCantidad = faltan.every((t) =>
          tokenSatisfied(t, pNorm, p.name, p.equivalencia, p.categoria) ||
          (cants && cants[t] != null));

        const rescate = porFamilia ? `familia=${fam}` : porCantidad ? 'cantidad/categoría' : '—';
        const marca = completos.length > 0 ? 'MUERE' : 'vive';
        console.log(`      ${marca} ${p.name}`);
        console.log(`             le falta [${faltan.join(', ')}]   rescatable por: ${rescate}`);
      }
    }
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
