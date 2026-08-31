const axios = require("axios");
const cheerio = require("cheerio");
const { getUsdToUyuRate, convertUsdToUyu } = require("./exchangeRate");

// Cache en memoria: { key: { data, freshUntil, staleUntil } }
//
// Dos ventanas en vez de una sola expiración:
//  - fresco (30 min): se sirve directo.
//  - rancio (hasta 2 h): se sirve IGUAL al instante y se dispara un refresh
//    en segundo plano (stale-while-revalidate). Un scraping en frío cuesta
//    entre 5 y 12 segundos medidos; hacer esperar todo eso por datos que
//    cambian una o dos veces al día no tiene sentido.
const cache = new Map();
// Configurables por env sobre todo para poder testearlos sin esperar 30 min.
const CACHE_TTL = Number(process.env.SCRAPER_FRESH_MS) || 30 * 60 * 1000;
const STALE_TTL = Number(process.env.SCRAPER_STALE_MS) || 2 * 60 * 60 * 1000;

function getCacheEntry(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.staleUntil) { cache.delete(key); return null; }
  return entry;
}

function setCache(key, data) {
  const now = Date.now();
  cache.set(key, { data, freshUntil: now + CACHE_TTL, staleUntil: now + STALE_TTL });
}

// ─── Single-flight (evita el cache stampede) ──────────────────────
// Sin esto, N pedidos concurrentes de la misma búsqueda con la caché fría
// disparan N scrapings idénticos. Medido: 4 pedidos simultáneos de una query
// nueva generaban 40 requests HTTP en vez de 10, y tardaban 12,2s en vez de
// ~3s. Acá el primero scrapea y el resto espera esa misma promesa.
const inFlight = new Map();

function singleFlight(key, fn) {
  const running = inFlight.get(key);
  if (running) return running;
  const promise = (async () => {
    try {
      return await fn();
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, promise);
  return promise;
}

// ─── Límite de concurrencia por dominio ───────────────────────────
// Una lista de compras larga puede disparar decenas de requests casi
// simultáneos contra la misma tienda. Que nos bloqueen la IP rompe la app
// entera, así que se limita cuántos requests van a la vez a un mismo host.
const MAX_CONCURRENT_PER_HOST = 3;
const hostQueues = new Map(); // host → { active, waiting[] }

function hostOf(url) {
  try { return new URL(url).host; } catch { return "desconocido"; }
}

async function withHostLimit(url, fn) {
  const host = hostOf(url);
  let q = hostQueues.get(host);
  if (!q) { q = { active: 0, waiting: [] }; hostQueues.set(host, q); }

  if (q.active >= MAX_CONCURRENT_PER_HOST) {
    await new Promise((resolve) => q.waiting.push(resolve));
  }
  q.active++;
  try {
    return await fn();
  } finally {
    q.active--;
    const next = q.waiting.shift();
    if (next) next();
    else if (q.active === 0) hostQueues.delete(host);
  }
}

// ─── Fetch con reintento ──────────────────────────────────────────
// Un corte de red momentáneo hacía desaparecer la tienda de la comparación
// sin dejar rastro. Se reintenta sólo lo que tiene sentido reintentar:
// errores de red y 5xx/429. Un 404 o un 403 no mejoran reintentando.
const RETRY_DELAYS_MS = [400, 1200];

function isRetryable(err) {
  const status = err.response?.status;
  if (status === undefined) return true;            // error de red / timeout
  return status === 429 || (status >= 500 && status < 600);
}

async function fetchWithRetry(url, options) {
  let lastErr;
  for (let intento = 0; intento <= RETRY_DELAYS_MS.length; intento++) {
    try {
      return await withHostLimit(url, () => axios.get(url, options));
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || intento === RETRY_DELAYS_MS.length) break;
      const espera = err.response?.headers?.["retry-after"]
        ? Number(err.response.headers["retry-after"]) * 1000
        : RETRY_DELAYS_MS[intento];
      await new Promise((r) => setTimeout(r, Math.min(espera, 5000)));
    }
  }
  throw lastErr;
}

// ─── Headers para fetch HTTP directo ──────────────────────────────
const HTTP_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-UY,es;q=0.9,en;q=0.8",
};

// Precio en formato uruguayo: punto = miles, coma = decimal.
// "$ 1.234,50" → 1234.5 | "45,2" → 45.2 | "890" → 890
function parsePrice(text) {
  if (!text) return 0;
  const s = text
    .replace(/[^\d.,]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return parseFloat(s) || 0;
}

// Precio en formato americano: coma = miles, punto = decimal (las tiendas de
// tecnología en Uruguay suelen cotizar en USD con este formato).
// "US$1,530.00" → 1530 | "862.00" → 862
function parsePriceUSD(text) {
  if (!text) return 0;
  const s = text.replace(/[^\d.,]/g, "").replace(/,/g, "");
  return parseFloat(s) || 0;
}

// ─── Parser VTEX (JSON, no HTML) — El Dorado ──────────────────────
// Acepta tanto el catalog_system (array) como el Intelligent Search ({products}).
function parseVtex(data, store) {
  const list = Array.isArray(data) ? data : data?.products || [];
  return list
    .map((p) => {
      const item = p.items?.[0];
      const offer = item?.sellers?.[0]?.commertialOffer;
      if (!offer || !offer.Price) return null;
      return {
        store: store.name,
        storeId: store.id,
        storeColor: store.color,
        name: p.productName,
        price: offer.Price,
        image: item.images?.[0]?.imageUrl || null,
        url: `${store.baseUrl}/${p.linkText}/p`,
        available: offer.AvailableQuantity > 0,
      };
    })
    .filter(Boolean)
    .slice(0, 12);
}

// ─── Scraper Tienda Inglesa (GeneXus, GET+parse HTML) ────────────
// Su buscador usa GeneXus AJAX, pero la página de resultados embebe los
// productos y el token WSEARCH directamente en el HTML → un solo GET.
async function scrapeTiendaInglesa(store, query, cacheKey) {
  try {
    const url = `https://www.tiendainglesa.com.uy/supermercado/busqueda?0,0,${encodeURIComponent(query)},0`;
    const r = await fetchWithRetry(url, {
      headers: { ...HTTP_HEADERS, Accept: "text/html" },
      timeout: 15000,
      maxRedirects: 5,
    });
    const html = String(r.data);

    // Los productos están en el JSON embebido en el HTML como:
    // "Product":[{"Id":...},{"Id":...}]
    // Usamos un parser robusto: localizamos el inicio del array y
    // contamos llaves para encontrar el cierre sin depender de texto posterior.
    const startTag = '"Product":[';
    const startIdx = html.indexOf(startTag);
    if (startIdx < 0) {
      console.log(`[scraper] ${store.name}: sin resultados`);
      setCache(cacheKey, []);
      return [];
    }
    const arrStart = startIdx + startTag.length - 1; // posición del '['
    let depth = 0, end = arrStart;
    for (; end < html.length; end++) {
      if (html[end] === "[" || html[end] === "{") depth++;
      else if (html[end] === "]" || html[end] === "}") { depth--; if (depth === 0) break; }
    }
    const products = JSON.parse(html.slice(arrStart, end + 1));
    let results = products
      .filter((p) => !p.NotForSaleFlag && !p.IsSoldout)
      .map((p) => {
        const price = parseFloat((p.Price || "").replace(/[^0-9]/g, "") || "0");
        if (!p.Name || price <= 0) return null;
        const code = String(p.Code || p.Id || "").padStart(6, "0");
        // Catálogo mixto: víveres traen CurrencySymbol "$" (pesos),
        // electrodomésticos "U$S" (dólares) — confirmado por producto.
        const isUSD = p.CurrencySymbol === "U$S" || /U\$S/i.test(p.Price || "");
        return {
          store: store.name,
          storeId: store.id,
          storeColor: store.color,
          name: p.Name,
          price,
          image: p.DefaultPicture?.Medium || null,
          url: `${store.baseUrl}/supermercado/producto/${code}`,
          available: true,
          ...(isUSD ? { currency: "USD" } : {}),
        };
      })
      .filter(Boolean)
      .slice(0, 12);

    results = await convertResultsToUyu(results);

    console.log(`[scraper] ${store.name}: ${results.length} productos`);
    setCache(cacheKey, results);
    return results;
  } catch (err) {
    console.error(`[scraper] ${store.name} error:`, err.message);
    return [];
  }
}

// ─── Parser H&M UY (Faststore + persisted queries) ───────────────
// ClientManyProductsQuery devuelve name, offers.lowPrice, image[], slug.
// operationHash extraído del bundle JS (cambia solo con deployments de H&M).
const HM_OP   = "ClientManyProductsQuery";
const HM_HASH = "4f5957f4f69009ee8ccf8772e603bd5cda5b333f";

function hmSearchUrl(q) {
  const variables = {
    first: 18,
    after: "0",
    sort: "score_desc",
    term: q,
    selectedFacets: [
      { key: "fuzzy",    value: "0" },
      { key: "operator", value: "and" },
      { key: "channel",  value: JSON.stringify({ salesChannel: 1, regionId: "" }) },
      { key: "locale",   value: "es-UY" },
    ],
    sponsoredCount: 0,
  };
  return `https://uy.hm.com/api/graphql?operationName=${HM_OP}&operationHash=${HM_HASH}&variables=${encodeURIComponent(JSON.stringify(variables))}`;
}

function parseHM(data, store) {
  const edges = data?.data?.search?.products?.edges || [];
  return edges
    .map(({ node }) => {
      const price = node.offers?.lowPrice;
      if (!node.name || !price || price <= 0) return null;
      return {
        store: store.name,
        storeId: store.id,
        storeColor: store.color,
        name: node.isVariantOf?.name || node.name,
        price,
        listPrice: node.offers?.offers?.[0]?.listPrice || null,
        image: node.image?.[0]?.url || null,
        url: `${store.baseUrl}/${node.slug}/p`,
        available: /InStock/i.test(node.offers?.offers?.[0]?.availability || ""),
      };
    })
    .filter(Boolean)
    .slice(0, 12);
}

// ─── Parser Tata (GraphQL Faststore, JSON) ───────────────────────
// Su API /api/graphql usa operationName + variables (sin persisted hash),
// así que se llama directo. El regionId/salesChannel fijan la región de precios.
const TATA_CHANNEL = JSON.stringify({
  salesChannel: "4",
  regionId: "U1cjdGF0YXV5Y2FuZWxvbmVz",
});

function tataSearchUrl(q) {
  const variables = {
    first: 18,
    after: "0",
    sort: "score_desc",
    term: q,
    selectedFacets: [
      { key: "channel", value: TATA_CHANNEL },
      { key: "locale", value: "es-UY" },
    ],
  };
  return `https://www.tata.com.uy/api/graphql?operationName=ProductsQuery&variables=${encodeURIComponent(
    JSON.stringify(variables),
  )}`;
}

function parseTata(data, store) {
  const edges = data?.data?.search?.products?.edges || [];
  return edges
    .map(({ node }) => {
      const offer = node.offers?.offers?.[0];
      const price = node.offers?.lowPrice ?? offer?.price;
      if (!node.name || !price || price <= 0) return null;
      return {
        store: store.name,
        storeId: store.id,
        storeColor: store.color,
        name: node.name,
        price,
        image: node.image?.[0]?.url || null,
        url: `${store.baseUrl}/${node.slug}/p`,
        available: offer ? /InStock/i.test(offer.availability || "") : true,
      };
    })
    .filter(Boolean)
    .slice(0, 12);
}

// ─── Parsers cheerio (HTML → productos[]) ─────────────────────────

// Cencosud (Disco, Géant, Devoto) — página /productos/keyword/{q}
function parseCencosud($, store) {
  const results = [];
  $(".product-item").each((_, el) => {
    const $el = $(el);
    const $a = $el.find(".prod-desc h3 a").first();
    const name = $a.text().trim();
    if (!name) return;

    const href = $a.attr("href") || "";
    const url = href.startsWith("http") ? href : store.baseUrl + href;
    const price = parsePrice($el.find(".desc-prices .val").first().text());
    if (price <= 0) return;

    // Catálogo mixto: víveres en "$" (pesos), electrodomésticos en "U$S"
    // (dólares) — el mismo listado puede traer ambos, hay que chequear por
    // producto, no asumir la moneda a nivel tienda.
    const monText = $el.find(".desc-prices .mon").first().text();
    const isUSD = /U\$S/i.test(monText);

    const image = $el.find("figure img").attr("src") || null;

    results.push({
      store: store.name,
      storeId: store.id,
      storeColor: store.color,
      name,
      price,
      image,
      url,
      available: true,
      ...(isUSD ? { currency: "USD" } : {}),
    });
  });
  return results.slice(0, 12);
}

// Fenicio (El Túnel, San Roque)
function parseFenicio($, store) {
  const results = [];
  $(".info").each((_, el) => {
    const $el = $(el);
    const $name = $el.find("a.tit");
    if (!$name.length) return;

    const name = $name.attr("title") || $name.find("h2").text().trim() || "";
    const url = $name.attr("href") || "";
    const price = parsePrice($el.find(".precios .monto").first().text());
    if (!name || price <= 0) return;

    // Imagen: en el padre de .info, una img que no sea de descuentos
    let image = null;
    $el
      .parent()
      .find("img")
      .each((_, img) => {
        if (image) return;
        const src = $(img).attr("src");
        const insideInfo = $.contains($el.get(0), img);
        if (!insideInfo && src && !src.includes("descuentos")) image = src;
      });

    results.push({
      store: store.name,
      storeId: store.id,
      storeColor: store.color,
      name,
      price,
      image,
      url,
      available: true,
    });
  });
  return results.slice(0, 12);
}

// Magento (Farmashop)
// El contenedor es `.product-item-info`: NO existe ningún elemento con la
// clase `product-item` sola (las que hay son compuestas — product-item-info,
// product-item-name…), así que el selector viejo `.product-item` no matcheaba
// nada y la tienda venía devolviendo cero productos en silencio. Se acepta
// también `li.product-item` por si vuelven al markup anterior.
function parseMagento($, store) {
  const results = [];
  $(".product-item-info, li.product-item").each((_, el) => {
    const $el = $(el);
    const name =
      $el.find(".product-item-link").first().text().trim() ||
      $el.find(".product-item-name").first().text().trim() ||
      $el.find("h2").first().text().trim();

    const url =
      $el.find("a.product-item-link").attr("href") ||
      $el.find("a.product.photo").attr("href") ||
      $el.find("a[href*='.html']").attr("href") ||
      "";

    // OJO con cuál precio: además del regular hay uno de "Farmacard" (tarjeta
    // de fidelidad) más barato. Tomar el último span.price — lo que hacía el
    // parser anterior — mostraba un precio que no paga cualquiera.
    const price = parsePrice(
      $el.find(".price.regular_price").first().text() ||
      $el.find(".price-box.price-final_price .price").first().text() ||
      $el.find("span.price").first().text()
    );
    if (!name || price <= 0) return;

    const $img = $el.find("img.product-image-photo").first();
    const image = $img.attr("src") || $img.attr("data-src") || null;

    results.push({
      store: store.name,
      storeId: store.id,
      storeColor: store.color,
      name,
      price,
      image,
      url,
      available: true,
    });
  });
  return results.slice(0, 12);
}

// Stadium (Fenicio custom — formato de precio con punto de miles "3.990")
function parseStadium($, store) {
  const results = [];
  const seenUrls = new Set();
  // #catalogoProductos contiene solo los resultados de búsqueda reales (no carruseles ni menú)
  const scope = $("#catalogoProductos").length ? $("#catalogoProductos") : $("body");
  scope.find("div.cnt").each((_, el) => {
    const $el = $(el);
    const $link = $el.find("a.img").first();
    const name = $link.attr("title") || "";
    const url = $link.attr("href") || "";
    if (!name || !url || seenUrls.has(url)) return;
    seenUrls.add(url);
    // Precio formato uruguayo "3.990" → 3990 (punto = separador de miles)
    const priceText = $el.find("strong.precio .monto").first().text().trim();
    const price = parseFloat(priceText.replace(/\./g, "").replace(",", ".") || "0");
    if (price <= 0) return;
    const image =
      $el.find("img[src*=fcdn], img[src*=stadium]").first().attr("src") ||
      $el.find("img").first().attr("src") ||
      null;
    results.push({
      store: store.name, storeId: store.id, storeColor: store.color,
      name, price, image, url, available: true,
    });
  });
  return results.slice(0, 12);
}

// NopCommerce (Cosmeshop)
function parseNopCommerce($, store) {
  const results = [];
  $(".product-item").each((_, el) => {
    const $el = $(el);
    const $name = $el.find("h2.product-title a");
    const name = $name.text().trim();

    const rel = $name.attr("href") || "";
    const url = rel.startsWith("http") ? rel : store.baseUrl + rel;

    const price = parsePrice($el.find("span.price.actual-price").first().text());
    if (!name || price <= 0) return;

    const $img = $el.find("img.product-image");
    const image = $img.attr("src") || $img.attr("data-lazyloadsrc") || null;

    results.push({
      store: store.name,
      storeId: store.id,
      storeColor: store.color,
      name,
      price,
      image,
      url,
      available: true,
    });
  });
  return results.slice(0, 12);
}

// Fenicio — ZonaTecno (tema propio, distinto al de El Túnel/San Roque: el
// precio real vive en ".precio.venta .monto", no solo ".precios .monto",
// porque hay un segundo ".monto" anidado con el precio-con-descuento
// condicional que no queremos tomar).
function parseZonaTecno($, store) {
  const results = [];
  $(".info").each((_, el) => {
    const $el = $(el);
    const $name = $el.find("a.tit");
    if (!$name.length) return;

    const name = $name.attr("title") || $name.find("h3").text().trim() || "";
    const url = $name.attr("href") || "";
    const price = parsePrice($el.find(".precios .precio.venta .monto").first().text());
    if (!name || price <= 0) return;

    // La imagen está dentro del <a> hermano justo antes de .info, no dentro de él.
    const rawImage = $el.prev("a").find("img").first().attr("src") || null;
    const image = rawImage && rawImage.startsWith("//") ? `https:${rawImage}` : rawImage;

    results.push({
      store: store.name,
      storeId: store.id,
      storeColor: store.color,
      name,
      price,
      image,
      url,
      available: true,
      currency: "USD",
    });
  });
  return results.slice(0, 12);
}

// Plataforma "Sublime Solutions" (NNET, Digital Outlet, TopTecnoUY comparten
// exactamente el mismo HTML/CSS). El precio actual viene partido en dos
// spans (entero + decimal) dentro de ".precio_cont", ej:
// <span class="pprecio">862</span><span class="pdeci">,50</span>
function parseSublime($, store) {
  const results = [];
  $("article.prod_item").each((_, el) => {
    const $el = $(el);
    if ($el.hasClass("prod_sin_stock")) return; // sin stock, no mostrar

    const $link = $el.find("h2 a").first();
    const name = $link.find("span").first().text().trim() || $link.text().trim();
    const href = $link.attr("href") || "";
    const url = href.startsWith("http") ? href : store.baseUrl + href;

    // El entero trae punto como separador de miles a partir de 4 cifras
    // (ej. "1.999" = 1999) — hay que quitarlo antes de concatenar con los
    // decimales, si no "1.999" + "." + "00" da 1.999 en vez de 1999.
    const $priceBlock = $el.find(".precio_cont").first();
    const entero = $priceBlock.find(".pprecio").first().text().trim().replace(/\./g, "");
    const decimales = $priceBlock.find(".pdeci").first().text().replace(",", "").trim();
    const price = parseFloat(`${entero}.${decimales || "00"}`) || 0;
    if (!name || price <= 0) return;

    const image = $el.find("img").first().attr("src") || null;

    results.push({
      store: store.name,
      storeId: store.id,
      storeColor: store.color,
      name,
      price,
      image,
      url,
      available: true,
      currency: "USD",
    });
  });
  return results.slice(0, 12);
}

// WooCommerce estándar (Thot Computación, tema Porto). Precio en formato
// americano ("US$1,530.00"); imagen con lazy-load (placeholder base64 en
// src, la real está en data-src).
function parseWooCommerce($, store) {
  const results = [];
  $(".product-col.product, li.product").each((_, el) => {
    const $el = $(el);
    if ($el.hasClass("outofstock")) return;

    const $link = $el.find("a.product-loop-title, a.woocommerce-LoopProduct-link").first();
    const name = $el.find(".woocommerce-loop-product__title").first().text().trim();
    const url = $link.attr("href") || "";
    if (!name || !url) return;

    const price = parsePriceUSD(
      $el.find(".price .woocommerce-Price-amount").last().text()
    );
    if (price <= 0) return;

    const $img = $el.find("img").first();
    const image = $img.attr("data-src") || $img.attr("src") || null;

    results.push({
      store: store.name,
      storeId: store.id,
      storeColor: store.color,
      name,
      price,
      image,
      url,
      available: true,
      currency: "USD",
    });
  });
  return results.slice(0, 12);
}

// ─── Categorías disponibles ───────────────────────────────────────
// Cada tienda declara a qué categorías pertenece. Una tienda puede estar
// en más de una (ej: El Túnel vende tanto farmacia como belleza).
// Agregar una tienda nueva = un objeto en SCRAPE_STORES con su categoría.
const CATEGORIES = [
  { id: "supermercado", label: "Supermercado", icon: "cart-outline" },
  { id: "farmacia",     label: "Farmacia",     icon: "medical-outline" },
  { id: "belleza",      label: "Belleza",       icon: "sparkles-outline" },
  { id: "ropa",         label: "Ropa",          icon: "shirt-outline" },
  { id: "hogar",        label: "Hogar y Tecnología", icon: "tv-outline" },
];

// ─── Definición de tiendas ────────────────────────────────────────
const SCRAPE_STORES = [
  // ── Supermercados ─────────────────────────────────────────────
  {
    id: "eldorado", name: "El Dorado", color: "#FFC400",
    // Catálogo unificado: también trae electrodomésticos/tecnología, no solo víveres.
    categories: ["supermercado", "hogar"],
    baseUrl: "https://www.eldorado.com.uy",
    searchUrl: (q) =>
      `https://www.eldorado.com.uy/api/io/_v/api/intelligent-search/product_search/?query=${encodeURIComponent(q)}`,
    parseJson: parseVtex,
  },
  {
    id: "tata", name: "Tata", color: "#E4002B",
    // Incluye la sección Multiahorro (hogar/electro) en el mismo catálogo VTEX.
    categories: ["supermercado", "hogar"],
    baseUrl: "https://www.tata.com.uy",
    searchUrl: tataSearchUrl,
    parseJson: parseTata,
  },
  {
    id: "tiendainglesa", name: "Tienda Inglesa", color: "#006DB7",
    categories: ["supermercado"],
    baseUrl: "https://www.tiendainglesa.com.uy",
    scrape: scrapeTiendaInglesa,
  },
  {
    id: "disco", name: "Disco", color: "#009B3A",
    // Catálogo unificado: también trae electrodomésticos/tecnología, no solo víveres.
    categories: ["supermercado", "hogar"],
    baseUrl: "https://www.disco.com.uy",
    searchUrl: (q) => `https://www.disco.com.uy/productos/keyword/${encodeURIComponent(q)}`,
    parse: parseCencosud,
  },
  {
    id: "geant", name: "Géant", color: "#E63946",
    categories: ["supermercado", "hogar"],
    baseUrl: "https://www.geant.com.uy",
    searchUrl: (q) => `https://www.geant.com.uy/productos/keyword/${encodeURIComponent(q)}`,
    parse: parseCencosud,
  },
  {
    id: "devoto", name: "Devoto", color: "#F4A623",
    categories: ["supermercado", "hogar"],
    baseUrl: "https://www.devoto.com.uy",
    searchUrl: (q) => `https://www.devoto.com.uy/productos/keyword/${encodeURIComponent(q)}`,
    parse: parseCencosud,
  },
  // ── Farmacia / Belleza ─────────────────────────────────────────
  // El Túnel y San Roque venden tanto farmacia como belleza/perfumería.
  {
    id: "eltunel", name: "El Túnel", color: "#1A6FBF",
    categories: ["farmacia", "belleza"],
    baseUrl: "https://eltunel.com.uy",
    searchUrl: (q) => `https://eltunel.com.uy/catalogo?q=${encodeURIComponent(q)}`,
    parse: parseFenicio,
  },
  {
    id: "sanroque", name: "San Roque", color: "#1B5E20",
    categories: ["farmacia", "belleza"],
    baseUrl: "https://www.sanroque.com.uy",
    searchUrl: (q) => `https://www.sanroque.com.uy/catalogo?q=${encodeURIComponent(q)}`,
    parse: parseFenicio,
  },
  {
    id: "farmashop", name: "Farmashop", color: "#F57C00",
    categories: ["farmacia"],
    baseUrl: "https://tienda.farmashop.com.uy",
    searchUrl: (q) =>
      `https://tienda.farmashop.com.uy/catalogsearch/result/?q=${encodeURIComponent(q)}`,
    parse: parseMagento,
  },
  {
    id: "cosmeshop", name: "Cosmeshop", color: "#9C27B0",
    categories: ["belleza"],
    baseUrl: "https://www.cosmeshop.com.uy",
    searchUrl: (q) =>
      `https://www.cosmeshop.com.uy/filterSearch?q=${encodeURIComponent(q)}`,
    parse: parseNopCommerce,
  },
  // ── Ropa ───────────────────────────────────────────────────────
  {
    id: "hm", name: "H&M", color: "#E50010",
    categories: ["ropa"],
    baseUrl: "https://uy.hm.com",
    searchUrl: hmSearchUrl,
    parseJson: parseHM,
  },
  {
    id: "stadium", name: "Stadium", color: "#1A1A1A",
    categories: ["ropa"],
    baseUrl: "https://www.stadium.com.uy",
    searchUrl: (q) => `https://www.stadium.com.uy/productos?q=${encodeURIComponent(q)}`,
    parse: parseStadium,
  },
  // Natal: omitido — sus precios son placeholder $1 en el HTML (los carga JS).
  // Para agregar una tienda nueva: copiar un objeto, setear categories: ["id"]
  // y el parser correspondiente. El resto del sistema lo toma automáticamente.

  // ── Hogar y Tecnología (todas cotizan en USD, no UYU) ───────────
  // `currency: "USD"` hace que scrapeStore() convierta `price` a su
  // equivalente en UYU (tasa oficial BCU) antes de devolverlo, preservando
  // el original en `originalPrice`/`currency` — así el resto del sistema
  // (sorts, sumas, /api/prices stats) sigue comparando manzanas con manzanas
  // sin tener que tocar ese código.
  {
    id: "zonatecno", name: "ZonaTecno", color: "#0072CE",
    categories: ["hogar"],
    currency: "USD",
    baseUrl: "https://www.zonatecno.com.uy",
    searchUrl: (q) => `https://www.zonatecno.com.uy/catalogo?q=${encodeURIComponent(q)}`,
    parse: parseZonaTecno,
  },
  {
    id: "nnet", name: "NNET", color: "#D32F2F",
    categories: ["hogar"],
    currency: "USD",
    baseUrl: "https://www.nnet.com.uy",
    searchUrl: (q) => `https://www.nnet.com.uy/productos/?buscar=${encodeURIComponent(q)}`,
    parse: parseSublime,
  },
  {
    id: "digitaloutlet", name: "Digital Outlet", color: "#37474F",
    categories: ["hogar"],
    currency: "USD",
    baseUrl: "https://www.digitaloutlet.com.uy",
    searchUrl: (q) => `https://www.digitaloutlet.com.uy/productos/?buscar=${encodeURIComponent(q)}`,
    parse: parseSublime,
  },
  {
    id: "toptecnouy", name: "TopTecnoUY", color: "#FF6F00",
    categories: ["hogar"],
    currency: "USD",
    baseUrl: "https://www.toptecnouy.com",
    searchUrl: (q) => `https://www.toptecnouy.com/productos/?buscar=${encodeURIComponent(q)}`,
    parse: parseSublime,
  },
  {
    id: "thot", name: "Thot Computación", color: "#6A1B9A",
    categories: ["hogar"],
    currency: "USD",
    baseUrl: "https://thotcomputacion.com.uy",
    searchUrl: (q) => `https://thotcomputacion.com.uy/?s=${encodeURIComponent(q)}&post_type=product`,
    parse: parseWooCommerce,
  },
];

// Convierte `price` a su equivalente en UYU para todo ítem que el parser
// haya marcado con `currency: "USD"`, usando la cotización oficial del BCU.
// Es POR PRODUCTO, no por tienda: Disco/Géant/Devoto/Tienda Inglesa mezclan
// víveres en pesos con electrodomésticos en dólares dentro del mismo
// catálogo (confirmado en vivo — ej. un TV a "U$S 419" junto a leche a "$
// 89" en el mismo listado), así que no alcanza con un flag a nivel tienda.
// El valor original queda en `originalPrice` para mostrarlo en la UI; el
// resto del sistema (sorts, sumas, min/max/avg en /api/prices) sigue
// leyendo `price` como siempre — ahora comparable sin importar la moneda.
async function convertResultsToUyu(results) {
  const usdItems = results.filter((r) => r.currency === "USD");
  if (usdItems.length === 0) return results;

  let rate;
  try {
    rate = await getUsdToUyuRate();
  } catch (err) {
    console.error("[scraper] no se pudo obtener la cotización BCU, se omiten los productos en USD:", err.message);
    return results.filter((r) => r.currency !== "USD"); // mejor omitir que mostrar un precio sin convertir
  }

  return results.map((r) =>
    r.currency === "USD"
      ? { ...r, originalPrice: r.price, price: convertUsdToUyu(r.price, rate) }
      : r
  );
}

// ─── Scraper (axios + cheerio) ────────────────────────────────────

// El scraping en sí, sin caché ni coalescing (eso lo envuelve scrapeStore).
async function doScrape(store, query, cacheKey) {
  if (store.scrape) return store.scrape(store, query, cacheKey);

  const url = store.searchUrl(query);
  // arraybuffer en vez de dejar que axios decodifique — algunas tiendas
  // (NNET, Digital Outlet, TopTecnoUY) sirven windows-1252/iso-8859-1 y
  // no UTF-8; decodificar como UTF-8 a ciegas rompe los acentos.
  const r = await fetchWithRetry(url, {
    headers: HTTP_HEADERS,
    timeout: 12000,
    maxRedirects: 5,
    responseType: "arraybuffer",
  });
  const charsetMatch = String(r.headers["content-type"] || "").match(/charset=([\w-]+)/i);
  const charset = charsetMatch ? charsetMatch[1].toLowerCase() : "utf-8";
  const body = new TextDecoder(charset).decode(r.data);

  // VTEX devuelve JSON; el resto, HTML que parseamos con cheerio
  let results = store.parseJson
    ? store.parseJson(JSON.parse(body), store)
    : store.parse(cheerio.load(body), store);

  results = await convertResultsToUyu(results);

  console.log(`[scraper] ${store.name}: ${results.length} productos`);
  setCache(cacheKey, results);
  return results;
}

async function scrapeStore(store, query) {
  const cacheKey = `${store.id}:${query.toLowerCase().trim()}`;
  const entry = getCacheEntry(cacheKey);

  if (entry && Date.now() < entry.freshUntil) {
    console.log(`[scraper] cache hit: ${store.name} "${query}"`);
    return entry.data;
  }

  // Rancio pero utilizable: se devuelve al instante y se refresca de fondo.
  if (entry) {
    console.log(`[scraper] cache rancio: ${store.name} "${query}" (refrescando)`);
    singleFlight(cacheKey, () => doScrape(store, query, cacheKey)).catch((err) =>
      console.error(`[scraper] refresh de fondo falló (${store.name}):`, err.message)
    );
    return entry.data;
  }

  // Frío: se scrapea, colapsando pedidos concurrentes de la misma clave.
  try {
    return await singleFlight(cacheKey, () => doScrape(store, query, cacheKey));
  } catch (err) {
    console.error(`[scraper] ${store.name} error:`, err.message);
    return [];
  }
}

async function scrapeAll(query, storeIds = null, category = null) {
  let stores = SCRAPE_STORES;
  if (storeIds)  stores = stores.filter((s) => storeIds.includes(s.id));
  if (category)  stores = stores.filter((s) => s.categories.includes(category));

  // Todas en paralelo: son fetch HTTP livianos, sin navegador ni límite de RAM.
  const settled = await Promise.allSettled(
    stores.map((store) => scrapeStore(store, query)),
  );

  const results = [];
  settled.forEach((r) => {
    if (r.status === "fulfilled") results.push(...r.value);
  });
  return results;
}

module.exports = { scrapeAll, scrapeStore, SCRAPE_STORES, CATEGORIES };
