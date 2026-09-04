/**
 * Auditoría sin etiquetas: busca fallas que NO están previstas en los casos.
 *
 *   node scripts/audit-disagreement.js [categoria]
 *
 * El problema con precision-cases.js es que sólo encuentra lo que alguien ya
 * pensó en afirmar. Todos los bugs importantes de este proyecto los encontró
 * el usuario probando a mano, no la batería. Esto intenta cubrir ese hueco
 * buscando señales de que algo anda mal SIN saber cuál es la respuesta
 * correcta:
 *
 *  1. DESACUERDO — el buscador y el comparador son dos políticas de ranking
 *     independientes sobre los mismos datos. Si para la misma búsqueda el
 *     primero del buscador y el "más barato" del carrito son productos
 *     distintos, es muy probable que uno de los dos esté equivocado. Es la
 *     señal más fuerte y no necesita ninguna etiqueta.
 *  2. PRECIO INCOHERENTE — el más barato muy por debajo de la mediana del
 *     resto suele ser un producto que no corresponde (un accesorio, un
 *     placeholder roto, otra categoría).
 *  3. SOLAPAMIENTO POBRE — el resultado principal comparte pocas palabras
 *     con lo buscado más allá de los tokens exigidos.
 *  4. DISPERSIÓN — un set de resultados donde el más caro es un múltiplo
 *     enorme del más barato mezcla cosas distintas.
 *
 * Cada hallazgo es una SOSPECHA para revisar a mano, no un fallo. El valor
 * está en ordenar por sospecha y mirar las primeras.
 */

const path = require('path');
const express = require('express');
const axios = require('axios');

const authPath = path.resolve(__dirname, '../middleware/auth.js');
require.cache[require.resolve(authPath)] = {
  id: authPath, filename: authPath, loaded: true,
  exports: (req, _res, next) => { req.userId = 'audit'; next(); },
};
const premPath = path.resolve(__dirname, '../middleware/requirePremium.js');
require.cache[require.resolve(premPath)] = {
  id: premPath, filename: premPath, loaded: true,
  exports: (_req, _res, next) => next(),
};
const dbPath = path.resolve(__dirname, '../db/index.js');
require.cache[require.resolve(dbPath)] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { query: async () => ({ rows: [] }), pool: {} },
};

const { scrapeItem } = require('../routes/shopping.js').__testing;
const { tokenize, normalize } = require('../services/productMatcher');

// Consultas de exploración: cosas que un uruguayo busca y que NO están todas
// en precision-cases.js. El punto es salir del set conocido.
const QUERIES = [
  ['supermercado', ['leche', 'pan', 'arroz', 'aceite', 'yerba', 'cafe', 'azucar', 'sal',
    'fideos', 'huevos', 'manteca', 'queso', 'jamon', 'pollo', 'carne picada', 'milanesas',
    'papas fritas', 'galletitas', 'yogur', 'dulce de leche', 'mayonesa', 'ketchup',
    'atun', 'arvejas', 'lentejas', 'polenta', 'pure de tomate', 'vinagre', 'aceitunas',
    'agua mineral', 'refresco', 'cerveza', 'vino tinto', 'jugo', 'helado',
    'papel higienico', 'servilletas', 'detergente', 'lavandina', 'jabon en polvo',
    'esponja', 'bolsas de residuo', 'panales', 'toallitas humedas', 'shampoo bebe',
    'sal gruesa', 'pimienta', 'oregano', 'caldo', 'sopa', 'gelatina', 'flan',
    'budin', 'bizcochos', 'facturas', 'tortas fritas', 'pan rallado', 'levadura',
    'crema de leche', 'queso rallado', 'ricota', 'dulce de membrillo', 'miel',
    'te', 'mate cocido', 'edulcorante', 'agua tonica', 'soda', 'cerveza sin alcohol',
    'papas fritas paquete', 'mani', 'chicles', 'caramelos', 'chocolate en barra']],
  ['farmacia', ['dipirona', 'buscapina', 'sertal', 'antiacido', 'laxante', 'colirio',
    'gotas para los ojos', 'crema para hongos', 'pomada', 'alcohol etilico',
    'paracetamol', 'ibuprofeno', 'aspirina', 'omeprazol', 'loratadina',
    'alcohol en gel', 'agua oxigenada', 'gasas', 'curitas', 'termometro',
    'protector solar', 'repelente', 'vitamina c', 'suero fisiologico', 'ibupirac']],
  ['belleza', ['shampoo', 'acondicionador', 'crema corporal', 'desodorante', 'perfume',
    'jabon de tocador', 'pasta dental', 'enjuague bucal', 'maquinita de afeitar',
    'espuma de afeitar', 'algodon', 'esmalte', 'labial', 'protector labial']],
  ['ropa', ['remera', 'campera', 'pantalon', 'buzo', 'short', 'vestido', 'camisa', 'medias',
    'sweater', 'chomba', 'calza', 'top', 'saco', 'chaleco', 'pijama', 'bata']],
  ['hogar', ['heladera', 'lavarropas', 'microondas', 'aire acondicionado', 'ventilador',
    'licuadora', 'cafetera', 'freidora de aire', 'aspiradora', 'plancha', 'tostadora',
    'smart tv', 'notebook', 'monitor', 'impresora', 'tablet', 'celular', 'auriculares',
    'parlante', 'camara de seguridad', 'estufa', 'calefactor', 'colchon', 'sillon',
    'mesa', 'escritorio', 'ropero', 'placard', 'espejo', 'cortina', 'almohada',
    'sabanas', 'acolchado', 'toallas', 'olla', 'sarten', 'juego de ollas',
    'cubiertos', 'vajilla', 'vaso', 'termo', 'mate', 'bombilla', 'garrafa',
    'taladro', 'escalera', 'extension', 'zapatilla electrica', 'lampara', 'foco led']],
];

const median = (a) => {
  if (a.length === 0) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const overlap = (qTokens, name) => {
  const n = normalize(name);
  const nTokens = new Set(tokenize(name));
  const hit = qTokens.filter((t) => nTokens.has(t) || n.includes(t)).length;
  return qTokens.length ? hit / qTokens.length : 1;
};

(async () => {
  const app = express();
  app.use('/api/prices', require('../routes/prices.js'));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/prices/search`;

  const catFilter = process.argv[2];
  const plan = QUERIES.filter(([c]) => !catFilter || c === catFilter);
  const total = plan.reduce((s, [, qs]) => s + qs.length, 0);
  const orig = console.log;
  console.log = (...a) => {
    const s = String(a[0] || '');
    if (s.startsWith('[scraper]') || s.startsWith('[prices]') || s.startsWith('[shopping') || s.startsWith('[exchange')) return;
    orig(...a);
  };
  orig(`\nAuditando ${total} búsquedas exploratorias…\n`);

  const hallazgos = [];
  for (const [cat, queries] of plan) {
    for (const q of queries) {
      const qTokens = tokenize(q);
      let items = [], cart = null;
      try {
        const r = await axios.get(base, { params: { q, category: cat, limit: 20 }, timeout: 90000 });
        items = r.data.items || [];
      } catch (e) { /* se reporta como sin resultados */ }
      try { cart = await scrapeItem({ name: q, quantity: 1, id: 0 }, cat); } catch (e) { /* idem */ }

      const top = items[0];
      const cheap = cart && cart.cheapest;
      const sospechas = [];

      if (!top && !cheap) { sospechas.push('SIN RESULTADOS en ambas rutas'); }

      // 1. Desacuerdo entre las dos rutas
      if (top && cheap) {
        const ov = overlap(tokenize(top.name), cheap.name);
        if (ov < 0.34) {
          sospechas.push(`DESACUERDO buscador="${top.name.slice(0, 42)}" vs carrito="${cheap.name.slice(0, 42)}"`);
        }
      }

      // 2. El más barato muy por debajo del resto
      const precios = items.map((i) => i.price).filter((p) => p > 0);
      if (precios.length >= 4) {
        const med = median(precios);
        const min = Math.min(...precios);
        if (min < med * 0.12) {
          const barato = items.find((i) => i.price === min);
          sospechas.push(`PRECIO ATÍPICO $${min} vs mediana $${med} → "${(barato ? barato.name : '').slice(0, 44)}"`);
        }
        // 4. Dispersión enorme
        const max = Math.max(...precios);
        if (max > min * 200) sospechas.push(`DISPERSIÓN $${min} … $${max}`);
      }

      // 3. Solapamiento pobre del principal
      if (top && overlap(qTokens, top.name) < 0.5) {
        sospechas.push(`SOLAPAMIENTO POBRE top="${top.name.slice(0, 46)}"`);
      }

      if (sospechas.length) hallazgos.push({ cat, q, sospechas });
      orig(`${sospechas.length ? '⚠' : '·'} ${cat.padEnd(13)} ${q.padEnd(22)} ${String(items.length).padStart(2)} buscador / ${String(Object.keys((cart && cart.byStore) || {}).length).padStart(2)} carrito`);
      sospechas.forEach((s) => orig(`    ${s}`));
    }
  }

  orig('\n' + '═'.repeat(64));
  orig(`${hallazgos.length} búsquedas con sospechas, de ${total}`);
  const porTipo = {};
  hallazgos.forEach((h) => h.sospechas.forEach((s) => {
    const k = s.split(' ')[0];
    porTipo[k] = (porTipo[k] || 0) + 1;
  }));
  Object.entries(porTipo).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => orig(`  ${String(v).padStart(3)}  ${k}`));
  orig('═'.repeat(64));
  server.close();
})();
