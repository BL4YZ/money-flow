/**
 * Batería de relevancia: corre ~50 búsquedas reales (las más buscadas en
 * Uruguay por categoría) contra los datos EN VIVO de las tiendas y escribe
 * un resumen determinístico a un archivo, para diffear antes/después de
 * tocar el algoritmo de matching.
 *
 * Uso:
 *   node scripts/relevance-battery.js salida.txt
 *
 * IMPORTANTE al comparar: los datos son en vivo y varían solos entre
 * corridas (~18 líneas de ruido típico: productos de precio casi idéntico
 * rotando entre tiendas). Antes de atribuirle un diff a tu cambio, corré la
 * batería DOS VECES con el mismo código y medí ese piso de ruido.
 */
const path = require('path');

// Auth/premium mockeados: sólo nos interesa el pipeline de matching.
const authPath = path.resolve(__dirname, '../middleware/auth.js');
require.cache[require.resolve(authPath)] = {
  id: authPath, filename: authPath, loaded: true,
  exports: (req, res, next) => { req.userId = 'battery'; next(); },
};
const premiumPath = path.resolve(__dirname, '../middleware/requirePremium.js');
require.cache[require.resolve(premiumPath)] = {
  id: premiumPath, filename: premiumPath, loaded: true,
  exports: (req, res, next) => next(),
};

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const pricesRoute = require('../routes/prices.js');

const app = express();
app.use(express.json());
app.use('/api/prices', pricesRoute);

const QUERIES = [
  ['leche', 'supermercado'], ['pan lactal', 'supermercado'], ['coca cola', 'supermercado'],
  ['yerba', 'supermercado'], ['aceite de girasol', 'supermercado'], ['papel higienico', 'supermercado'],
  ['pañales', 'supermercado'], ['cerveza', 'supermercado'], ['arroz', 'supermercado'],
  ['fideos', 'supermercado'], ['coca cola 2 litros', 'supermercado'], ['leche 1l', 'supermercado'],
  ['paracetamol', 'farmacia'], ['protector solar', 'farmacia'], ['alcohol en gel', 'farmacia'],
  ['vitamina c', 'farmacia'],
  ['shampoo anticaspa', 'belleza'], ['perfume', 'belleza'], ['crema facial', 'belleza'],
  ['desodorante', 'belleza'],
  ['remera', 'ropa'], ['campera', 'ropa'], ['zapatillas nike', 'ropa'],
  ['iphone 16', 'hogar'], ['iphone 13', 'hogar'], ['samsung galaxy s24', 'hogar'],
  ['playstation 5', 'hogar'], ['ps5', 'hogar'], ['xbox series x', 'hogar'],
  ['nintendo switch 2', 'hogar'], ['nintendo switch', 'hogar'], ['smart tv 55', 'hogar'],
  ['notebook hp', 'hogar'], ['notebook i5', 'hogar'], ['notebook i7', 'hogar'],
  ['auriculares bluetooth', 'hogar'], ['parlante bluetooth', 'hogar'],
  ['aire acondicionado', 'hogar'], ['freidora de aire', 'hogar'], ['microondas', 'hogar'],
  ['lavarropas', 'hogar'], ['aspiradora robot', 'hogar'], ['cafetera', 'hogar'],
  ['plancha de pelo', 'hogar'], ['ventilador', 'hogar'], ['tablet samsung', 'hogar'],
  ['apple watch', 'hogar'], ['airpods', 'hogar'], ['monitor gamer', 'hogar'],
  ['heladera', 'hogar'], ['televisor', 'hogar'],
];

const outFile = process.argv[2] || 'battery-output.txt';

const server = app.listen(0, async () => {
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/api/prices`;
  const lines = [];

  for (const [q, cat] of QUERIES) {
    try {
      const { data } = await axios.get(base + '/search', {
        params: { q, category: cat, limit: 8 }, timeout: 40000,
      });
      const items = data.items || [];
      lines.push(`=== "${q}" [${cat}] — ${items.length} resultados ===`);
      items.forEach((i) => {
        const unit = i.unitPrice ? ` | ${Math.round(i.unitPrice)}/${i.unitLabel}` : '';
        lines.push(`  ${i.store} | ${i.name} | ${Math.round(i.price)}${unit}`);
      });
    } catch (err) {
      lines.push(`=== "${q}" [${cat}] — ERROR: ${err.message} ===`);
    }
  }

  fs.writeFileSync(outFile, lines.join('\n'), 'utf8');
  console.log('Escrito:', outFile, '—', lines.length, 'líneas');
  server.close();
});
