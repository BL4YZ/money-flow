// MoneyFlow — theme.js
// Rediseño v1 (handoff design/design_handoff_moneyflow).
//
// REGLA: ningún color hex fuera de este archivo. El estado anterior tenía 66
// hex sueltos en el código contra 41 acá; eso es lo que este rediseño cierra.

export const COLORS = {
  bg: '#121110',
  surface: '#191817',
  surfaceRaised: '#201e1c',
  surfaceSunken: '#292725',
  surfaceOverlay: '#332f2c',

  borderSubtle: '#262421',
  border: '#34302c',
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
export const GRADIENTS = {
  premium: ['#f7d79a', '#c9922f'],
  action: ['#ffffff', '#d9d2c9'],
  glow: ['rgba(63,215,189,0.20)', 'rgba(18,17,16,0)'],
  // Fade de scroll detrás de la tab bar flotante (96px, transparent → bg)
  scrollFade: ['rgba(18,17,16,0)', '#121110'],
  // Velo dorado de la card `locked`
  lockedVeil: ['rgba(240,192,115,0.14)', 'rgba(25,24,23,0)'],
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
export const SHADOWS = {
  ambient: { shadowColor: '#000',    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.55, shadowRadius: 16, elevation: 8 },
  glow:    { shadowColor: '#ece8e3', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.16, shadowRadius: 18, elevation: 10 },
  gold:    { shadowColor: '#f0c073', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.34, shadowRadius: 18, elevation: 10 },
};

// Animated.spring — sin overshoot exagerado.
export const MOTION = {
  press:   { friction: 9,  tension: 220 },
  sheet:   { friction: 12, tension: 140 },
  tabPill: { friction: 10, tension: 180 },
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
  return s ? s.dot : COLORS.textLow;
}

// ── COMPATIBILIDAD TEMPORAL — BORRAR AL TERMINAR LA MIGRACIÓN ─────
//
// Las 9 pantallas todavía usan los nombres del theme viejo. Sin estos alias la
// app no arranca durante la migración: un `COLORS.background` inexistente entra
// como `undefined` y RN no avisa, simplemente pinta mal.
//
// Se van borrando a medida que cada pantalla pasa a los componentes nuevos. La
// migración está completa cuando este bloque se puede eliminar y la app sigue
// compilando — ese es el criterio, no "se ve bien".
Object.assign(COLORS, {
  background:              COLORS.bg,
  surfaceContainer:        COLORS.surfaceRaised,
  surfaceContainerLow:     COLORS.surface,
  surfaceContainerLowest:  COLORS.bg,
  surfaceContainerHigh:    COLORS.surfaceSunken,
  surfaceContainerHighest: COLORS.surfaceOverlay,
  primaryContainer:        COLORS.primarySoft,
  onPrimaryContainer:      COLORS.textHigh,
  secondary:               COLORS.accent,
  secondaryFixed:          COLORS.accent,
  secondaryFixedDim:       COLORS.accent,
  onSecondary:             COLORS.bg,
  tertiary:                COLORS.premium,
  tertiaryFixedDim:        COLORS.premium,
  onSurface:               COLORS.textHigh,
  onSurfaceVariant:        COLORS.textMid,
  onBackground:            COLORS.textHigh,
  outline:                 COLORS.textLow,
  outlineVariant:          COLORS.border,
  danger:                  COLORS.error,
  text:                    COLORS.textHigh,
  textSecondary:           COLORS.textMid,
  textMuted:               COLORS.textLow,
  border:                  COLORS.border,
});

// Las escalas se renombraron (md → m). Mismos valores, distinta clave: sin
// estos alias quedaban 225 paddings en `undefined`, que RN no reporta.
Object.assign(SPACING, { sm: SPACING.s, md: SPACING.m, lg: SPACING.l });
Object.assign(RADIUS,  { sm: RADIUS.s,  md: RADIUS.m,  lg: RADIUS.l });
Object.assign(SHADOWS, { nebula: SHADOWS.glow });

/** @deprecated usar GRADIENTS */
export const GRADIENT = {
  primary:        GRADIENTS.action,
  primaryReverse: [...GRADIENTS.action].reverse(),
  locked:         GRADIENTS.premium,
};
