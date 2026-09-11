/**
 * ¿Por qué el "carrito óptimo" sale MÁS CARO que comprar todo en una tienda?
 *
 *   node scripts/diag-carrito-optimo.js "item 1" "item 2" ...
 *   node scripts/diag-carrito-optimo.js            (usa la lista del reporte)
 *
 * Reportado desde la app: el carrito óptimo daba $1.098 recorriendo 4 tiendas
 * mientras Tata tenía los 8 ítems por $957.
 *
 * La hipótesis a comprobar es la que el propio código anota: `optimalTotal` se
 * arma con el mejor valor POR UNIDAD, y el mejor valor por unidad suele venir
 * en envase grande — así que el carrito "óptimo" puede estar comprando 5 kg
 * donde la tienda barata vende 1 kg. Si es eso, los dos totales miden canastas
 * distintas y compararlos en pesos no significa nada.
 *
 * Imprime, ítem por ítem, qué eligió el óptimo y qué tiene la tienda más barata
 * que cubre la lista entera, con cantidad y precio por unidad de las dos. Si la
 * hipótesis es correcta, la columna de cantidad lo va a mostrar sola.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { __testing } = require('../routes/shopping');
const { parseQuantity, compareByValue } = require('../services/productMatcher');

const LISTA = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['bidon salus', 'Azucar 500g', 'Leche entera conaprole', 'sal fina',
     'Pan de molde bimbo', 'arroz', 'atun emigrante lomito', 'leche condensada'];

const peso = (p) => {
  const q = parseQuantity(p.name);
  return q ? `${q.qty}${q.unit}` : '—';
};
const unit = (p) => (p.unitPrice != null ? `$${Math.round(p.unitPrice)}/${p.unitBase}` : '—');

(async () => {
  console.log(`Lista de ${LISTA.length} ítems\n`);

  const porItem = [];
  for (const termino of LISTA) {
    // scrapeItem recibe un ITEM, no un string: pasarle el string dejaba la
    // query vacia y el scrape devolvia cualquier cosa.
    const res = await __testing.scrapeItem({ name: termino, quantity: 1, id: 0 }, 'supermercado');
    const ofertas = Object.values(res.byStore || {});
    if (ofertas.length === 0) { porItem.push({ termino, elegido: null, ofertas: [] }); continue; }
    // Lo mismo que hace la ruta: el mejor VALOR POR UNIDAD.
    const elegido = [...ofertas].sort(compareByValue)[0];
    porItem.push({ termino, elegido, ofertas });
  }

  // La tienda más barata que cubre TODA la lista, que es con la que el usuario
  // compara mentalmente.
  const tiendas = {};
  for (const { ofertas } of porItem) {
    for (const o of ofertas) {
      tiendas[o.storeId] = tiendas[o.storeId] || { nombre: o.storeName, items: 0, total: 0, elegidos: {} };
    }
  }
  for (const { termino, ofertas } of porItem) {
    for (const id of Object.keys(tiendas)) {
      const suyas = ofertas.filter((o) => o.storeId === id);
      if (suyas.length === 0) continue;
      const mejor = suyas.sort((a, b) => a.price - b.price)[0];
      tiendas[id].items++;
      tiendas[id].total += mejor.price;
      tiendas[id].elegidos[termino] = mejor;
    }
  }
  const completas = Object.entries(tiendas)
    .filter(([, t]) => t.items === porItem.filter((p) => p.elegido).length)
    .sort((a, b) => a[1].total - b[1].total);

  const optimo = porItem.reduce((s, p) => s + (p.elegido ? p.elegido.price : 0), 0);
  const unaTienda = completas[0];

  console.log(`CARRITO ÓPTIMO (mejor valor por unidad):  $${Math.round(optimo)}`);
  if (unaTienda) {
    const nom = String(unaTienda[1].nombre || unaTienda[0]);
    console.log(`TODO EN ${nom.toUpperCase()}:${' '.repeat(Math.max(1, 24 - nom.length))}$${Math.round(unaTienda[1].total)}`);
  } else {
    console.log('(ninguna tienda cubre la lista entera)');
  }
  console.log();

  console.log('ítem                       ÓPTIMO                              vs  UNA TIENDA');
  console.log('-'.repeat(100));
  for (const { termino, elegido } of porItem) {
    if (!elegido) { console.log(`${termino.slice(0, 24).padEnd(26)} (sin resultados)`); continue; }
    const enTienda = unaTienda ? unaTienda[1].elegidos[termino] : null;
    const izq = `$${String(Math.round(elegido.price)).padStart(4)} ${peso(elegido).padEnd(7)} ${unit(elegido).padEnd(11)} ${String(elegido.storeName || elegido.storeId || '?').slice(0, 8)}`;
    const der = enTienda
      ? `$${String(Math.round(enTienda.price)).padStart(4)} ${peso(enTienda).padEnd(7)} ${unit(enTienda)}`
      : '—';
    const distinto = enTienda && peso(elegido) !== peso(enTienda) ? '  <-- OTRO ENVASE' : '';
    console.log(`${termino.slice(0, 24).padEnd(26)} ${izq.padEnd(36)}  ${der}${distinto}`);
  }
  process.exit(0);
})().catch((e) => { console.error('error:', e.message); process.exit(1); });
