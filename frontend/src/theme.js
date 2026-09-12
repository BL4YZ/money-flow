// MoneyFlow — theme.js
// Rediseño v1 (handoff design/design_handoff_moneyflow).
//
// REGLA: ningún color hex fuera de este archivo. El estado anterior tenía 66
// hex sueltos en el código contra 41 acá; eso es lo que este rediseño cierra.

const OSCURO = {
  bg: '#121110',
  surface: '#191817',
  surfaceRaised: '#201e1c',
  surfaceSunken: '#292725',
  surfaceOverlay: '#332f2c',

  borderSubtle: '#262421',
  border: '#34302c',

  // ── Vidrio ────────────────────────────────────────────────────────
  // Para la barra de navegación cuando se dibuja sobre el contenido en vez de
  // taparlo. Van con alfa a propósito: lo que se ve detrás es la pantalla.
  //
  // `glassTint` es el velo que le da cuerpo al desenfoque — sin él el vidrio
  // desaparece sobre un fondo oscuro y la barra queda flotando sin borde.
  // `glassEdge` es el brillo del canto superior: es LO que hace que se lea como
  // vidrio y no como una capa translúcida. En el material de Apple ese brillo
  // sale de la luz refractándose en el borde; acá es una línea de un pixel, que
  // es todo lo que se puede hacer sin shaders.
  glassTint: 'rgba(32,30,28,0.45)',
  // MEDIDO, no elegido a ojo: el canto al 0.16 sobre la superficie daba #444240
  // contra un #201e1c — una linea de 1,5px con seis puntos de diferencia, o sea
  // invisible. Al 0.38 da #757472 y recien ahi se lee como un borde iluminado.
  glassEdge: 'rgba(255,255,255,0.38)',
  glassBorder: 'rgba(255,255,255,0.18)',

  // Relleno para controles CHICOS (botones, chips, el riel del toggle). Va mas
  // opaco que `glassTint` porque detras no hay desenfoque: un chip de 30px no
  // muestra blur util y ponerle uno a cada uno de una lista cuesta caro en
  // Android. El vidrio de verdad se reserva para las superficies grandes.
  // El 0.07 daba #232221 sobre el fondo, contra el #201e1c de surfaceRaised: tres
  // puntos por canal. Por eso "no se notaba el cambio" — literalmente no habia
  // cambio. Este es el velo que va ENCIMA del desenfoque, no en lugar de el.
  glassFill: 'rgba(255,255,255,0.14)',
  glassFillPressed: 'rgba(255,255,255,0.24)',
  // El pill de la barra: una zona MAS DENSA del mismo cristal, no una pieza
  // aparte. Es un color con alfa y no un GlassView a proposito — ver la nota en
  // FloatingTabBar sobre por que el material de Apple no se puede trasladar.
  // El vidrio de una ACCION, no de una superficie. El boton flotante de agregar
  // tiene que pertenecer al mismo material que la barra de navegacion y, a la
  // vez, gritar que es un boton — que es justo lo que no hacia el "+" gris de
  // 19px que tenia el encabezado, y por lo que los usuarios no encontraban como
  // cargar un movimiento.
  //
  // La opacidad esta MEDIDA, no elegida a ojo: al 72% el hueso compone #afaca8
  // sobre el fondo de la app, y el icono oscuro encima da 8.34:1 — nitido. Al
  // 45% daba 3.93:1, que es donde un icono empieza a desaparecer. Sigue siendo
  // translucido: se ve pasar el contenido por detras.
  glassAction: 'rgba(236,232,227,0.72)',
  glassPill: 'rgba(255,255,255,0.16)',
  borderStrong: '#46403a',

  // Marca: un primary (hueso) + un accent (turquesa)
  primary: '#ece8e3',        // relleno de botón primario y texto/icono destacado
  primaryPressed: '#cfc9c2', // oscurece al presionar, nunca aclara
  primarySoft: '#2b2825',    // chip activo, pill de tab, botón secundario
  primaryBorder: '#6f675f',
  primaryBorderSoft: '#57504a', // borde de secundario/chip activo/badge de estado
  accent: '#3fd7bd',
  accentSoft: '#132a27',

  premium: '#f0c073',
  premiumSoft: '#2a2216',
  premiumBorder: '#6b5326',

  // Dato: signo del dinero. NUNCA para feedback de UI.
  income: '#5fe0a8',
  expense: '#ff8f7a',
  neutralData: '#a9a29b',

  // Feedback: estado del sistema. NUNCA para montos.
  success: '#46c98f',
  warning: '#e8b25f',
  error: '#e5594a',
  successSoft: '#14251d',
  warningSoft: '#2a2216',
  errorSoft: '#2b1815',
  errorBorder: '#6b2b23',

  textHigh: '#ece8e3',
  textMid: '#a9a29b',
  textLow: '#78716b',
  textDisabled: 'rgba(120,113,107,0.75)',
  onPrimary: '#121110',   // texto sobre botón hueso
  onPremium: '#2a2216',   // texto sobre dorado
  onExpense: '#2b1815',   // texto sobre relleno expense (toggle Egreso)
  scrim: 'rgba(8,7,6,0.72)',
  focusHalo: 'rgba(236,232,227,0.16)',
};

// Solo 3 gradientes en toda la app (expo-linear-gradient)
/**
 * La misma app con la luz prendida.
 *
 * NO ES "INVERTIR LOS HEX". Un tema claro bien hecho cambia de reglas, no de
 * numeros: sobre blanco el gris del texto secundario tiene que ser MAS oscuro
 * que su equivalente oscuro para dar el mismo contraste, los verdes y rojos de
 * dato pierden legibilidad y hay que bajarles la luminosidad, y el vidrio deja
 * de ser un velo blanco para ser uno negro — blanco sobre blanco no es vidrio,
 * es nada. Cada par se midio; ver scripts/verify-contraste.js.
 *
 * Los tokens son los MISMOS nombres: ningun componente sabe que tema esta
 * puesto, y esa es la unica forma de que agregar el tema claro no signifique
 * revisar 34 archivos a ojo.
 */
const CLARO = {
  bg: '#faf8f5',
  surface: '#ffffff',
  surfaceRaised: '#ffffff',
  surfaceSunken: '#f1ede8',
  surfaceOverlay: '#e8e3dc',

  borderSubtle: '#ece7e0',
  border: '#dcd6cd',
  borderStrong: '#bdb5ab',

  // VIDRIO SOBRE CLARO: el velo se da vuelta. En oscuro el cristal se aclara
  // con blanco; sobre blanco eso no existe, asi que el cuerpo lo pone un velo
  // claro y lo que separa la pieza del fondo es el borde, no el relleno.
  glassTint: 'rgba(255,255,255,0.55)',
  glassEdge: 'rgba(255,255,255,0.90)',
  glassBorder: 'rgba(26,25,23,0.12)',
  glassFill: 'rgba(26,25,23,0.06)',
  glassFillPressed: 'rgba(26,25,23,0.12)',
  glassPill: 'rgba(26,25,23,0.08)',
  // Mismo criterio medido que en oscuro, del otro lado: el boton flotante es
  // oscuro sobre fondo claro, asi que el tinte es oscuro y el icono va claro.
  glassAction: 'rgba(30,28,26,0.78)',

  primary: '#1e1c1a',
  primaryPressed: '#0c0b0a',
  primarySoft: '#eceae5',
  primaryBorder: '#9c948a',
  primaryBorderSoft: '#d3ccc3',
  accent: '#0f8f7a',
  accentSoft: '#e2f5f0',

  // Bajado de #9a6b16, que daba 4.39 con su propio texto encima: por debajo
  // del 4.5 de la WCAG. Con #8f6314 da 4.98 y sobre blanco 5.30.
  premium: '#8f6314',
  premiumSoft: '#fbf1dd',
  premiumBorder: '#dcc08f',

  income: '#0d7a4f',
  expense: '#b53a26',
  neutralData: '#6b655d',

  success: '#0f7a52',
  warning: '#94670f',
  error: '#b22d1f',
  successSoft: '#e1f4ea',
  warningSoft: '#fbf0da',
  errorSoft: '#fceae7',
  errorBorder: '#eeb3aa',

  textHigh: '#1a1917',
  textMid: '#544e47',
  textLow: '#7a736b',
  textDisabled: 'rgba(122,115,107,0.6)',
  onPrimary: '#faf8f5',
  onPremium: '#fff7e8',
  onExpense: '#fceae7',
  scrim: 'rgba(26,25,23,0.42)',
  focusHalo: 'rgba(30,28,26,0.14)',
};

const GRADIENTES_OSCURO = {
  premium: ['#f7d79a', '#c9922f'],
  action: ['#ffffff', '#d9d2c9'],
  glow: ['rgba(63,215,189,0.20)', 'rgba(18,17,16,0)'],
  // Fade de scroll detrás de la tab bar flotante (96px, transparent → bg)
  scrollFade: ['rgba(18,17,16,0)', '#121110'],
  // Velo dorado de la card `locked`
  lockedVeil: ['rgba(240,192,115,0.14)', 'rgba(25,24,23,0)'],
};

const GRADIENTES_CLARO = {
  premium: ['#d8a951', '#8f6314'],
  // El boton de accion es oscuro sobre claro: el degrade va del gris al negro.
  action: ['#3a3733', '#141312'],
  glow: ['rgba(15,143,122,0.14)', 'rgba(250,248,245,0)'],
  scrollFade: ['rgba(250,248,245,0)', '#faf8f5'],
  lockedVeil: ['rgba(154,107,22,0.10)', 'rgba(255,255,255,0)'],
};



export const SPACING = { xs: 4, s: 8, m: 16, l: 24, xl: 32, xxl: 48 };
export const RADIUS = { s: 8, m: 12, l: 16, xl: 20, xxl: 24, full: 999 };

// ── Tipografía ────────────────────────────────────────────────────
//
// OJO: los paquetes de expo-google-fonts NO exportan una familia con pesos,
// exportan UNA FAMILIA POR PESO (Manrope_700Bold, etc). En React Native,
// `fontFamily: 'Manrope'` + `fontWeight: '700'` con fuente custom se ignora en
// Android y renderiza el peso regular; en iOS a veces lo sintetiza, que es peor
// porque se ve bien en el simulador y mal en la mitad de los dispositivos.
// Por eso el peso va en el nombre de la familia y NO se pasa `fontWeight`.
export const FONTS = {
  regular:    'Manrope_400Regular',
  medium:     'Manrope_500Medium',
  semibold:   'Manrope_600SemiBold',
  bold:       'Manrope_700Bold',
  extrabold:  'Manrope_800ExtraBold',
  amount:     'JetBrainsMono_500Medium',
  amountBold: 'JetBrainsMono_700Bold',
};

export const TYPE = {
  display:  { fontFamily: FONTS.extrabold,  fontSize: 40, lineHeight: 42, letterSpacing: -1.2 },
  h1:       { fontFamily: FONTS.extrabold,  fontSize: 27, lineHeight: 31, letterSpacing: -0.5 },
  h2:       { fontFamily: FONTS.bold,       fontSize: 19, lineHeight: 24 },
  body:     { fontFamily: FONTS.regular,    fontSize: 15, lineHeight: 22 },
  caption:  { fontFamily: FONTS.medium,     fontSize: 13, lineHeight: 19 },
  overline: { fontFamily: FONTS.bold,       fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase' },
  amountXL: { fontFamily: FONTS.amountBold, fontSize: 28, lineHeight: 31 },
  amount:   { fontFamily: FONTS.amount,     fontSize: 15, lineHeight: 18 },
};

// iOS + Android en el mismo token: hacer spread, no elegir.
const SOMBRAS_OSCURO = {
  ambient: { shadowColor: '#000',    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.55, shadowRadius: 16, elevation: 8 },
  glow:    { shadowColor: '#ece8e3', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.16, shadowRadius: 18, elevation: 10 },
  gold:    { shadowColor: '#f0c073', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.34, shadowRadius: 18, elevation: 10 },
};

// SOBRE CLARO LA SOMBRA TIENE QUE SER MAS SUAVE Y MAS OSCURA. Una sombra al
// 0.55 como la del tema oscuro, sobre blanco, se ve como un borron gris: en
// oscuro la sombra casi no se distingue del fondo y puede ser fuerte; en claro
// se ve entera. Y el `glow` deja de ser un halo claro —invisible sobre blanco—
// para ser una sombra comun.
const SOMBRAS_CLARO = {
  ambient: { shadowColor: '#4a423a', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.13, shadowRadius: 16, elevation: 8 },
  glow:    { shadowColor: '#2b2621', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.20, shadowRadius: 16, elevation: 10 },
  gold:    { shadowColor: '#8f6314', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.26, shadowRadius: 16, elevation: 10 },
};

// ─────────────────────────────────────────────────────────────────────
// EL TEMA, EN CALIENTE
//
// EL PROBLEMA, QUE NO ES OBVIO: `StyleSheet.create` COPIA los colores en el
// momento en que se ejecuta el modulo. Un `const styles = StyleSheet.create(...)`
// arriba de cada archivo congela la paleta del arranque, asi que cambiar
// `COLORS` despues no repinta absolutamente nada. Por eso no alcanza con
// "guardar una preferencia".
//
// La salida tiene dos mitades:
//
//  1. `COLORS`, `GRADIENTS` y `SHADOWS` son objetos que se MUTAN, no que se
//     reemplazan. Todos los usos sueltos dentro del JSX —`color={COLORS.textMid}`,
//     que son la mayoria— se leen en cada render, asi que con mutarlos y volver
//     a renderizar ya quedan bien, sin tocar una sola linea de esos archivos.
//  2. Los `StyleSheet` se declaran con `estilos(...)`, que guarda la receta y la
//     vuelve a ejecutar cuando cambia el tema, rellenando el MISMO objeto que ya
//     tienen los componentes en la mano.
//
// Se mutan en lugar de exportar un hook para no reescribir 564 usos repartidos
// en 34 archivos, que es la clase de refactor donde uno se olvida de tres y en
// tema claro quedan tres textos invisibles.
const PALETAS   = { oscuro: OSCURO, claro: CLARO };
const GRADIENTES = { oscuro: GRADIENTES_OSCURO, claro: GRADIENTES_CLARO };
const SOMBRAS    = { oscuro: SOMBRAS_OSCURO, claro: SOMBRAS_CLARO };

export const COLORS = { ...OSCURO };
export const GRADIENTS = { ...GRADIENTES_OSCURO };
export const SHADOWS = { ...SOMBRAS_OSCURO };

let temaPuesto = 'oscuro';
export const temaActual = () => temaPuesto;

const recetas = new Set();

/**
 * Declara una hoja de estilos que sobrevive a un cambio de tema.
 *
 *   const styles = estilos((C) => StyleSheet.create({ root: { color: C.textHigh } }));
 *
 * Devuelve SIEMPRE el mismo objeto: se vacia y se rellena, en vez de
 * reemplazarse, porque los componentes ya lo tienen capturado en su closure.
 */
export function estilos(receta) {
  const caja = {};
  const rehacer = () => {
    const nuevo = receta(COLORS);
    Object.keys(caja).forEach((k) => delete caja[k]);
    Object.assign(caja, nuevo);
  };
  rehacer();
  recetas.add(rehacer);
  return caja;
}

export function aplicarTema(nombre) {
  const tema = PALETAS[nombre] ? nombre : 'oscuro';
  if (tema === temaPuesto) return tema;
  temaPuesto = tema;
  Object.assign(COLORS, PALETAS[tema]);
  Object.assign(GRADIENTS, GRADIENTES[tema]);
  Object.assign(SHADOWS, SOMBRAS[tema]);
  recetas.forEach((rehacer) => rehacer());
  return tema;
}

// Los colores de MARCA no se pueden espejar: el rojo de Netflix es el rojo de
// Netflix. Pero fueron elegidos para contrastar sobre un fondo casi negro, y
// varios sobre blanco desaparecen. En claro se les baja la luminosidad hasta
// 42% conservando tono y saturacion, que es lo minimo que hace falta para que
// un punto de color se siga viendo, sin inventar un color nuevo.
const LUZ_MAXIMA_EN_CLARO = 42;
export function tono(color) {
  if (temaPuesto !== 'claro' || typeof color !== 'string') return color;
  const hsl = color.match(/^hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)$/);
  if (hsl) {
    const l = Math.min(parseInt(hsl[3], 10), LUZ_MAXIMA_EN_CLARO);
    return `hsl(${hsl[1]}, ${hsl[2]}%, ${l}%)`;
  }
  const m = color.match(/^#([0-9a-f]{6})$/i);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (l * 100 <= LUZ_MAXIMA_EN_CLARO) return color;
  const d = max - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r)      h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else                h = 60 * ((r - g) / d + 4);
  }
  return `hsl(${Math.round((h + 360) % 360)}, ${Math.round(sat * 100)}%, ${LUZ_MAXIMA_EN_CLARO}%)`;
}



// Animated.spring — sin overshoot exagerado.
/**
 * Resortes, parametrizados COMO LOS DE APPLE.
 *
 * Antes esto era `friction`/`tension`, que son los números del modelo viejo de
 * RN y no significan nada que uno pueda razonar: no hay forma de mirar
 * "tension: 220" y saber cuánto tarda ni cuánto rebota, así que se terminan
 * ajustando a prueba y error.
 *
 * Apple describe un resorte con dos cosas que sí se entienden:
 *   response        cuánto dura una oscilación, en segundos
 *   dampingFraction 1 = frena sin rebotar; por debajo, rebota
 *
 * La conversión al modelo físico que sí acepta RN (stiffness/damping/mass) es
 * exacta, con masa 1:
 *   ω₀ = 2π / response      stiffness = ω₀²      damping = 2 · fracción · ω₀
 *
 * Así los valores de abajo se pueden leer y retocar: "quiero que tarde menos"
 * es bajar `response`, no adivinar una tensión.
 *
 * Y la fluidez de verdad no sale de estos números sino de DÓNDE corren: un
 * resorte con `useNativeDriver: true` se anima en el hilo de UI y no se entera
 * de lo que esté haciendo JavaScript. Por eso sólo se animan `transform` y
 * `opacity` — `width`, `left` y los colores obligan a volver al hilo de JS y
 * ahí cualquier render pesado se ve como tirones.
 */
const resorte = (response, fraccion) => {
  const w0 = (2 * Math.PI) / response;
  return { stiffness: Math.round(w0 * w0), damping: Math.round(2 * fraccion * w0 * 10) / 10, mass: 1 };
};

export const MOTION = {
  // Tacto de un botón: tiene que sentirse instantáneo, casi sin rebote.
  press:   resorte(0.25, 0.90),   // stiffness 632, damping 45.2
  // La hoja entra con un rebote apenas perceptible; sin nada de rebote parece
  // que se frenó contra algo.
  sheet:   resorte(0.50, 0.82),
  // El pill recorre distancia: rebote suave para que se lea el movimiento.
  tabPill: resorte(0.42, 0.80),
  // Transiciones de contenido, sin rebote — un número que rebota se lee mal.
  smooth:  resorte(0.45, 1.00),
  snappy:  resorte(0.35, 0.86),
};

// ── Colores de marca de las cadenas ───────────────────────────────
//
// Fuente de verdad: backend/services/scraper.js (SCRAPE_STORES[].color). El
// backend manda `storeColor` en cada resultado; las claves de acá son los `id`
// reales del scraper para poder indexar sin tabla de traducción.
//
// `dot` difiere de `brand` sólo donde el color de marca no llega a contraste 3.0
// sobre `bg` — medido, no estimado. El punto de marca no es decoración: es lo
// que deja escanear de qué cadena es cada precio sin leer el nombre, y cinco
// cadenas eran directamente invisibles sobre el fondo oscuro (Stadium, negro
// sobre casi negro, daba 1.08).
//
// Regla que se deduce y que la UI respeta: el nombre de la tienda NUNCA va
// coloreado — siempre textHigh/textMid. El color vive sólo en el punto.
export const STORE_COLORS = {
  // supermercado
  eldorado:      { brand: '#FFC400', dot: '#FFC400' },
  tata:          { brand: '#E4002B', dot: '#E4002B' },
  tiendainglesa: { brand: '#006DB7', dot: '#006DB7' },
  disco:         { brand: '#009B3A', dot: '#009B3A' },
  geant:         { brand: '#E63946', dot: '#E63946' },
  devoto:        { brand: '#F4A623', dot: '#F4A623' },
  // farmacia / belleza
  eltunel:       { brand: '#1A6FBF', dot: '#1A6FBF' },
  sanroque:      { brand: '#1B5E20', dot: '#247E2B' },
  farmashop:     { brand: '#F57C00', dot: '#F57C00' },
  cosmeshop:     { brand: '#9C27B0', dot: '#AF2CC5' },
  // ropa
  hm:            { brand: '#E50010', dot: '#E50010' },
  stadium:       { brand: '#1A1A1A', dot: '#6C6C6C' },
  // hogar y tecnología
  zonatecno:     { brand: '#0072CE', dot: '#0072CE' },
  nnet:          { brand: '#D32F2F', dot: '#D32F2F' },
  digitaloutlet: { brand: '#37474F', dot: '#2C7397' },
  thot:          { brand: '#6A1B9A', dot: '#9D35DC' },
};

/**
 * Color del punto de una tienda. Cae en textLow si el id no se conoce — el
 * scraper puede sumar cadenas antes que este archivo.
 */
export function storeDot(storeId) {
  const s = STORE_COLORS[storeId];
  // `tono` sólo hace algo en claro: estos valores se eligieron midiendo contra
  // un fondo casi negro, y varios sobre blanco desaparecen.
  return s ? tono(s.dot) : COLORS.textLow;
}

// ── Colores de categoría de gasto ─────────────────────────────────
//
// Identidad, igual que las tiendas: la misma categoría tiene siempre el mismo
// color sin importar el orden en que venga del backend, porque si cambia entre
// meses el gráfico deja de ser legible de un vistazo.
// Los nombres tienen que ser EXACTAMENTE los de backend/services/categorizer.js.
// Acá vivían además 'Comida' e 'Ingreso', que eran los nombres del segundo
// categorizador duplicado: tener color para los cuatro es lo que hizo que la
// duplicación se viera prolija en pantalla y nadie la notara durante meses.
export const CATEGORY_COLORS = {
  // Ingresos — siempre verde
  Salario:         '#5fe0a8',
  // Gastos — distintos entre sí y del verde
  Supermercado:    '#a29bfe',
  Restaurantes:    '#fd79a8',
  Transporte:      '#54a0ff',
  Salud:           '#ff6b6b',
  Streaming:       '#6c5ce7',
  Servicios:       '#fdcb6e',
  Deporte:         '#00cec9',
  Entretenimiento: '#e84393',
  Ropa:            '#74b9ff',
  Educación:       '#8e44ad',
  Vivienda:        '#f39c12',
  Préstamos:       '#e74c3c',
  Seguros:         '#1abc9c',
  Transferencia:   '#95a5a6',
  Otros:           '#9d968e',
};

/**
 * Color de una categoría. Las custom, que el usuario inventa, salen de un hash
 * del nombre: siempre el mismo color para el mismo texto, con luminosidad fija
 * para que ninguna quede ilegible sobre el fondo oscuro.
 */
export function categoryColor(name = 'Otros') {
  if (CATEGORY_COLORS[name]) return tono(CATEGORY_COLORS[name]);
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  // La luminosidad fija de 68% es para que se lea sobre el fondo oscuro; sobre
  // blanco es justo al reves, y `tono` la baja.
  return tono(`hsl(${Math.abs(hash) % 360}, 60%, 68%)`);
}

// ── Colores de servicios de suscripción ───────────────────────────
//
// Misma regla que STORE_COLORS: `brand` es el color real de la marca e `icon`
// el que se pinta sobre `surfaceSunken`, ajustado cuando la marca no llega a
// contraste 3.0 ahí. Cuatro de catorce no llegaban — PlayStation Plus, azul
// marino sobre gris oscuro, daba 1.26 y el icono era una mancha.
export const SERVICE_COLORS = {
  'Netflix':              { brand: '#E50914', icon: '#E50914', ionicon: 'film-outline' },
  'Spotify':              { brand: '#1DB954', icon: '#1DB954', ionicon: 'musical-notes-outline' },
  'Disney+':              { brand: '#006E99', icon: '#007DAD', ionicon: 'tv-outline' },
  'HBO Max':              { brand: '#5822A7', icon: '#8D57DD', ionicon: 'videocam-outline' },
  'Amazon Prime':         { brand: '#FF9900', icon: '#FF9900', ionicon: 'cart-outline' },
  'YouTube Premium':      { brand: '#FF0000', icon: '#FF0000', ionicon: 'logo-youtube' },
  'Apple TV+':            { brand: '#A2AAAD', icon: '#A2AAAD', ionicon: 'logo-apple' },
  'PlayStation Plus':     { brand: '#003087', icon: '#1C6DFF', ionicon: 'game-controller-outline' },
  'Xbox Game Pass':       { brand: '#107C10', icon: '#128A12', ionicon: 'game-controller-outline' },
  'iCloud':               { brand: '#3478F6', icon: '#3478F6', ionicon: 'cloud-outline' },
  'Google One':           { brand: '#4285F4', icon: '#4285F4', ionicon: 'cloud-outline' },
  'Microsoft 365':        { brand: '#D83B01', icon: '#D83B01', ionicon: 'grid-outline' },
  'Adobe Creative Cloud': { brand: '#FF0000', icon: '#FF0000', ionicon: 'color-palette-outline' },
  'Gimnasio':             { brand: '#FF6D00', icon: '#FF6D00', ionicon: 'barbell-outline' },
};

/** Icono y color de un servicio. Cae en genérico si no se conoce. */
export function serviceMeta(name) {
  const s = SERVICE_COLORS[name];
  return s
    ? { icon: s.ionicon, color: tono(s.icon) }
    : { icon: 'phone-portrait-outline', color: COLORS.primary };
}
