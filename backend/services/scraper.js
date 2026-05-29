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

// ─── Definición de tiendas (todas HTTP + cheerio, sin navegador) ──
const SCRAPE_STORES = [
  // ── El Dorado (API VTEX, JSON directo — la fuente más rápida) ──
  {
    id: "eldorado",
    name: "El Dorado",
    color: "#FFC400",
    baseUrl: "https://www.eldorado.com.uy",
    searchUrl: (q) =>
      `https://www.eldorado.com.uy/api/io/_v/api/intelligent-search/product_search/?query=${encodeURIComponent(q)}`,
    parseJson: parseVtex,
  },
  // ── Tata (GraphQL Faststore, JSON directo) ─────────────────────
  {
    id: "tata",
    name: "Tata",
    color: "#E4002B",
    baseUrl: "https://www.tata.com.uy",
    searchUrl: tataSearchUrl,
    parseJson: parseTata,
  },
  // ── Tienda Inglesa (GeneXus, GET + parse HTML embebido) ─────────
  {
    id: "tiendainglesa",
    name: "Tienda Inglesa",
    color: "#006DB7",
    baseUrl: "https://www.tiendainglesa.com.uy",
    scrape: scrapeTiendaInglesa, // función propia, no usa parseJson ni parse
  },
  // ── Cencosud ───────────────────────────────────────────────────
  {
    id: "disco",
    name: "Disco",
    color: "#009B3A",
    baseUrl: "https://www.disco.com.uy",
    searchUrl: (q) => `https://www.disco.com.uy/productos/keyword/${encodeURIComponent(q)}`,
    parse: parseCencosud,
  },
  {
    id: "geant",
    name: "Géant",
    color: "#E63946",
    baseUrl: "https://www.geant.com.uy",
    searchUrl: (q) => `https://www.geant.com.uy/productos/keyword/${encodeURIComponent(q)}`,
    parse: parseCencosud,
  },
  {
    id: "devoto",
    name: "Devoto",
    color: "#F4A623",
    baseUrl: "https://www.devoto.com.uy",
    searchUrl: (q) => `https://www.devoto.com.uy/productos/keyword/${encodeURIComponent(q)}`,
    parse: parseCencosud,
  },
  // ── Fenicio (farmacias/perfumerías) ────────────────────────────
  {
    id: "eltunel",
    name: "El Túnel",
    color: "#1A6FBF",
    baseUrl: "https://eltunel.com.uy",
    searchUrl: (q) => `https://eltunel.com.uy/catalogo?q=${encodeURIComponent(q)}`,
    parse: parseFenicio,
  },
  {
    id: "sanroque",
    name: "San Roque",
    color: "#1B5E20",
    baseUrl: "https://www.sanroque.com.uy",
    searchUrl: (q) => `https://www.sanroque.com.uy/catalogo?q=${encodeURIComponent(q)}`,
    parse: parseFenicio,
  },
  // ── Farmashop (Magento) ────────────────────────────────────────
  {
    id: "farmashop",
    name: "Farmashop",
    color: "#F57C00",
    baseUrl: "https://tienda.farmashop.com.uy",
    searchUrl: (q) =>
      `https://tienda.farmashop.com.uy/catalogsearch/result/?q=${encodeURIComponent(q)}`,
    parse: parseMagento,
  },
  // ── Cosmeshop (NopCommerce) ────────────────────────────────────
  {
    id: "cosmeshop",
    name: "Cosmeshop",
    color: "#9C27B0",
    baseUrl: "https://www.cosmeshop.com.uy",
    searchUrl: (q) =>
      `https://www.cosmeshop.com.uy/filterSearch?q=${encodeURIComponent(q)}`,
    parse: parseNopCommerce,
  },
  // Natal: omitido — su HTML sirve los precios como placeholder "$1" (los carga
  // JS aparte), así que por HTTP daría precios falsos.
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

async function scrapeAll(query, storeIds = null) {
  const stores = storeIds
    ? SCRAPE_STORES.filter((s) => storeIds.includes(s.id))
    : SCRAPE_STORES;

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

module.exports = { scrapeAll, scrapeStore, SCRAPE_STORES };
