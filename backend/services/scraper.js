const axios = require("axios");
const cheerio = require("cheerio");

// Cache en memoria: { key: { data, expiresAt } }
const cache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
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
    const r = await axios.get(url, {
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
    const results = products
      .filter((p) => !p.NotForSaleFlag && !p.IsSoldout)
      .map((p) => {
        const price = parseFloat((p.Price || "").replace(/[^0-9]/g, "") || "0");
        if (!p.Name || price <= 0) return null;
        const code = String(p.Code || p.Id || "").padStart(6, "0");
        return {
          store: store.name,
          storeId: store.id,
          storeColor: store.color,
          name: p.Name,
          price,
          image: p.DefaultPicture?.Medium || null,
          url: `${store.baseUrl}/supermercado/producto/${code}`,
          available: true,
        };
      })
      .filter(Boolean)
      .slice(0, 12);

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
function parseMagento($, store) {
  const results = [];
  $(".product-item").each((_, el) => {
    const $el = $(el);
    const name = $el.find("h2").first().text().trim();

    const url =
      $el.find("a.product.photo").attr("href") ||
      $el.find("a[href*='.html']").attr("href") ||
      "";

    // Múltiples span.price; el último es el precio final (con descuento si lo hay)
    const price = parsePrice($el.find("span.price").last().text());
    if (!name || price <= 0) return;

    const image = $el.find("img.product-image-photo").attr("src") || null;

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
];

// ─── Scraper (axios + cheerio) ────────────────────────────────────
async function scrapeStore(store, query) {
  const cacheKey = `${store.id}:${query.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`[scraper] cache hit: ${store.name} "${query}"`);
    return cached;
  }

  // Tiendas con función de scraping propia (ej: GeneXus, flujos complejos)
  if (store.scrape) return store.scrape(store, query, cacheKey);

  try {
    const url = store.searchUrl(query);
    const r = await axios.get(url, {
      headers: HTTP_HEADERS,
      timeout: 12000,
      maxRedirects: 5,
    });
    // VTEX devuelve JSON; el resto, HTML que parseamos con cheerio
    const results = store.parseJson
      ? store.parseJson(r.data, store)
      : store.parse(cheerio.load(r.data), store);
    console.log(`[scraper] ${store.name}: ${results.length} productos`);
    setCache(cacheKey, results);
    return results;
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
