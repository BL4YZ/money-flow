/**
 * A qué categoría pertenece un movimiento del banco.
 *
 * ESTE ES EL ÚNICO CATEGORIZADOR. Había dos, y no coincidían: `routes/
 * transactions.js` llevaba su propia copia de 9 reglas mientras el upload usaba
 * estas 15, y no sólo tenían distinta cobertura sino **distinto vocabulario de
 * salida** — un PedidosYa cargado a mano quedaba en `Comida` y el mismo
 * PedidosYa importado del resumen quedaba en `Restaurantes`, o sea dos porciones
 * distintas de la misma torta. El sueldo caía en `Ingreso` por un lado y en
 * `Salario` por el otro. La copia de la ruta además estaba escrita sin acentos,
 * así que `/medica/` no matcheaba nunca "Médica".
 *
 * Nadie lo había visto porque `theme.js` tenía color para los cuatro nombres:
 * la duplicación se veía prolija en pantalla.
 *
 * Es el mismo error que este repo ya registra para el matching — "eran dos
 * copias independientes y cada bug había que arreglarlo dos veces". Si necesitás
 * categorizar en otro lado, importá de acá; no escribas otra lista.
 *
 * El ORDEN ES SIGNIFICATIVO: gana la primera regla que matchea. Las marcas van
 * antes que las palabras genéricas, porque "PAGO CUOTA GIMNASIO" es Deporte y no
 * Préstamos, y "COMPRA CREDITO DISCO" es Supermercado y no Préstamos.
 */
const RULES = [
  { pattern: /netflix|spotify|disney[\s+]|hbo|amazon prime|apple tv|youtube premium|paramount|star\+|tidal|deezer/i, category: 'Streaming' },
  { pattern: /supermercado|disco|devoto|g[eé]ant|tienda inglesa|walmart|ta-ta|ta ta|multiahorro|el dorado/i, category: 'Supermercado' },
  // "osse" con dos eses no existe: el ente es OSE. La factura de agua sólo
  // entraba cuando decía "saneamiento". Y "agua" suelto era demasiado amplio —
  // se comía cualquier compra de agua mineral, que es un producto, no un
  // servicio. Medido: "AGUA MINERAL SALUS 2L" caía en Servicios.
  { pattern: /ute\b|antel|\bose\b|saneamiento|abl\b|agua corriente|luz\b|gas\b/i, category: 'Servicios' },
  // ANCAP es combustible, no un servicio público: estaba en la regla de arriba
  // junto a UTE, así que una carga de nafta se contaba como Servicios.
  //
  // Va DESPUÉS de los servicios a propósito, y eso resuelve los dos casos con
  // una sola regla: "ANCAP SUPERGAS" es la garrafa de la cocina y la agarra
  // `gas\b` como Servicios, mientras "ANCAP LAGOMAR" cae acá como Transporte.
  { pattern: /ancap|axion|petrobras|disa\b|nafta|combustible|estaci[oó]n de servicio/i, category: 'Transporte' },
  // CUTCSA lleva C y S: `cut[cs]a` matchea "cutca" y "cutsa", que no existen,
  // así que la principal empresa de ómnibus de Montevideo nunca entró.
  { pattern: /uber|cabify|bolt|taxi|cutcsa|omnibus|bus\b|peaje|acv\b/i, category: 'Transporte' },
  // Farmashop es la cadena de farmacias más grande del país y faltaba.
  { pattern: /farmashop|farmacia|m[eé]dica|hospital|cl[ií]nica|doctor|mutualista|fonasa|smi\b|cam\b/i, category: 'Salud' },
  // El resumen lo escribe junto y separado; el detector de suscripciones ya
  // contemplaba las dos formas y éste no.
  { pattern: /restaurant|delivery|pedidos\s?ya|rappi|pizza|burger|mcdonald|kfc|burger king|sushi|grill/i, category: 'Restaurantes' },
  { pattern: /gym|gimnasio|smart ?fit|megatlon|bodytech/i, category: 'Deporte' },
  { pattern: /cine|teatro|cinema|entretenimiento/i, category: 'Entretenimiento' },
  { pattern: /salario|sueldo|haberes|remuneraci[oó]n/i, category: 'Salario' },
  { pattern: /transfer|dep[oó]sito|ingreso/i, category: 'Transferencia' },
  { pattern: /alquiler|arrendamiento|renta\b/i, category: 'Vivienda' },
  { pattern: /cuota|pr[eé]stamo|hipoteca|cr[eé]dito/i, category: 'Préstamos' },
  { pattern: /ropa|zapatillas|calzado|vestuario|zara|h&m|koaj/i, category: 'Ropa' },
  { pattern: /educaci[oó]n|colegio|universidad|curso|capacitaci[oó]n/i, category: 'Educación' },
  { pattern: /seguro|p[oó]liza/i, category: 'Seguros' },
];

// El vocabulario canónico. Lo que no matchea cae en 'Otros', y el usuario puede
// corregirlo desde la app — esas correcciones son las únicas etiquetas reales
// que va a haber si algún día esto deja de ser regex.
const CATEGORIES = [
  'Salario', 'Transferencia', 'Supermercado', 'Restaurantes', 'Transporte',
  'Servicios', 'Salud', 'Streaming', 'Deporte', 'Entretenimiento', 'Ropa',
  'Educación', 'Vivienda', 'Préstamos', 'Seguros', 'Otros',
];

// Nombres que emitía la copia vieja. Se conservan para poder reparar los datos
// que ya están guardados; no los emite nadie más.
const ALIAS = { Comida: 'Restaurantes', Ingreso: 'Salario' };

function categorize(description) {
  for (const rule of RULES) {
    if (rule.pattern.test(description)) return rule.category;
  }
  return 'Otros';
}

// Normaliza un nombre guardado al vocabulario canónico.
const canonical = (category) => ALIAS[category] || category;

module.exports = { categorize, canonical, CATEGORIES, ALIAS, RULES };
