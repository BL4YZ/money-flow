/**
 * Chequeo de salud de los scrapers ("canary").
 *
 * El modo de falla más peligroso de un scraper no es que explote: es que
 * devuelva HTTP 200 y CERO productos porque la tienda renombró una clase CSS.
 * Hoy eso es invisible — `scrapeAll` usa Promise.allSettled, la tienda
 * desaparece de la comparación y no hay forma de distinguir "no tiene el
 * producto" de "el parser se rompió".
 *
 * Este script busca en cada tienda un término que esa tienda SEGURO vende y
 * verifica que devuelva productos con nombre y precio usables. Si una tienda
 * da cero, o es que la bloquearon o es que su parser dejó de matchear: en los
 * dos casos hay que mirarla.
 *
 * Uso:
 *   node scripts/scraper-health.js            # todas
 *   node scripts/scraper-health.js disco tata # sólo algunas
 *
 * Sale con código 1 si alguna tienda falla, para poder colgarlo de un cron.
 */
const { scrapeStore, SCRAPE_STORES } = require('../services/scraper');

// Término por categoría que cualquier tienda del rubro debería tener en
// stock. Si esto deja de traer resultados, es señal de problema, no de
// catálogo: son productos de venta permanente.
const CANARY_POR_CATEGORIA = {
  supermercado: 'agua',
  farmacia: 'alcohol',
  belleza: 'shampoo',
  ropa: 'remera',
  hogar: 'cable',
};

function canaryFor(store) {
  for (const cat of store.categories) {
    if (CANARY_POR_CATEGORIA[cat]) return { termino: CANARY_POR_CATEGORIA[cat], categoria: cat };
  }
  return { termino: 'agua', categoria: store.categories[0] };
}

// Un resultado "usable" tiene nombre y un precio positivo. Un parser a medio
// romper puede devolver filas con nombre pero precio 0, y eso ensucia la
// comparación sin que nadie lo note.
function validar(resultados) {
  const conNombre = resultados.filter((r) => r.name && r.name.trim().length > 2);
  const conPrecio = conNombre.filter((r) => typeof r.price === 'number' && r.price > 0);
  return { total: resultados.length, conNombre: conNombre.length, conPrecio: conPrecio.length };
}

(async () => {
  const filtro = process.argv.slice(2);
  const tiendas = filtro.length
    ? SCRAPE_STORES.filter((s) => filtro.includes(s.id))
    : SCRAPE_STORES;

  console.log(`Chequeando ${tiendas.length} tiendas...\n`);

  const fallas = [];
  const parciales = [];

  const chequeos = tiendas.map(async (store) => {
    const { termino, categoria } = canaryFor(store);
    const t0 = Date.now();
    try {
      const resultados = await scrapeStore(store, termino);
      const v = validar(resultados);
      const ms = Date.now() - t0;

      if (v.conPrecio === 0) {
        fallas.push({ store, termino, motivo: v.total === 0 ? 'cero resultados' : 'resultados sin precio válido', v });
      } else if (v.conPrecio < v.total) {
        parciales.push({ store, termino, v });
      }
      return { store, termino, categoria, v, ms, error: null };
    } catch (err) {
      fallas.push({ store, termino, motivo: err.message, v: null });
      return { store, termino, categoria, v: null, ms: Date.now() - t0, error: err.message };
    }
  });

  const filas = await Promise.all(chequeos);
  filas.sort((a, b) => a.store.name.localeCompare(b.store.name));

  console.log('estado  tienda              término      productos  con precio   ms');
  console.log('─'.repeat(72));
  for (const f of filas) {
    const ok = f.v && f.v.conPrecio > 0;
    const estado = ok ? '  OK  ' : ' FALLA';
    const prod = f.v ? String(f.v.total) : '-';
    const precio = f.v ? String(f.v.conPrecio) : '-';
    console.log(
      `${estado}  ${f.store.name.padEnd(19)} ${f.termino.padEnd(12)} ${prod.padStart(9)} ${precio.padStart(11)} ${String(f.ms).padStart(5)}`
      + (f.error ? `   ← ${f.error}` : '')
    );
  }

  if (parciales.length) {
    console.log('\nParcialmente degradadas (algunas filas sin precio usable):');
    parciales.forEach((p) =>
      console.log(`  - ${p.store.name}: ${p.v.conPrecio}/${p.v.total} con precio`)
    );
  }

  console.log('');
  if (fallas.length === 0) {
    console.log(`Todas las tiendas responden correctamente (${filas.length}/${filas.length}).`);
    process.exit(0);
  }
  console.log(`${fallas.length} tienda(s) con problemas:`);
  fallas.forEach((f) => console.log(`  - ${f.store.name} ("${f.termino}"): ${f.motivo}`));
  console.log('\nUna tienda en FALLA suele ser: parser desactualizado (cambió el HTML)');
  console.log('o bloqueo por parte del sitio. Revisar con curl antes de tocar el parser.');
  process.exit(1);
})();
