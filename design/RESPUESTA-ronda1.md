# Respuesta a las dos preguntas abiertas — ronda 1

---

## 1. Colores de marca reales

Son **16 cadenas**, no 4. Salen de `backend/services/scraper.js` (`SCRAPE_STORES[].color`),
que es la fuente de verdad: el backend manda `storeColor` en cada resultado.

Aviso importante: **los 4 placeholders estaban rotados**, no solo aproximados.

| | placeholder | real |
|---|---|---|
| Disco | `#e30613` rojo | **`#009B3A` verde** |
| Devoto | `#00a651` verde | **`#F4A623` ámbar** |
| Tata | `#f7941d` naranja | **`#E4002B` rojo** |
| Tienda Inglesa | `#003da5` | `#006DB7` |

Y `frog` / `macroMercado` no existen en la app.

### El problema: 5 no se ven sobre `#121110`

Contraste de cada color de marca contra el fondo nuevo. Umbral 3.0 para un punto
de 8px, 4.5 para texto.

| Tienda | Hex | vs `bg` | Punto | Texto |
|---|---|---|---|---|
| El Dorado | `#FFC400` | 11.81 | sí | sí |
| Devoto | `#F4A623` | 9.27 | sí | sí |
| Farmashop | `#F57C00` | 6.97 | sí | sí |
| Disco | `#009B3A` | 5.16 | sí | sí |
| Géant | `#E63946` | 4.53 | sí | sí |
| H&M | `#E50010` | 3.90 | sí | no |
| Tata | `#E4002B` | 3.89 | sí | no |
| ZonaTecno | `#0072CE` | 3.86 | sí | no |
| NNET | `#D32F2F` | 3.79 | sí | no |
| El Túnel | `#1A6FBF` | 3.66 | sí | no |
| Tienda Inglesa | `#006DB7` | 3.48 | sí | no |
| **Cosmeshop** | `#9C27B0` | **2.99** | **NO** | no |
| **San Roque** | `#1B5E20` | **2.40** | **NO** | no |
| **Thot** | `#6A1B9A` | **2.01** | **NO** | no |
| **Digital Outlet** | `#37474F` | **1.95** | **NO** | no |
| **Stadium** | `#1A1A1A` | **1.08** | **INVISIBLE** | no |

Stadium es negro sobre fondo casi negro: el punto no existe. Y el punto de marca
no es decorativo — en `OfferRow` es lo que permite escanear de qué cadena es cada
precio sin leer.

**Regla que se deduce:** ningún nombre de tienda va coloreado. El color vive solo
en el punto, y el nombre siempre en `textHigh`/`textMid`. Con eso, 11 de 16
funcionan tal cual.

### Propuesta para las 5 que fallan

Mismo tono, luminosidad subida hasta pasar 3.5:

| Tienda | Marca | Punto en UI oscura | ratio |
|---|---|---|---|
| Cosmeshop | `#9C27B0` | `#AF2CC5` | 3.58 |
| San Roque | `#1B5E20` | `#247E2B` | 3.68 |
| Thot | `#6A1B9A` | `#9D35DC` | 3.57 |
| Digital Outlet | `#37474F` | `#2C7397` | 3.60 |
| Stadium | `#1A1A1A` | `#6C6C6C` | 3.59 |

Dos son un cambio real de carácter y conviene que lo decidas vos, no yo:
**Stadium** no tiene tono que preservar (es negro), así que queda gris neutro; y
**Digital Outlet** es un gris azulado desaturado que, al subirle luz, se vuelve
azul. Si preferís no tocar la marca, la alternativa es un aro de 1px
`borderStrong` alrededor del punto y dejar el hex original — se ve el contorno
aunque el relleno se funda con el fondo.

### Bloque corregido

```js
// Colores de marca de las cadenas. Fuente de verdad: backend/services/scraper.js
// (SCRAPE_STORES[].color) — el backend manda storeColor en cada resultado.
// `dot` difiere de `brand` solo donde la marca no alcanza contraste 3.0 sobre bg.
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
```

Las claves son los `id` reales del scraper — se indexa directo con el `storeId`
que ya viene en la respuesta, sin tabla de traducción.

---

## 2. Manrope + JetBrains Mono: **aprobados**, con una corrección obligatoria

Ambos verificados como instalables:

- `@expo-google-fonts/manrope@0.4.2` — pesos 200…800 ✓
- `@expo-google-fonts/jetbrains-mono@0.4.1` — pesos 100…800 + itálicas ✓
- `expo-font@57.0.3` compatible con SDK 57 ✓ (**no está instalado todavía**)

JetBrains Mono para montos está bien elegido: en el comparador los precios se
leen en columna vertical entre tiendas, y sin cifras tabulares esa comparación no
alinea.

### El problema: `TYPE` como está no funciona en Android

Los paquetes **no exportan una familia `Manrope` con pesos**. Exportan una familia
por peso:

```
Manrope_400Regular   Manrope_500Medium   Manrope_700Bold   Manrope_800ExtraBold
JetBrainsMono_500Medium   JetBrainsMono_700Bold
```

En React Native, `fontFamily: 'Manrope'` + `fontWeight: '800'` con una fuente
custom **se ignora en Android** y renderiza el peso regular. En iOS a veces
funciona por síntesis, lo que es peor: se ve bien en el simulador y sale mal en
la mitad de los dispositivos.

Hay que nombrar la familia por peso y **no pasar `fontWeight`**:

```js
export const FONTS = {
  regular:   'Manrope_400Regular',
  medium:    'Manrope_500Medium',
  bold:      'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
  amount:    'JetBrainsMono_500Medium',
  amountBold:'JetBrainsMono_700Bold',
};

// Sin fontWeight: el peso ya está en la familia.
export const TYPE = {
  display:  { fontFamily: FONTS.extrabold, fontSize: 40, lineHeight: 42, letterSpacing: -1.2 },
  h1:       { fontFamily: FONTS.extrabold, fontSize: 27, lineHeight: 31, letterSpacing: -0.5 },
  h2:       { fontFamily: FONTS.bold,      fontSize: 19, lineHeight: 24 },
  body:     { fontFamily: FONTS.regular,   fontSize: 15, lineHeight: 22 },
  caption:  { fontFamily: FONTS.medium,    fontSize: 13, lineHeight: 19 },
  overline: { fontFamily: FONTS.bold,      fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase' },
  amountXL: { fontFamily: FONTS.amountBold,fontSize: 28, lineHeight: 31 },
  amount:   { fontFamily: FONTS.amount,    fontSize: 15, lineHeight: 18 },
};
```

Son **6 TTF** en total (~600 KB). El `TYPE` original queda válido como
especificación visual: cambia el cómo, no el qué.

Instalación:

```
npx expo install expo-font @expo-google-fonts/manrope @expo-google-fonts/jetbrains-mono
```

Y `useFonts` tiene que resolver antes del primer render, con la fuente del
sistema como fallback si falla la carga — nunca pantalla en blanco.

---

## 3. Aparte: dos colisiones en `theme.js`

1. **`warningSoft` y `premiumSoft` son el mismo valor** (`#2a2216`). Una card
   `partial` ("le faltan 3 ítems") y una card `locked` (premium) quedan con
   idéntico fondo. Justo el cruce que el propio handoff dice evitar, y encima en
   los dos componentes que sostienen la regla de honestidad de los números.
   Sugerencia: `warningSoft: '#2b2113'` y `premiumSoft: '#251d10'`, o separar por
   el borde.

2. `primary` y `primaryFill` son el mismo hex y `textHigh` también (`#ece8e3`).
   Puede ser deliberado, pero conviene confirmarlo: si en algún momento se separa
   el relleno del botón del color de texto, hoy no hay forma de distinguirlos.
