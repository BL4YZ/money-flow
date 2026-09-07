/**
 * Cruza el gasto real del banco con los precios del comparador.
 *
 * POR QUÉ ESTA FUNCIÓN Y NO OTRA
 *
 * Hay un comparador uruguayo con 40.000 usuarios haciendo lo mismo que nosotros
 * y con más recorrido. Competir en "quién compara mejor" es una carrera cuesta
 * arriba. Pero un comparador puro no tiene el resumen bancario del usuario, y
 * nosotros sí: sabemos cuánto gasta por mes y —porque el nombre del comercio
 * viene en la descripción de cada movimiento— EN QUÉ SUPERMERCADO compra.
 *
 * Eso permite decir algo que nadie más puede: "comprás en Disco y gastás $8.400
 * por mes; tu lista sale $1.100 menos en Tata". No es una función más: es la
 * única que no se puede copiar sin los datos del banco.
 *
 * CÓMO SE IDENTIFICA LA TIENDA
 *
 * Las descripciones bancarias vienen sucias y abreviadas ("COMPRA TATA MONTEV",
 * "SUPERM DISCO 45"). Se buscan los mismos nombres que ya usa el categorizador,
 * con la ventaja de que acá no importa acertar siempre: si un movimiento no se
 * puede atribuir, se cuenta igual en el total del rubro y sólo se pierde el
 * detalle de dónde. Preferimos no atribuir antes que atribuir mal.
 */

const db = require("../db");
const { SCRAPE_STORES } = require("./scraper");

// Patrones por tienda. Se apoyan en los ids reales del scraper para que lo que
// se detecta en el banco se pueda comparar después contra lo que se scrapea.
const PATRONES_TIENDA = [
  { id: "tata", re: /\bta[\s-]?ta\b|\btata\b/i },
  { id: "disco", re: /\bdisco\b/i },
  { id: "devoto", re: /\bdevoto\b/i },
  { id: "geant", re: /g[eé]ant/i },
  // Sin un patron corto tipo \bti\b: matchea el pronombre "ti" y convertia
  // "PAGO A TI MISMO" en una compra en Tienda Inglesa.
  { id: "tiendainglesa", re: /tienda\s*inglesa/i },
  { id: "eldorado", re: /el\s*dorado|eldorado/i },
];

const CATEGORIA = "Supermercado";

/**
 * Perfil de compra del usuario en supermercados, sobre los últimos `meses`.
 * Devuelve null si no hay datos suficientes para decir algo honesto.
 */
async function perfilDeCompra(userId, meses = 3) {
  const { rows } = await db.query(
    `SELECT date, description, amount
       FROM transactions
      WHERE user_id = $1
        AND category = $2
        AND type = 'debit'
        AND date >= CURRENT_DATE - ($3 || ' months')::interval
      ORDER BY date DESC`,
    [userId, CATEGORIA, String(meses)],
  );

  if (rows.length === 0) return null;

  const porTienda = {};
  let total = 0;
  let sinAtribuir = 0;

  for (const t of rows) {
    const monto = Math.abs(Number(t.amount) || 0);
    total += monto;
    const match = PATRONES_TIENDA.find((p) => p.re.test(t.description || ""));
    if (!match) { sinAtribuir += monto; continue; }
    if (!porTienda[match.id]) porTienda[match.id] = { storeId: match.id, gasto: 0, compras: 0 };
    porTienda[match.id].gasto += monto;
    porTienda[match.id].compras += 1;
  }

  // Nombre y color salen del scraper, para que la UI los pinte igual que en el
  // comparador y no haya dos fuentes de verdad para "cómo se llama esta tienda".
  const tiendas = Object.values(porTienda)
    .map((t) => {
      const s = SCRAPE_STORES.find((x) => x.id === t.storeId);
      return { ...t, store: s ? s.name : t.storeId, storeColor: s ? s.color : null };
    })
    .sort((a, b) => b.gasto - a.gasto);

  // El promedio mensual se calcula sobre los meses que REALMENTE tienen
  // movimientos, no sobre la ventana pedida: si sólo subió un resumen, dividir
  // entre 3 mostraría un tercio de lo que gasta.
  const mesesConDatos = new Set(
    rows.map((t) => String(t.date).slice(0, 7)),
  ).size || 1;

  return {
    total: Math.round(total),
    promedioMensual: Math.round(total / mesesConDatos),
    mesesConDatos,
    compras: rows.length,
    sinAtribuir: Math.round(sinAtribuir),
    tiendas,
    habitual: tiendas[0] || null,
  };
}

/**
 * Compara lo que el usuario paga hoy contra la alternativa más barata, usando la
 * comparación de su lista que ya calcula routes/shopping.js.
 *
 * Sólo compara tiendas con la lista COMPLETA: un total menor por tener menos
 * productos no es un ahorro, y prometer una plata que no existe es peor que no
 * decir nada.
 */
function oportunidad(perfil, comparacion) {
  if (!perfil || !perfil.habitual || !comparacion) return null;

  const completas = (comparacion.byStore || [])
    .filter((s) => s.found === comparacion.totalItems);
  if (completas.length < 2) return null;

  const habitual = completas.find((s) => s.storeId === perfil.habitual.storeId);
  const mejor = completas.reduce((a, b) => (a.total <= b.total ? a : b));
  if (!habitual || mejor.storeId === habitual.storeId) {
    return { yaCompraEnLaMejor: true, habitual: perfil.habitual, mejor: null, ahorroLista: 0 };
  }

  const ahorroLista = Math.round(habitual.total - mejor.total);
  if (ahorroLista <= 0) {
    return { yaCompraEnLaMejor: true, habitual: perfil.habitual, mejor: null, ahorroLista: 0 };
  }

  // Proyección a un mes: el ahorro de la lista escalado por lo que gasta de
  // verdad. Es una estimación y la UI tiene que decirlo — la lista es una
  // muestra de su compra, no su compra entera.
  const proporcion = habitual.total > 0 ? ahorroLista / habitual.total : 0;
  const ahorroMensual = Math.round(perfil.promedioMensual * proporcion);

  return {
    yaCompraEnLaMejor: false,
    habitual: { ...perfil.habitual, totalLista: Math.round(habitual.total) },
    mejor: { storeId: mejor.storeId, store: mejor.name, storeColor: mejor.color, totalLista: Math.round(mejor.total) },
    ahorroLista,
    ahorroPct: Math.round(proporcion * 100),
    ahorroMensual,
  };
}

module.exports = { perfilDeCompra, oportunidad, PATRONES_TIENDA };
