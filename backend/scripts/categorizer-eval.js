/**
 * Que tan bien categoriza. Correr ANTES y DESPUES de tocar las reglas.
 *
 *   node scripts/categorizer-eval.js
 *
 * Sin linea base no se puede saber si un cambio mejora o empeora — este repo ya
 * tiene tres mecanismos que sonaban bien y fallaron al medirlos. Si algun dia
 * esto pasa de regex a un modelo entrenado, ESTA es la comparacion que decide,
 * no la intuicion de que "un modelo tiene que andar mejor".
 *
 * Separa los dos errores porque no cuestan lo mismo:
 *   - caer en 'Otros': el movimiento desaparece de la torta y del presupuesto.
 *   - categoria equivocada: peor, porque suma en el lugar incorrecto y el
 *     usuario ve un numero que parece bien y no lo es.
 *
 * Sale distinto de cero si falla alguno.
 */
const { categorize, CATEGORIES } = require('../services/categorizer');
const CASOS = require('./categorizer-cases');

const fallas = [];
let ok = 0;
for (const [desc, esperada, nota] of CASOS) {
  const real = categorize(desc);
  if (real === esperada) { ok++; continue; }
  fallas.push({ desc, esperada, real, nota, tipo: real === 'Otros' ? 'sin_categoria' : 'errada' });
}

const total = CASOS.length;
const sinCat = fallas.filter((f) => f.tipo === 'sin_categoria');
const erradas = fallas.filter((f) => f.tipo === 'errada');
const pct = (n) => `${((n / total) * 100).toFixed(1)}%`.padStart(6);

console.log(`\nCategorizador — ${total} casos etiquetados a mano\n`);
console.log(`  exactitud             ${pct(ok)}  (${ok}/${total})`);
console.log(`  cayeron en Otros      ${pct(sinCat.length)}  (${sinCat.length})  <- queda fuera de la torta`);
console.log(`  categoria equivocada  ${pct(erradas.length)}  (${erradas.length})  <- peor: suma en el lugar que no es`);

// Una categoria que ninguna regla puede producir es una opcion muerta.
const producibles = new Set(CASOS.map(([d]) => categorize(d)));
const muertas = CATEGORIES.filter((c) => c !== 'Otros' && !producibles.has(c));
if (muertas.length) console.log(`\n  categorias que ningun caso alcanza: ${muertas.join(', ')}`);

for (const [titulo, lista] of [['CATEGORIA EQUIVOCADA', erradas], ['SIN CATEGORIA', sinCat]]) {
  if (!lista.length) continue;
  console.log(`\n  ${titulo}`);
  for (const f of lista) {
    console.log(`    "${f.desc}"`);
    console.log(`       esperaba ${f.esperada}, dio ${f.real}${f.nota ? `  — ${f.nota}` : ''}`);
  }
}

console.log(`\n${fallas.length === 0 ? 'TODO OK' : `${fallas.length} casos fallan`}\n`);
process.exit(fallas.length === 0 ? 0 : 1);
