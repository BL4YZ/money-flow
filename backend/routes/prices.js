const express = require("express");
const authMiddleware = require("../middleware/auth");
const requirePremium = require("../middleware/requirePremium");
const { scrapeAll, SCRAPE_STORES, CATEGORIES } = require("../services/scraper");
const {
  normalize,
  tokenize,
  isAccessoryFor,
  hasAllModelTokens,
  matchesToken,
  phraseInProduct,
  isModifierMention,
  isNegatedMention,
  dedupeResults,
  filterPriceOutliers,
  withUnitPrices,
  compareByValue,
  groupProducts,
  markOffCategoryItems,
  topPerStore,
  buildCorpusStats,
  bm25Score,
  tokenInProductFuzzy,
} = require("../services/productMatcher");

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

    // Normalización y tokenización compartidas con routes/shopping.js
    // (services/productMatcher.js) — antes estaban duplicadas acá y cada
    // arreglo de relevancia había que hacerlo dos veces.
    const normalizedQuery = normalize(query);
    const queryKeywords = tokenize(query);
    let usoRespaldoDeTienda = false;

    // Duplicados exactos + listados placeholder rotos (ej: "Microondas" a
    // $239 sin marca conviviendo con microondas reales de $3.400+).
    items = filterPriceOutliers(dedupeResults(items), queryKeywords);
    // Precio por unidad (por L / kg / m / un) para poder comparar envases de
    // distinto tamaño — ver productMatcher.withUnitPrices.
    items = withUnitPrices(items);
    // Categoría real de la tienda (ver productMatcher.markOffCategoryItems)
    items = markOffCategoryItems(items, queryKeywords);

    // Estadísticas del corpus (IDF + largo promedio) para BM25. El corpus es
    // el set de resultados de esta búsqueda: la pregunta que importa es qué
    // término discrimina entre ESTOS candidatos.
    const corpus = buildCorpusStats(items);

    if (queryKeywords.length > 0) {
      let scoredItems = items.map((item) => {
        const itemName = normalize(item.name);
        const itemWords = tokenize(item.name);

        let matchedKeywords = 0;
        queryKeywords.forEach((kw) => {
          if (matchesToken(kw, itemName)) matchedKeywords++;
        });

        // Si no coincidió NADA, le damos 0 y pasamos al siguiente. Igual
        // conserva _itemName/_hasAllNumericKeywords: el rescate por typos de
        // más abajo justamente busca entre estos.
        if (matchedKeywords === 0) {
          return {
            ...item,
            _score: 0,
            _matched: 0,
            _itemName: itemName,
            _hasAllNumericKeywords: hasAllModelTokens(queryKeywords, itemName),
          };
        }

        // 1. Base BM25 (reemplaza el "+3 plano por keyword"): pondera por
        // rareza del término (IDF) y satura la repetición. Se escala x3 para
        // mantener los bonus/castigos de abajo en la misma proporción con la
        // que fueron calibrados contra datos reales.
        let score = bm25Score(queryKeywords, itemWords, corpus) * 3;

        // 2. Bonus masivo por frase exacta ("suprema de pollo")
        if (phraseInProduct(normalizedQuery, itemName)) score += 10;

        // 3. LA REGLA DEL SUSTANTIVO
        // Solo miramos la PRIMERA palabra importante del producto (no las dos)
        // Ej: "Harina SUPREMA" → primera palabra es "harina" → no es la main noun
        // Ej: "Suprema 3 Arroyos" → primera palabra es "suprema" → sí es la main noun
        let isMainNoun = false;
        if (itemWords.length > 0) {
          const firstWord = itemWords[0];
          isMainNoun = queryKeywords.some((kw) => matchesToken(kw, firstWord));
          if (isMainNoun) {
            score += 5;
          } else {
            score -= 3;
          }
        }

        // Guardamos si la PRIMERA keyword de la búsqueda está en el nombre
        // Ej: búsqueda "suprema de pollo" → firstKeyword="suprema"
        // "Pollo spiedo" no tiene "suprema" → _matchesFirstKeyword=false
        const matchesFirstKeyword = matchesToken(queryKeywords[0], itemName);

        // 4. Penalización por accesorio no pedido (lista de palabras +
        // regla gramatical "X para <lo buscado>", ver productMatcher.js).
        // -15 (no -8): un accesorio que empieza con la marca ("Pack Volantes
        // Joy-Con...") ya le saca 5 puntos de ventaja de "regla del sustantivo"
        // a un producto real que empieza con la categoría ("Consola Nintendo
        // Switch 2") — el castigo tiene que superar ese margen con comodidad.
        if (isAccessoryFor(queryKeywords, itemName)) score -= 15;

        // Otra categoría según la taxonomía de la tienda
        if (item._offCategory) score -= 12;

        // Tokens de modelo/generación obligatorios en cualquier filtro,
        // incluso el relajado ("Switch 2" vs "Switch", "i7" vs "i5") —
        // ver productMatcher.hasAllModelTokens.
        const hasAllNumericKeywords = hasAllModelTokens(queryKeywords, itemName);

        return { ...item, _score: score, _matched: matchedKeywords, _isMainNoun: isMainNoun, _matchesFirstKeyword: matchesFirstKeyword, _hasAllNumericKeywords: hasAllNumericKeywords, _itemName: itemName };
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

      // Intento 3 — tolerancia a typos, sólo como red de seguridad cuando lo
      // exacto casi no encontró nada ("shampo" → "shampoo"). Los matches
      // difusos entran con score penalizado para que NUNCA le ganen a un
      // match exacto, y los tokens con dígitos siguen exigiendo exactitud
      // (confundir "i5" con "i7" es peor que no encontrar nada).
      const FUZZY_TRIGGER = 3;
      if (strictFiltered.length < FUZZY_TRIGGER) {
        const yaIncluidos = new Set(strictFiltered.map((i) => i.url || i.name));
        const difusos = scoredItems.filter((item) => {
          if (yaIncluidos.has(item.url || item.name)) return false;
          if (!item._hasAllNumericKeywords) return false;
          // El rescate no puede resucitar lo que la regla de accesorios
          // descartó a propósito: buscando "xbox series x" traía de vuelta
          // "Juego para Xbox Series X FIFA 2023" (la consola no está en
          // ninguna tienda; mostrar el juego en su lugar confunde más de lo
          // que ayuda).
          if (isAccessoryFor(queryKeywords, item._itemName)) return false;
          const itemWords = tokenize(item.name);
          return queryKeywords.every(
            (kw) => matchesToken(kw, item._itemName) || tokenInProductFuzzy(kw, itemWords)
          );
        });
        strictFiltered = strictFiltered.concat(
          difusos.map((i) => ({ ...i, _score: i._score - 100, _fuzzy: true }))
        );
      }

      const mainToken = queryKeywords[0];

      // Intento 4 — confiar en el buscador de la tienda. Si después de todo
      // lo anterior no quedó nada, pero las tiendas SÍ devolvieron productos
      // para este término, ellas saben algo que nosotros no.
      //
      // El caso que lo motivó: "ibuprofeno" devolvía 0. El scrape crudo traía
      // 36 productos — Perifar, Actron, Ibupirac — porque el buscador de cada
      // farmacia mapea el genérico a sus marcas. Ningún nombre contiene la
      // palabra "ibuprofeno", así que nuestro filtro los tiraba todos. Con
      // medicamentos esto es la norma, no la excepción: el genérico y la marca
      // comercial no comparten ni un token, y una lista de sinónimos tendría
      // que enumerar todo el vademécum.
      //
      // Entran con score muy bajo (nunca le ganan a un match propio) y siguen
      // pasando por los filtros de accesorio/modificador/negación de abajo.
      // Sólo para búsquedas de UN token, y esto es lo que hace la diferencia
      // entre útil y basura. Con un término suelto, o la tienda lo entendió o
      // no devolvió nada. Con varios degrada a matchear cualquiera de ellos:
      // "xbox series x" devolvía un "Vino Tannat 90 POINTS SERIES", una
      // asadera y una pistola NERF — todos enganchados por la palabra
      // "series". Ahí cero resultados es la respuesta correcta.
      if (strictFiltered.length === 0 && queryKeywords.length === 1) {
        // Sólo la cabeza del listado de cada tienda: la cola es donde vive su
        // propia expansión difusa (ver productMatcher.topPerStore).
        strictFiltered = topPerStore(scoredItems).map((i) => ({ ...i, _score: -500, _storeTrust: true }));
      }

      // Los accesorios se SACAN, no sólo se despriorizan. El castigo de -15
      // los mandaba al fondo pero seguían en la lista, y eso contamina lo que
      // el usuario ve como comparación: buscando "nintendo switch 2", un pack
      // de Joy-Con de $2.374 conviviendo con consolas de $30.000 hace que el
      // "desde $" y el mínimo del rango de precios mientan.
      // Red de seguridad: si TODO lo que hay son accesorios, se muestran igual
      // — es mejor que una pantalla vacía, y significa que la tienda no tiene
      // el producto principal (ver "xbox series x", donde sólo hay juegos).
      const sinAccesorios = strictFiltered.filter(
        (item) => !isAccessoryFor(queryKeywords, item._itemName)
      );
      if (sinAccesorios.length > 0) strictFiltered = sinAccesorios;

      // "X de Y": lo buscado aparece como ingrediente, no como producto —
      // "Helado 3 L Dulce De Leche" ganaba la búsqueda "leche 3 litros".
      // La regla ya existía en productMatcher (la usa shopping.js) pero acá
      // nunca se había conectado.
      //
      // Este filtro NO tiene la red de seguridad que sí tienen los accesorios,
      // a propósito. Verificado en vivo: no hay leche de 3 L en ninguna cadena
      // (el scrape crudo de "leche 3l" devuelve helados, jabón líquido y
      // Coca-Cola de 3 L, cero leche). Un accesorio al menos informa — "la
      // consola no está, hay juegos" —, pero un helado no dice nada del precio
      // de la leche. Ante un hueco de stock real, cero resultados es la
      // respuesta honesta.
      strictFiltered = strictFiltered.filter(
        (item) => !isModifierMention(mainToken, item._itemName)
      );

      // "Sin X": el producto anuncia la AUSENCIA de lo buscado ("Pulpa de
      // Tomate SIN AZÚCAR" para "azúcar", "Maní SIN SAL" para "sal").
      // Se descartan sólo si quedan productos que sí lo afirman: buscando
      // "lactosa" o "gluten" nadie vende el ingrediente suelto y lo que la
      // gente quiere ES el "sin lactosa" — ahí este filtro no se aplica solo.
      const sinNegados = strictFiltered.filter(
        (item) => !isNegatedMention(mainToken, item._itemName)
      );
      if (sinNegados.length > 0) strictFiltered = sinNegados;

      // ¿Estos resultados son sustitutos? El respaldo de tienda devuelve las
      // marcas con las que se vende un genérico ("ibuprofeno" → Perifar,
      // Actron). Sin avisarlo, el usuario ve nombres que no pidió y parece que
      // el buscador falló; con el aviso, es información útil.
      usoRespaldoDeTienda = strictFiltered.some((i) => i._storeTrust);

      scoredItems = strictFiltered;

      // Ordenar: primero relevancia, después el MEJOR VALOR — precio por
      // unidad cuando ambos lo tienen en la misma unidad base, si no precio
      // absoluto (ver compareByValue). Sin esto, entre dos leches igual de
      // relevantes ganaba la de 250 ml a $44 por sobre la de 1 L a $45, que
      // es 4× más cara por litro.
      scoredItems.sort((a, b) => {
        if (b._score !== a._score) return b._score - a._score;
        return compareByValue(a, b);
      });

      // Limpiamos variables temporales
      items = scoredItems.map(({ _score, _matched, _isMainNoun, _matchesFirstKeyword, _hasAllNumericKeywords, _itemName, _fuzzy, _storeTrust, _offCategory, _offUnit, ...rest }) => rest);
    } else {
      items = items.sort((a, b) => a.price - b.price);
    }
    // ───────────────────────────────────────────────────────────────

    // Aplicar límite
    if (limit && !isNaN(limit)) {
      items = items.slice(0, parseInt(limit));
    }

    // Entity resolution: agrupar los listados que son el MISMO producto en
    // distintas tiendas, para poder mostrar "desde $X en N tiendas" en vez de
    // repetir la misma fila. Se agrupa DESPUÉS de ordenar y limitar, así el
    // orden por relevancia manda y sólo se colapsa lo que se iba a mostrar.
    const groups = groupProducts(items);

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
    // `items` se mantiene por compatibilidad; `groups` es la vista de
    // comparador (un producto = una fila, con sus ofertas por tienda).
    res.json({
      query, items, groups, stats, stores: storeNames,
      // La UI lo usa para explicar por qué los nombres no coinciden con lo
      // buscado, y para distinguir "no hay stock" de "escribiste mal".
      substitutes: usoRespaldoDeTienda,
      storesSearched: SCRAPE_STORES.filter(
        (st) => !category || st.categories.includes(category)
      ).length,
    });
  } catch (err) {
    console.error("Prices search error:", err.message);
    res.status(500).json({ error: "Error al buscar precios" });
  }
});

module.exports = router;
