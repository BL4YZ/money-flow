const express = require("express");
const authMiddleware = require("../middleware/auth");
const requirePremium = require("../middleware/requirePremium");
const { scrapeAll, SCRAPE_STORES, CATEGORIES } = require("../services/scraper");

const router = express.Router();

// ─── Rutas protegidas ─────────────────────────────────────────────
router.use(authMiddleware);

// GET /api/prices/categories — lista de categorías con sus tiendas
router.get("/categories", (req, res) => {
  const cats = CATEGORIES.map((cat) => ({
    ...cat,
    stores: SCRAPE_STORES
      .filter((s) => s.categories.includes(cat.id))
      .map((s) => ({ id: s.id, name: s.name, color: s.color })),
  }));
  res.json({ categories: cats });
});

// GET /api/prices/search?q=leche&limit=10&store=disco&category=supermercado
// Todas las tiendas (incluida El Dorado) las maneja el scraper unificado.
router.get("/search", requirePremium, async (req, res) => {
  const { q, limit = 15, store, category } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: "Búsqueda demasiado corta" });
  }

  const query = q.trim();

  try {
    console.log(`[prices] buscando "${query}" cat:${category||"todas"} tienda:${store||"todas"}`);
    let items = await scrapeAll(query, store ? [store] : null, category || null);

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

    // Los dígitos siempre sobreviven aunque el token sea corto — "2" en
    // "Nintendo Switch 2" es lo único que distingue la consola de accesorios
    // para la Switch original; descartarlo hacía que cualquier producto con
    // "nintendo switch" matcheara igual de bien.
    const queryKeywords = normalizedQuery
      .split(" ")
      .filter((word) => (word.length > 2 || /\d/.test(word)) && !stopWords.includes(word));

    // Accesorios/complementos que repiten el nombre del producto principal en
    // su título (SEO de e-commerce) — sin esto, "Pack Volantes Joy-Con para
    // Nintendo Switch 2" empataba o incluso superaba a "Consola Nintendo
    // Switch 2" (la regla del sustantivo penaliza a "Consola..." por no
    // empezar con la marca, y el accesorio sí). Penaliza si el producto lo
    // menciona pero la búsqueda no lo pidió — buscar "funda switch 2" sigue
    // funcionando normal.
    const ACCESSORY_WORDS = [
      "funda", "case", "estuche", "protector", "templado", "vidrio",
      "pack", "combo", "kit",
      "volante", "volantes", "joystick", "control", "mando", "gamepad",
      "cargador", "cable", "adaptador", "powerbank", "bateria",
      "soporte", "base", "mochila", "bolso",
      "auriculares", "audifonos", "correa", "grip", "skin", "vinilo",
      "camara", "microfono",
      "juego", "videojuego", "accesorio", "accesorios", "repuesto", "repuestos",
      "memoria", "microsd", "playstand", "stand", "dock", "webcam",
    ];

    if (queryKeywords.length > 0) {
      let scoredItems = items.map((item) => {
        const itemName = item.name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        // Limpiamos el nombre del producto de "stopwords" y letras sueltas
        const itemWords = itemName
          .split(" ")
          .filter((w) => (w.length > 1 || /\d/.test(w)) && !stopWords.includes(w));

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

        // 4. Penalización por accesorio no pedido (ver comentario arriba)
        const isUnrequestedAccessory = ACCESSORY_WORDS.some(
          (word) => itemName.includes(word) && !queryKeywords.includes(word)
        );
        // -15 (no -8): un accesorio que empieza con la marca ("Pack Volantes
        // Joy-Con...") ya le saca 5 puntos de ventaja de "regla del sustantivo"
        // a un producto real que empieza con la categoría ("Consola Nintendo
        // Switch 2") — el castigo tiene que superar ese margen con comodidad.
        if (isUnrequestedAccessory) score -= 15;

        // Los números después de un nombre propio suelen ser la generación/
        // modelo ("Switch 2" vs "Switch") — obligatorios en cualquier filtro,
        // incluso el relajado, o "Consola Nintendo Switch [original]" pasa
        // como match de "nintendo switch 2" con nintendo+switch ya matcheados.
        const numericKeywords = queryKeywords.filter((k) => /^\d+$/.test(k));
        // Match de palabra completa (\bN\b) — si no, "32GB"/"2024" "contienen"
        // el "2" como substring y dejan pasar cualquier producto igual.
        const hasAllNumericKeywords = numericKeywords.every((k) => new RegExp(`\\b${k}\\b`).test(itemName));

        return { ...item, _score: score, _matched: matchedKeywords, _isMainNoun: isMainNoun, _matchesFirstKeyword: matchesFirstKeyword, _hasAllNumericKeywords: hasAllNumericKeywords };
      });

      // Filtro inteligente para búsquedas de 2+ palabras:
      // - Matchea TODAS las palabras → siempre pasa ("Suprema de pollo 3 Arroyos")
      // - Matchea PARCIAL + palabra clave al inicio del nombre → pasa ("Suprema 3 Arroyos")
      // - Matchea PARCIAL + palabra clave NO al inicio → descartado ("Harina Suprema")
      // Intento 1 — filtro estricto: el producto debe tener TODAS las keywords
      // Ej: "kotex nocturna" → solo pasan productos con "kotex" Y "nocturna"
      let strictFiltered = scoredItems.filter(
        (item) => item._score > 0 && item._matched >= queryKeywords.length && item._hasAllNumericKeywords,
      );

      // Intento 2 — si el estricto no encuentra nada, relajamos el filtro
      // Esto cubre casos donde la keyword está implícita en el nombre del producto
      // Ej: "suprema de pollo" → ningún producto dice "pollo" → mostramos todas las supremas
      // (los números siguen siendo obligatorios incluso acá)
      if (strictFiltered.length === 0 && queryKeywords.length > 1) {
        strictFiltered = scoredItems.filter((item) => {
          if (item._score <= 0 || !item._hasAllNumericKeywords) return false;
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
      items = scoredItems.map(({ _score, _matched, _isMainNoun, _matchesFirstKeyword, _hasAllNumericKeywords, ...rest }) => rest);
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
