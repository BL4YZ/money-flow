const { chromium } = require("playwright");

let browser = null;

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

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
      ],
    });
  }
  return browser;
}

// ─── Extractor para tiendas Blazor (Disco, Géant, Devoto) ────────
async function extractBlazor(page, store) {
  return page.evaluate(
    (storeInfo) => {
      const results = [];
      const items = document.querySelectorAll(".sr-list .product-item-suggest");

      items.forEach((item) => {
        const nameEl = item.querySelector(".prod-desc h3 a");
        const valEl = item.querySelector(".prod-price .price .val");
        const imgEl = item.querySelector("figure img");

        if (!nameEl || !valEl) return;

        const priceText = valEl.textContent.replace(/[^0-9]/g, "");
        const price = parseFloat(priceText);
        if (!price || price <= 0) return;

        const href = nameEl.getAttribute("href") || "";
        const url = href.startsWith("http") ? href : storeInfo.baseUrl + href;

        results.push({
          store: storeInfo.name,
          storeId: storeInfo.id,
          storeColor: storeInfo.color,
          name: nameEl.textContent.trim(),
          price,
          image: imgEl?.src || null,
          url,
          available: true,
        });
      });

      return results.slice(0, 12);
    },
    {
      name: store.name,
      id: store.id,
      color: store.color,
      baseUrl: store.baseUrl,
    },
  );
}

// ─── Extractor para tiendas Fenicio (El Tunel, San Roque, Natal) ─
async function extractFenicio(page, store) {
  return page.evaluate(
    (storeInfo) => {
      const items = document.querySelectorAll(".info");
      const results = [];

      items.forEach((item) => {
        const nameEl = item.querySelector("a.tit");
        if (!nameEl) return;

        const name = nameEl.title || nameEl.querySelector("h2")?.textContent?.trim() || "";
        const url = nameEl.href || "";
        const priceEl = item.querySelector(".precios .monto");
        const price = parseFloat(priceEl?.textContent?.replace(/[^0-9]/g, "") || "0");
        if (!name || price <= 0) return;

        // Imagen: está en el padre de .info, fuera del contenido de texto
        const parent = item.parentElement;
        let image = null;
        if (parent) {
          const imgs = Array.from(parent.querySelectorAll("img"));
          const productImg = imgs.find(
            (img) => !item.contains(img) && img.src && !img.src.includes("descuentos"),
          );
          image = productImg?.src || null;
        }

        results.push({
          store: storeInfo.name,
          storeId: storeInfo.id,
          storeColor: storeInfo.color,
          name,
          price,
          image,
          url,
          available: true,
        });
      });

      return results.slice(0, 12);
    },
    { name: store.name, id: store.id, color: store.color },
  );
}

// ─── Extractor para Farmashop (Magento) ──────────────────────────
async function extractMagento(page, store) {
  return page.evaluate(
    (storeInfo) => {
      const items = document.querySelectorAll(".product-item");
      const results = [];

      items.forEach((item) => {
        const nameEl = item.querySelector("h2");
        const name = nameEl?.textContent?.trim() || "";

        const urlEl =
          item.querySelector("a.product.photo") ||
          item.querySelector("a[href*='.html']");
        const url = urlEl?.href || "";

        // Hay múltiples span.price; el último es el precio final (con descuento si lo hay)
        const priceEls = item.querySelectorAll("span.price");
        const priceEl = priceEls[priceEls.length - 1];
        const priceText = priceEl?.textContent?.replace(/[^0-9]/g, "") || "0";
        const price = parseFloat(priceText);

        if (!name || price <= 0) return;

        const imgEl = item.querySelector("img.product-image-photo");
        const image = imgEl?.src || null;

        results.push({
          store: storeInfo.name,
          storeId: storeInfo.id,
          storeColor: storeInfo.color,
          name,
          price,
          image,
          url,
          available: true,
        });
      });

      return results.slice(0, 12);
    },
    { name: store.name, id: store.id, color: store.color, baseUrl: store.baseUrl },
  );
}

// ─── Extractor para Cosmeshop (NopCommerce) ──────────────────────
async function extractNopCommerce(page, store) {
  return page.evaluate(
    (storeInfo) => {
      const items = document.querySelectorAll(".product-item");
      const results = [];

      items.forEach((item) => {
        const nameEl = item.querySelector("h2.product-title a");
        const name = nameEl?.textContent?.trim() || "";

        const relUrl = nameEl?.getAttribute("href") || "";
        const url = relUrl.startsWith("http")
          ? relUrl
          : storeInfo.baseUrl + relUrl;

        // "$U 389" → 389
        const priceEl = item.querySelector("span.price.actual-price");
        const priceText = priceEl?.textContent?.replace(/[^0-9]/g, "") || "0";
        const price = parseFloat(priceText);

        if (!name || price <= 0) return;

        const imgEl = item.querySelector("img.product-image");
        const image =
          imgEl?.src || imgEl?.getAttribute("data-lazyloadsrc") || null;

        results.push({
          store: storeInfo.name,
          storeId: storeInfo.id,
          storeColor: storeInfo.color,
          name,
          price,
          image,
          url,
          available: true,
        });
      });

      return results.slice(0, 12);
    },
    { name: store.name, id: store.id, color: store.color, baseUrl: store.baseUrl },
  );
}

// ─── Búsqueda con "Reintento Inteligente" (solo Blazor) ──────────
async function performSearch(page, query, waitForSelector) {
  const inputLocator = page.locator("#InputSearch");

  await inputLocator.click();
  await page.waitForTimeout(500);
  await inputLocator.clear();

  await inputLocator.pressSequentially(query, { delay: 150 });

  try {
    await page.waitForSelector(waitForSelector, { timeout: 6000 });
  } catch (e) {
    console.log(`[scraper] El menú no apareció. Intentando despertar el input...`);
    await inputLocator.press("Backspace");
    await page.waitForTimeout(500);
    const ultimaLetra = query.slice(-1);
    await inputLocator.pressSequentially(ultimaLetra, { delay: 300 });
    await page.waitForSelector(waitForSelector, { timeout: 8000 });
  }
}

// ─── Definición de tiendas ────────────────────────────────────────
const SCRAPE_STORES = [
  // ── Blazor (Cencosud) ─────────────────────────────────────────
  {
    id: "disco",
    name: "Disco",
    color: "#009B3A",
    baseUrl: "https://www.disco.com.uy",
    homeUrl: "https://www.disco.com.uy",
    waitFor: ".sr-list .product-item-suggest",
    extract: extractBlazor,
    type: "blazor",
  },
  {
    id: "geant",
    name: "Géant",
    color: "#E63946",
    baseUrl: "https://www.geant.com.uy",
    homeUrl: "https://www.geant.com.uy",
    waitFor: ".sr-list .product-item-suggest",
    extract: extractBlazor,
    type: "blazor",
  },
  {
    id: "devoto",
    name: "Devoto",
    color: "#F4A623",
    baseUrl: "https://www.devoto.com.uy",
    homeUrl: "https://www.devoto.com.uy",
    waitFor: ".sr-list .product-item-suggest",
    extract: extractBlazor,
    type: "blazor",
  },
  // ── Fenicio (farmacias/perfumerías) ───────────────────────────
  {
    id: "eltunel",
    name: "El Túnel",
    color: "#1A6FBF",
    baseUrl: "https://eltunel.com.uy",
    searchUrl: (q) => `https://eltunel.com.uy/catalogo?q=${encodeURIComponent(q)}`,
    extract: extractFenicio,
    type: "url",
    waitMs: 7000,
  },
  {
    id: "sanroque",
    name: "San Roque",
    color: "#1B5E20",
    baseUrl: "https://www.sanroque.com.uy",
    searchUrl: (q) => `https://www.sanroque.com.uy/catalogo?q=${encodeURIComponent(q)}`,
    extract: extractFenicio,
    type: "url",
    waitMs: 7000,
  },
  {
    id: "natal",
    name: "Natal",
    color: "#E91E63",
    baseUrl: "https://www.natal.com.uy",
    searchUrl: (q) => `https://www.natal.com.uy/catalogo?q=${encodeURIComponent(q)}`,
    extract: extractFenicio,
    type: "url",
    waitMs: 7000,
  },
  // ── Farmashop (Magento) ───────────────────────────────────────
  {
    id: "farmashop",
    name: "Farmashop",
    color: "#F57C00",
    baseUrl: "https://tienda.farmashop.com.uy",
    searchUrl: (q) =>
      `https://tienda.farmashop.com.uy/catalogsearch/result/?q=${encodeURIComponent(q)}`,
    extract: extractMagento,
    type: "url",
    waitMs: 5000,
  },
  // ── Cosmeshop (NopCommerce) ───────────────────────────────────
  {
    id: "cosmeshop",
    name: "Cosmeshop",
    color: "#9C27B0",
    baseUrl: "https://www.cosmeshop.com.uy",
    searchUrl: (q) =>
      `https://www.cosmeshop.com.uy/filterSearch?q=${encodeURIComponent(q)}`,
    extract: extractNopCommerce,
    type: "url",
    waitMs: 5000,
  },
];

// ─── Scraper principal ────────────────────────────────────────────
async function scrapeStore(store, query) {
  const cacheKey = `${store.id}:${query.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`[scraper] cache hit: ${store.name} "${query}"`);
    return cached;
  }

  const br = await getBrowser();
  const ctx = await br.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "es-UY",
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: {
      "Accept-Language": "es-UY,es;q=0.9,en;q=0.8",
    },
  });

  const page = await ctx.newPage();

  try {
    if (store.type === "url") {
      // ── Tiendas con búsqueda por URL directa ─────────────────
      const searchUrl = store.searchUrl(query);
      console.log(`[scraper] ${store.name}: navegando a ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
      await page.waitForTimeout(store.waitMs || 5000);

      const results = await store.extract(page, store);
      console.log(`[scraper] ${store.name}: ${results.length} productos`);
      setCache(cacheKey, results);
      return results;
    } else {
      // ── Tiendas Blazor (búsqueda por input) ──────────────────
      console.log(`[scraper] ${store.name}: navegando a ${store.homeUrl}`);
      await page.goto(store.homeUrl, {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      await page.waitForSelector("#InputSearch", { timeout: 10000 });
      await page.waitForTimeout(2000);

      try {
        await performSearch(page, query, store.waitFor);
      } catch {
        console.log(
          `[scraper] ${store.name}: no se encontraron resultados para "${query}"`,
        );
        return [];
      }

      await page.waitForTimeout(800);

      const results = await store.extract(page, store);
      console.log(`[scraper] ${store.name}: ${results.length} productos`);
      setCache(cacheKey, results);
      return results;
    }
  } catch (err) {
    console.error(`[scraper] ${store.name} error:`, err.message);
    return [];
  } finally {
    await ctx.close();
  }
}

async function scrapeAll(query, storeIds = null) {
  const stores = storeIds
    ? SCRAPE_STORES.filter((s) => storeIds.includes(s.id))
    : SCRAPE_STORES;

  // Scraping en paralelo (máx 3 a la vez para no sobrecargar CPU/Red)
  const results = [];
  for (let i = 0; i < stores.length; i += 3) {
    const batch = stores.slice(i, i + 3);
    const batchResults = await Promise.allSettled(
      batch.map((store) => scrapeStore(store, query)),
    );
    batchResults.forEach((r) => {
      if (r.status === "fulfilled") results.push(...r.value);
    });
  }

  return results;
}

module.exports = { scrapeAll, scrapeStore, SCRAPE_STORES };
