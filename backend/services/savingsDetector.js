/**
 * ¿Cuál de estos movimientos del banco es un ahorro?
 *
 * Hoy "Ahorrar" es escribir un número: no prueba que la plata se haya movido.
 * Lo que distingue a esta app de un tracker de metas es que el resumen ya está
 * cargado, así que la transferencia al ahorro YA ESTÁ ahí; sólo falta señalarla.
 *
 * EL PROBLEMA, DICHO DERECHO: desde el resumen no se puede saber si una
 * transferencia va a tu propia caja de ahorro o a un amigo. El banco no dice a
 * dónde fue. Cualquier regla sobre el texto es una conjetura, y este proyecto
 * ya tiene tres mecanismos anotados que sonaban bien y fallaron al medirlos
 * (el minero PPMI, la regla del ancla, el léxico de categorías).
 *
 * Por eso esto NO decide: propone, y el usuario confirma. Un falso positivo
 * cuesta un "no" — no un número equivocado en pantalla. Esa es toda la
 * diferencia con las reglas de matching, que cambiaban resultados en silencio.
 *
 * La elegibilidad usa evidencia NEGATIVA, que es la única que tenemos medida:
 * el categorizador ya reconoce compras (Supermercado, Restaurantes, Transporte,
 * Salud, Streaming…). Todo eso se descarta. Lo que queda es "no sabemos qué es"
 * — y un ahorro está necesariamente ahí adentro. Es al revés de adivinar qué
 * palabras significan ahorro.
 *
 * NO SE FILTRA POR ORIGEN, y esto estuvo mal al principio. La primera versión
 * exigía `source = 'ocr'` — "lo dijo el banco, no el usuario" — y dejaba afuera
 * exactamente el caso más claro que existe: alguien carga un movimiento a mano,
 * le pone categoría Ahorro, y la pantalla de metas no se entera. Reportado así.
 * Una etiqueta que la persona eligió no es ruido: es una DECLARACIÓN, más fuerte
 * que cualquier regex sobre la descripción del banco, que apenas es una
 * inferencia. El ruido lo corta el piso de un motivo, no el origen del dato.
 *
 * El vocabulario de transferencia sólo ORDENA, nunca filtra. Misma regla que
 * el buscador: "elegible es matchear los tokens requeridos; el score sólo
 * ordena". Si el texto no dice nada, el movimiento sigue estando en la lista,
 * más abajo.
 */

// Categorías que el categorizador reconoció como GASTO. Si acertó, no es un
// ahorro; si no acertó, el movimiento cae en Otros y sigue siendo candidato.
const CATEGORIAS_DE_GASTO = [
  'Supermercado', 'Restaurantes', 'Transporte', 'Servicios', 'Salud',
  'Streaming', 'Deporte', 'Entretenimiento', 'Ropa', 'Educación',
  'Seguros', 'Vivienda', 'Préstamos',
];

// Sólo para ordenar. Ninguna de estas palabras es condición de nada.
const PISTAS = [
  { re: /ahorr/i,                      motivo: 'dice ahorro',           puntos: 3 },
  { re: /caja de ahorro|plazo fijo/i,  motivo: 'cuenta de ahorro',      puntos: 3 },
  { re: /transf|trf\b|tra\.? a cta/i,  motivo: 'es una transferencia',  puntos: 2 },
  { re: /inversi[oó]n|fondo/i,         motivo: 'inversión',             puntos: 2 },
];

const DIAS = 90;
const MONTO_MINIMO = 100;   // debajo de esto no es un ahorro, es un café

/**
 * Un monto redondo es evidencia real, no vocabulario: una compra da 1.347,20 y
 * una transferencia al ahorro la elige una persona, así que da 1.000 o 5.000.
 * Débil por sí sola — por eso suma poco y nunca filtra.
 */
function esRedondo(monto) {
  if (monto % 1000 === 0) return { motivo: 'monto redondo', puntos: 2 };
  if (monto % 500  === 0) return { motivo: 'monto redondo', puntos: 1 };
  return null;
}

function puntuar(tx) {
  const motivos = [];
  let puntos = 0;
  // Si la persona ETIQUETO el movimiento como Ahorro, ya dijo lo que es. Eso
  // vale mas que cualquier regex sobre la descripcion del banco, que es una
  // inferencia: esto es una declaracion.
  if (tx.category === 'Ahorro') { motivos.push('lo marcaste como ahorro'); puntos += 4; }
  for (const p of PISTAS) {
    if (p.re.test(tx.description || '')) { motivos.push(p.motivo); puntos += p.puntos; }
  }
  const redondo = esRedondo(Math.abs(parseFloat(tx.amount)));
  if (redondo) { motivos.push(redondo.motivo); puntos += redondo.puntos; }
  return { puntos, motivos };
}

/**
 * Candidatos a acreditar, del más probable al menos. `limite` acota la lista
 * mostrada, no el criterio: pedir 5 no cambia cuáles son elegibles.
 */
async function candidatosDeAhorro(db, userId, limite = 8) {
  const { rows } = await db.query(
    `SELECT id, date, description, amount, amount_uyu, currency, category
     FROM transactions
     WHERE user_id = $1
       AND type = 'debit'
       AND goal_id IS NULL                       -- no acreditado todavía
       AND ABS(amount_uyu) >= $2   -- el minimo esta en pesos
       AND date >= CURRENT_DATE - INTERVAL '${DIAS} days'
       AND (category IS NULL OR category <> ALL($3::text[]))
     ORDER BY date DESC
     LIMIT 200`,
    [userId, MONTO_MINIMO, CATEGORIAS_DE_GASTO],
  );

  return rows
    .map((tx) => ({ ...tx, amount: Math.abs(parseFloat(tx.amount)), ...puntuar(tx) }))
    // SIN NINGUN MOTIVO NO ES UNA SUGERENCIA, ES UN MOVIMIENTO AL AZAR. La
    // elegibilidad por evidencia negativa deja pasar todo lo que el
    // categorizador no reconocio, y con datos reales eso es mucho: una compra
    // en "MONTEVIDEO" de $195 aparecia ofrecida como posible ahorro, sin una
    // sola linea que dijera por que. La tarjeta promete explicar cada fila; una
    // fila sin explicacion la contradice, y ensucia las que si tienen.
    .filter((c) => c.puntos > 0)
    // Empate de puntos: primero el más reciente. Un movimiento de ayer es más
    // fácil de reconocer para el usuario que uno de hace dos meses.
    .sort((a, b) => b.puntos - a.puntos || new Date(b.date) - new Date(a.date))
    .slice(0, limite);
}

module.exports = { candidatosDeAhorro, CATEGORIAS_DE_GASTO, __testing: { puntuar, esRedondo } };
