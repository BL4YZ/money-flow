// MoneyFlow — theme.js
// Rediseño v1. Reemplaza frontend/src/theme.js.
// Regla: ningún color hex fuera de este archivo.

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
  primaryFill: '#ece8e3',
  primaryPressed: '#cfc9c2', // oscurece al presionar, nunca aclara
  primarySoft: '#2b2825',    // chip activo, pill de tab
  primaryBorder: '#6f675f',
  accent: '#3fd7bd',
  accentSoft: '#132a27',
  premium: '#f0c073',
  premiumSoft: '#2a2216',
  premiumBorder: '#6b5326',

  // Dato: signo del dinero (nunca para feedback de UI)
  income: '#5fe0a8',
  expense: '#ff8f7a',
  neutralData: '#a9a29b',

  // Feedback: estado del sistema (nunca para montos)
  success: '#46c98f',
  warning: '#e8b25f',
  error: '#e5594a',
  successSoft: '#14251d',
  warningSoft: '#2a2216',
  errorSoft: '#2b1815',

  textHigh: '#ece8e3',
  textMid: '#a9a29b',
  textLow: '#78716b',
  textDisabled: 'rgba(120,113,107,0.45)',
  onPrimary: '#121110',  // texto sobre botón hueso
  onPremium: '#2a2216',  // texto sobre dorado
  scrim: 'rgba(8,7,6,0.72)',
};

// Solo 3 gradientes en toda la app (expo-linear-gradient)
export const GRADIENTS = {
  premium: ['#f7d79a', '#c9922f'],
  action: ['#ffffff', '#d9d2c9'],
  glow: ['rgba(63,215,189,0.20)', 'rgba(18,17,16,0)'],
};

export const SPACING = { xs: 4, s: 8, m: 16, l: 24, xl: 32, xxl: 48 };
export const RADIUS = { s: 8, m: 12, l: 16, xl: 20, xxl: 24, full: 999 };

// Cargar con expo-font antes del primer render
export const FONTS = {
  ui: 'Manrope',           // 400 500 600 700 800
  amount: 'JetBrainsMono', // 400 500 700 — solo montos (tabular)
};

export const TYPE = {
  display:  { fontFamily: FONTS.ui, fontSize: 40, lineHeight: 42, fontWeight: '800', letterSpacing: -1.2 },
  h1:       { fontFamily: FONTS.ui, fontSize: 27, lineHeight: 31, fontWeight: '800', letterSpacing: -0.5 },
  h2:       { fontFamily: FONTS.ui, fontSize: 19, lineHeight: 24, fontWeight: '700' },
  body:     { fontFamily: FONTS.ui, fontSize: 15, lineHeight: 22 },
  caption:  { fontFamily: FONTS.ui, fontSize: 13, lineHeight: 19, fontWeight: '500' },
  overline: { fontFamily: FONTS.ui, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
  amountXL: { fontFamily: FONTS.amount, fontSize: 28, lineHeight: 31, fontWeight: '700' },
  amount:   { fontFamily: FONTS.amount, fontSize: 15, lineHeight: 18, fontWeight: '500' },
};

// iOS + Android en el mismo token: hacer spread, no elegir
export const SHADOWS = {
  ambient: { shadowColor: '#000',     shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.55, shadowRadius: 16, elevation: 8 },
  glow:    { shadowColor: '#ece8e3',  shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.16, shadowRadius: 18, elevation: 10 },
  gold:    { shadowColor: '#f0c073',  shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.34, shadowRadius: 18, elevation: 10 },
};

// Animated.spring — sin overshoot exagerado
export const MOTION = {
  press:   { friction: 9,  tension: 220 },
  sheet:   { friction: 12, tension: 140 },
  tabPill: { friction: 10, tension: 180 },
};

// Colores de marca de las cadenas: NO cambiar, vienen del código actual.
// Reemplazar por los valores reales antes de mergear.
export const STORE_COLORS = {
  disco: '#e30613',
  devoto: '#00a651',
  tata: '#f7941d',
  tiendaInglesa: '#003da5',
  // frog: '#…', macroMercado: '#…',
};
