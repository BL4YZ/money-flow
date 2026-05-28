const express = require("express");
const axios = require("axios");
const authMiddleware = require("../middleware/auth");
const requirePremium = require("../middleware/requirePremium");
const { scrapeAll } = require("../services/scraper");

const router = express.Router();

// ─── Tiendas con API VTEX abierta ────────────────────────────────
const VTEX_STORES = [
  {
    id: "eldorado",
    name: "El Dorado",
    color: "#E63946",
    api: "https://www.eldorado.com.uy/api/catalog_system/pub/products/search",
    baseUrl: "https://www.eldorado.com.uy",
  },
];

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
  Accept: "application/json",
  "Accept-Language": "es-UY,es;q=0.9",
};

function parseVtexProducts(data, store) {
  return data
    .map((p) => {
      const item = p.items?.[0];
      if (!item) return null;
      const offer = item.sellers?.[0]?.commertialOffer;
      if (!offer || !offer.Price) return null;
      return {
        store: store.name,
        storeId: store.id,
        storeColor: store.color,
        name: p.productName,
        price: offer.Price,
        listPrice: offer.ListPrice,
        image: item.images?.[0]?.imageUrl || null,
        url: `${store.baseUrl}/${p.linkText}/p`,
        available: offer.AvailableQuantity > 0,
      };
    })
    .filter(Boolean);
}

// ─── Rutas públicas ───────────────────────────────────────────────
router.get("/auth/debug", (req, res) => {
  res.json({
    message: "ML OAuth deshabilitado. Usando scraping de supermercados.",
  });
});

// ─── Rutas protegidas ─────────────────────────────────────────────
router.use(authMiddleware);

// GET /api/prices/search?q=leche&limit=10&store=disco
router.get("/search", requirePremium, async (req, res) => {
  const { q, limit = 15, store } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: "Búsqueda demasiado corta" });
  }

  const query = q.trim();

  try {
    let vtexItems = [];
    let scrapedItems = [];

    // 1) Lógica de Enrutamiento
    // Detectamos si el frontend pidió una tienda específica y si esa tienda usa API o Scraper
    const isVtexTarget = store ? VTEX_STORES.some((s) => s.id === store) : true;
    const isScrapedTarget = store ? !isVtexTarget : true;

    // 2) Tiendas con API directa (VTEX)
    if (isVtexTarget) {
      const targetStores = store
        ? VTEX_STORES.filter((s) => s.id === store)
        : VTEX_STORES;

      const vtexResults = await Promise.allSettled(
        targetStores.map((s) =>
          axios
            .get(s.api, {
              params: {
                ft: query,
                _from: 0,
                _to: Math.min(parseInt(limit), 20) - 1,
              },
              headers: HEADERS,
              timeout: 10000,
            })
            .then((r) => parseVtexProducts(r.data, s)),
        ),
      );

      vtexItems = vtexResults
        .filter((r) => r.status === "fulfilled")
        .flatMap((r) => r.value);
    }

    // 3) Tiendas con scraping (HTTP + cheerio)
    if (isScrapedTarget) {
      const storeIds = store ? [store] : null;
      console.log(
        `[prices] buscando "${query}" en tienda: ${store || "todas"}`,
      );
      scrapedItems = await scrapeAll(query, storeIds);
    }

    // 4) Combinar resultados
    let items = [...vtexItems, ...scrapedItems];

    // ─── NUEVO: Sistema de Puntuación con Regla de Sustantivo ────────
    const normalizedQuery = query
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const stopWords = [
      "de",
      "con",
      "para",
      "el",
      "la",
      "los",
      "las",
      "un",
      "una",
      "en",
      "y",
      "o",
      "al",
    ];

    const queryKeywords = normalizedQuery
      .split(" ")
      .filter((word) => word.length > 2 && !stopWords.includes(word));

    if (queryKeywords.length > 0) {
      let scoredItems = items.map((item) => {
        const itemName = item.name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        // Limpiamos el nombre del producto de "stopwords" y letras sueltas
        const itemWords = itemName
          .split(" ")
          .filter((w) => w.length > 1 && !stopWords.includes(w));

        let score = 0;
        let matchedKeywords = 0;

        // 1. Puntos base por cada palabra que coincida en cualquier parte
        queryKeywords.forEach((kw) => {
          if (itemName.includes(kw)) {
            score += 3;
            matchedKeywords++;
          }
        });

        // Si no coincidió NADA, le damos 0 y pasamos al siguiente
        if (matchedKeywords === 0) return { ...item, _score: 0, _matched: 0 };

        // 2. Bonus masivo por frase exacta ("suprema de pollo")
        if (itemName.includes(normalizedQuery)) score += 10;

        // 3. LA REGLA DEL SUSTANTIVO
        // Solo miramos la PRIMERA palabra importante del producto (no las dos)
        // Ej: "Harina SUPREMA" → primera palabra es "harina" → no es la main noun
        // Ej: "Suprema 3 Arroyos" → primera palabra es "suprema" → sí es la main noun
        let isMainNoun = false;
        if (itemWords.length > 0) {
          const firstWord = itemWords[0];
          isMainNoun = queryKeywords.some((kw) => firstWord.includes(kw));
          if (isMainNoun) {
            score += 5;
          } else {
            score -= 3;
          }
        }

        // Guardamos si la PRIMERA keyword de la búsqueda está en el nombre
        // Ej: búsqueda "suprema de pollo" → firstKeyword="suprema"
        // "Pollo spiedo" no tiene "suprema" → _matchesFirstKeyword=false
        const matchesFirstKeyword = itemName.includes(queryKeywords[0]);

        return { ...item, _score: score, _matched: matchedKeywords, _isMainNoun: isMainNoun, _matchesFirstKeyword: matchesFirstKeyword };
      });

      // Filtro inteligente para búsquedas de 2+ palabras:
      // - Matchea TODAS las palabras → siempre pasa ("Suprema de pollo 3 Arroyos")
      // - Matchea PARCIAL + palabra clave al inicio del nombre → pasa ("Suprema 3 Arroyos")
      // - Matchea PARCIAL + palabra clave NO al inicio → descartado ("Harina Suprema")
      // Intento 1 — filtro estricto: el producto debe tener TODAS las keywords
      // Ej: "kotex nocturna" → solo pasan productos con "kotex" Y "nocturna"
      let strictFiltered = scoredItems.filter(
        (item) => item._score > 0 && item._matched >= queryKeywords.length,
      );

      // Intento 2 — si el estricto no encuentra nada, relajamos el filtro
      // Esto cubre casos donde la keyword está implícita en el nombre del producto
      // Ej: "suprema de pollo" → ningún producto dice "pollo" → mostramos todas las supremas
      if (strictFiltered.length === 0 && queryKeywords.length > 1) {
        strictFiltered = scoredItems.filter((item) => {
          if (item._score <= 0) return false;
          return item._matchesFirstKeyword && item._isMainNoun;
        });
      }

      scoredItems = strictFiltered;

      // Ordenar: PRIMERO por relevancia (puntaje más alto), LUEGO por precio (menor a mayor)
      scoredItems.sort((a, b) => {
        if (b._score !== a._score) {
          return b._score - a._score;
        }
        return a.price - b.price;
      });

      // Limpiamos variables temporales
      items = scoredItems.map(({ _score, _matched, _isMainNoun, _matchesFirstKeyword, ...rest }) => rest);
    } else {
      items = items.sort((a, b) => a.price - b.price);
    }
    // ───────────────────────────────────────────────────────────────

    // Aplicar límite
    if (limit && !isNaN(limit)) {
      items = items.slice(0, parseInt(limit));
    }

    // 5) Calcular estadísticas (Stats)
    const prices = items.map((i) => i.price);
    const stats = {
      min: Math.min(...prices),
      max: Math.max(...prices),
      avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
      count: items.length,
    };

    const storeNames = [...new Set(items.map((i) => i.store))];
    if (!store) {
      // Solo mostramos el total global en consola si no es una búsqueda individual
      console.log(
        `[prices] total: ${items.length} productos de [${storeNames.join(", ")}]`,
      );
    }

    // Devolvemos el mismo formato que ya tenías, el frontend actualizado lo entiende perfecto
    res.json({ query, items, stats, stores: storeNames });
  } catch (err) {
    console.error("Prices search error:", err.message);
    res.status(500).json({ error: "Error al buscar precios" });
  }
});

module.exports = router;
