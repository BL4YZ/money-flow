/**
 * El tema claro: ¿se lee, y está completo?
 *
 *   cd frontend && node scripts/verify-tema.js
 *
 * DOS COSAS QUE NO SE VEN MIRANDO UNA CAPTURA:
 *
 * 1. CONTRASTE. Un tema claro hecho a ojo termina con el texto secundario gris
 *    claro sobre blanco: se ve bien en el monitor del que lo hizo y desaparece
 *    al sol. Se miden los mismos pares en los DOS temas, porque un token que
 *    quedó bien en oscuro puede no tener equivalente legible en claro.
 *
 * 2. QUE NO FALTE NI SOBRE UN TOKEN. Los componentes piden `COLORS.loQueSea` sin
 *    saber qué tema está puesto; si la paleta clara no define uno, el valor es
 *    `undefined` y React Native lo ignora en silencio — un texto sin color, o
 *    un fondo transparente, sin ningún error. Por eso se comparan las claves.
 *
 * Y el chequeo estructural: que no quede ningún `StyleSheet.create` suelto a
 * nivel de módulo, porque ESE es el que congela los colores del arranque y hace
 * que el cambio de tema no repinte nada.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', 'src');

let fallas = 0;
const chequeo = (etiqueta, ok, detalle = '') => {
  if (!ok) fallas++;
  console.log(`   ${ok ? 'ok   ' : 'FALLA'} ${etiqueta.padEnd(46)} ${detalle}`);
};

// ── Color ────────────────────────────────────────────────────────────
const aRgb = (c) => {
  const hex = c.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = c.match(/^rgba?\(([^)]+)\)$/);
  if (rgba) {
    const p = rgba[1].split(',').map((v) => parseFloat(v));
    return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]];
  }
  return null;
};
const sobre = (frente, fondo) => {
  const f = aRgb(frente); const b = aRgb(fondo);
  const a = f[3] === undefined ? 1 : f[3];
  return [0, 1, 2].map((i) => Math.round(a * f[i] + (1 - a) * b[i]));
};
const luminancia = (c) => {
  const s = c.slice(0, 3).map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
};
const contraste = (frente, fondo, base) => {
  const f = luminancia(sobre(frente, base || fondo));
  const b = luminancia(sobre(fondo, base || fondo));
  const [hi, lo] = f > b ? [f, b] : [b, f];
  return (hi + 0.05) / (lo + 0.05);
};

// ── Las paletas, leídas del archivo ──────────────────────────────────
//
// No se puede `require` theme.js desde Node (importa react-native), así que se
// leen los literales. Es feo y es a propósito: la alternativa es duplicar la
// paleta acá, y una copia se desactualiza el día que alguien toque un color.
const fuente = fs.readFileSync(path.join(SRC, 'theme.js'), 'utf8');
const leerPaleta = (nombre) => {
  const i = fuente.indexOf(`const ${nombre} = {`);
  const j = fuente.indexOf('\n};', i);
  const cuerpo = fuente.slice(i, j);
  const paleta = {};
  for (const m of cuerpo.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*):\s*'([^']+)'/gm)) {
    paleta[m[1]] = m[2];
  }
  return paleta;
};

const OSCURO = leerPaleta('OSCURO');
const CLARO = leerPaleta('CLARO');

console.log('\nLas dos paletas dicen lo mismo\n');
const faltanEnClaro = Object.keys(OSCURO).filter((k) => !(k in CLARO));
const sobranEnClaro = Object.keys(CLARO).filter((k) => !(k in OSCURO));
chequeo('la clara define todos los tokens', faltanEnClaro.length === 0,
  faltanEnClaro.length ? `faltan: ${faltanEnClaro.join(', ')}` : `${Object.keys(OSCURO).length} tokens`);
chequeo('y no inventa ninguno de más', sobranEnClaro.length === 0,
  sobranEnClaro.join(', ') || 'ninguno');

// ── Los pares que se leen ────────────────────────────────────────────
//
// 4.5 es el mínimo de la WCAG para texto normal; 3.0 para texto grande, iconos
// y bordes. Se pide lo que corresponde a cada uno en vez de un número único.
const TEXTO = 4.5;
const FORMA = 3.0;

const PARES = [
  ['texto principal sobre el fondo',   'textHigh', 'bg',            TEXTO],
  ['texto principal sobre una card',   'textHigh', 'surface',       TEXTO],
  ['texto secundario sobre una card',  'textMid',  'surface',       TEXTO],
  ['texto terciario sobre una card',   'textLow',  'surface',       FORMA],
  ['texto sobre superficie hundida',   'textMid',  'surfaceSunken', TEXTO],
  ['un ingreso sobre una card',        'income',   'surface',       TEXTO],
  ['un gasto sobre una card',          'expense',  'surface',       TEXTO],
  ['el acento sobre una card',         'accent',   'surface',       FORMA],
  ['éxito sobre una card',             'success',  'surface',       FORMA],
  ['aviso sobre una card',             'warning',  'surface',       FORMA],
  ['error sobre una card',             'error',    'surface',       FORMA],
  ['premium sobre una card',           'premium',  'surface',       FORMA],
  ['texto del botón primario',         'onPrimary', 'primary',      TEXTO],
  ['texto sobre el dorado',            'onPremium', 'premium',      TEXTO],
  ['borde sobre el fondo',             'border',   'bg',            1.2],
];

for (const [nombre, paleta] of [['OSCURO', OSCURO], ['CLARO', CLARO]]) {
  console.log(`\nTema ${nombre.toLowerCase()}: ¿se lee?\n`);
  for (const [etiqueta, frente, fondo, minimo] of PARES) {
    const r = contraste(paleta[frente], paleta[fondo], paleta.bg);
    chequeo(etiqueta, r >= minimo, `${r.toFixed(2)} (mínimo ${minimo})`);
  }
  // El botón flotante es vidrio teñido: lo que importa no es el token sino lo
  // que COMPONE sobre el fondo, que es contra lo que se lee el icono.
  const compuesto = sobre(paleta.glassAction, paleta.bg);
  const iconoFab = luminancia(sobre(paleta.onPrimary, paleta.bg)) > luminancia(compuesto)
    ? paleta.onPrimary : paleta.onPrimary;
  const r = (() => {
    const a = luminancia(sobre(iconoFab, paleta.bg));
    const b = luminancia(compuesto);
    const [hi, lo] = a > b ? [a, b] : [b, a];
    return (hi + 0.05) / (lo + 0.05);
  })();
  chequeo('el + del botón flotante sobre su vidrio', r >= FORMA, `${r.toFixed(2)} (mínimo ${FORMA})`);
}

// ── Lo estructural ───────────────────────────────────────────────────
console.log('\nNada se quedó con los colores del arranque\n');
const archivos = [];
(function recorrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(p);
    else if (e.name.endsWith('.js')) archivos.push(p);
  }
})(SRC);

const sueltos = archivos.filter((p) => /^const \w+ = StyleSheet\.create\(/m.test(fs.readFileSync(p, 'utf8')));
chequeo('ningún StyleSheet a nivel de módulo', sueltos.length === 0,
  sueltos.map((p) => path.relative(SRC, p)).join(', ') || 'todos pasan por estilos()');

const sinImport = archivos.filter((p) => {
  const s = fs.readFileSync(p, 'utf8');
  return s.includes('estilos(() => StyleSheet.create(') && !/import \{[^}]*\bestilos\b/s.test(s);
});
chequeo('y todos importan estilos()', sinImport.length === 0,
  sinImport.map((p) => path.relative(SRC, p)).join(', ') || 'sí');

console.log(`\n${fallas === 0
  ? 'TODO OK: los dos temas se leen, y ningún color quedó congelado'
  : `${fallas} chequeos fallaron`}`);
process.exit(fallas === 0 ? 0 : 1);
