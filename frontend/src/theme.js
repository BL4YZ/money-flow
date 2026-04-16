// ── Paleta extraída del sistema de diseño MoneyFlow ───────────────
export const COLORS = {
  // Backgrounds
  background:              '#131313',
  surface:                 '#131313',
  surfaceContainer:        '#201f1f',
  surfaceContainerLow:     '#1c1b1b',
  surfaceContainerLowest:  '#0e0e0e',
  surfaceContainerHigh:    '#2a2a2a',
  surfaceContainerHighest: '#353534',

  // Primary (lavender purple)
  primary:          '#cdbdff',
  primaryContainer: '#7c4dff',
  onPrimary:        '#370096',
  onPrimaryContainer: '#fcf6ff',

  // Secondary (teal / cyan)
  secondary:          '#44ddc1',
  secondaryFixed:     '#68fadd',
  secondaryFixedDim:  '#44ddc1',
  onSecondary:        '#00382f',

  // Tertiary (orange)
  tertiary:        '#ffb688',
  tertiaryFixedDim:'#ffb688',

  // Text
  onSurface:        '#e5e2e1',
  onSurfaceVariant: '#cac3d8',
  onBackground:     '#e5e2e1',

  // Borders / outlines
  outline:        '#948ea1',
  outlineVariant: '#494455',

  // Semantic
  success: '#44ddc1',
  warning: '#ffb688',
  danger:  '#ffb4ab',
  error:   '#ffb4ab',

  // Aliases para compatibilidad con código existente
  text:          '#e5e2e1',
  textSecondary: '#cac3d8',
  textMuted:     '#948ea1',
  border:        '#494455',
  income:        '#44ddc1',
  expense:       '#ffb4ab',
};

// Gradiente principal (lavender → deep purple)
export const GRADIENT = {
  primary: ['#cdbdff', '#7c4dff'],
  primaryReverse: ['#7c4dff', '#cdbdff'],
};

export const FONTS = {
  regular: { fontWeight: '400' },
  medium:  { fontWeight: '500' },
  semibold:{ fontWeight: '600' },
  bold:    { fontWeight: '700' },
  extrabold:{ fontWeight: '800' },
};

export const SPACING = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
};

export const RADIUS = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  full: 9999,
};

// Sombras reutilizables
export const SHADOWS = {
  ambient: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.4,
    shadowRadius: 40,
    elevation: 10,
  },
  nebula: {
    shadowColor: '#7c4dff',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 30,
    elevation: 12,
  },
};
