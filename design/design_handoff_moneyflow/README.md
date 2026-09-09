# Handoff: MoneyFlow — rediseño v1 (sistema de componentes)

## Overview
MoneyFlow es una app de finanzas personales para Uruguay (es-UY, UYU) en **React Native / Expo SDK 57**, solo modo oscuro. Este handoff entrega el rediseño v1: **tokens semánticos + 12 componentes con todos sus estados + 3 pantallas de referencia** (Dashboard, Search, Shopping) armadas exclusivamente con esos componentes.

El objetivo del rediseño no es repintar: es **eliminar la duplicación**. Hoy hay 9 pantallas, ~10.000 líneas y ~2.350 de `StyleSheet` inline, con 15 botones primarios distintos, 4 bottom sheets, 5 empty states y 66 hex sueltos (41 en `theme.js`). Después de esto: un componente por patrón y cero color fuera de `COLORS`.

## About the Design Files
Los archivos de este paquete son **referencias de diseño hechas en HTML**: prototipos que muestran aspecto y comportamiento buscados, **no código para copiar**. La tarea es **recrear estos diseños en el codebase real de React Native**, con sus patrones y librerías (`StyleSheet.create`, `Animated`, `expo-linear-gradient`, `@expo/vector-icons/Ionicons`). El HTML usa conic-gradient, `style-hover`, etc. porque es un navegador; el equivalente RN está anotado abajo.

`theme.js` **sí** es código listo para pegar.

## Fidelity
**Alta fidelidad.** Colores, tipografía, espaciado y radios son finales. Las 3 pantallas son mockups pixel-precisos a 390 × 844. Los datos son de ejemplo.

## Restricciones del entorno (respetarlas)
- Layout: **solo flexbox**. No hay CSS Grid, `:hover`, `position: sticky` ni media queries.
- **Sin blur** (`expo-blur` no se usa). Nada del diseño lo requiere.
- Gradientes: `expo-linear-gradient`, y solo los 3 de `GRADIENTS`.
- Animación: API `Animated` (springs), valores en `MOTION`.
- Sombras: siempre el par iOS (`shadowColor/Offset/Opacity/Radius`) + Android (`elevation`) → hacer spread de `SHADOWS.x`.
- Iconos: **Ionicons** de `@expo/vector-icons`, par `-outline` / filled (el filled marca el tab activo). El HTML usa los mismos nombres de icono de Ionicons: se pueden leer literal del markup.
- Tipografía: **Manrope** (UI) + **JetBrains Mono** (solo montos, por alineación tabular), cargadas con `expo-font`. Si no se aprueban, el fallback es la del sistema y `TYPE` sigue siendo válido.
- Montos: UYU con separador de miles y `$`. Los números son largos (`$127.450`); ninguna caja se diseña para 3 dígitos.

## Design Tokens
Están en `theme.js` (pegar sobre `frontend/src/theme.js`). Resumen:

**Superficies** — bg `#121110` · surface `#191817` · surfaceRaised `#201e1c` · surfaceSunken `#292725` · surfaceOverlay `#332f2c` · borderSubtle `#262421` · border `#34302c` · borderStrong `#46403a`.

**Marca** — primary hueso `#ece8e3` (relleno de botón; texto sobre él `#121110`) · primaryPressed `#cfc9c2` · primarySoft `#2b2825` · primaryBorder `#6f675f` · accent turquesa `#3fd7bd` · premium `#f0c073` (gradiente `#f7d79a → #c9922f`).

**Dato vs. feedback (separados a propósito)** — income `#5fe0a8`, expense `#ff8f7a`, neutralData `#a9a29b` / success `#46c98f`, warning `#e8b25f`, error `#e5594a`. Nunca usar un color de dato para feedback ni al revés: ese cruce es uno de los problemas actuales.

**Texto** — textHigh `#ece8e3` · textMid `#a9a29b` · textLow `#78716b` · disabled `rgba(120,113,107,0.45)`.

**Espaciado** 4·8·16·24·32·48 — **radios** 8·12·16·20·24·full. Regla: padding de card = 16, gap entre cards = 8, margen de pantalla = 16, aire entre secciones = 24.

**Tipografía** display 40/42 800 · h1 27/31 800 · h2 19/24 700 · body 15/22 · caption 13/19 500 · overline 11 700 +1.1 · amountXL 28 mono 700 · amount 15 mono 500.

**Sombras** ambient (negra, elevación real) · glow (halo hueso, foco) · gold (bloqueado por premium).

## Componentes a construir (12)
Cada uno con todas sus variantes; ver el bloque correspondiente en el HTML.

1. **Button** — variantes `primary` (fill hueso, texto tinta), `secondary` (surfaceRaised + borde), `ghost` (sin fondo), `destructive` (errorSoft + borde), `premiumLocked` (gradiente dorado + `SHADOWS.gold`; **dorado, no gris**: gris se leía como roto). Tamaños sm 36 / md 48 / lg 56, radio 10/12/14, alto mínimo 44. Estados: normal, pressed (`primaryPressed` + `scale 0.98`, `MOTION.press`), loading (spinner + label, botón deshabilitado), disabled (`surfaceSunken` + `textDisabled`). Prop `icon` (Ionicon) y `fullWidth`. → reemplaza `signInBtn, ctaBtn, saveBtn, confirmBtn, depositBtn, generateBtn, compareBtn, addBtn, searchBtn, detectAddBtn, refreshBtn, restoreBtn, lockedCta, clearBtn, addCatBtn`.
2. **Card** — `base` (surface + borde 1.5 + radio 16), `raised` (surfaceRaised + `SHADOWS.ambient`), `selected` (primarySoft + borde primary), `best` (successSoft + borde success), `partial` (warningSoft + borde warning), `locked` (borde `#6b5326` + overlay dorado al 14% + `SHADOWS.gold`). → `emptyCard, insightCard, storeCard, resultCard, productCard, bentoCell`.
3. **Input** — solo, con icono izquierdo, con prefijo `$` (bloque `surfaceSunken` pegado al borde izquierdo, monto en mono 17), con error (borde error + texto de ayuda en expense), con sugerencias (lista pegada abajo, radio solo inferior). Foco: borde primary + halo `rgba(236,232,227,0.16)`. → `input, inputRow, inputIcon, searchInput`.
4. **Chip** — `filter` on/off, `sort` (con flecha), `segmented` (pill hueso sobre track surfaceRaised), `listItem` (nombre + `×N` + botón borrar 22px). Activo: primarySoft + borde `#6f675f` + texto textHigh. → `catChip, chip, sortChip, itemChip, freqBtn, chartToggleBtn`.
5. **Badge / Pill** — `store` (punto de color de marca + nombre), `discount`, `best`, `premium` (gradiente), `streak`, `status`, `estimate`. El badge **Estimación** es componente, no letra chica: sostiene la regla de honestidad de los números. → `bestBadge ×3, storeDot, discountBadge, streakPill, autoDebitBadge`.
6. **BottomSheet** — uno solo: scrim `rgba(8,7,6,0.72)`, hoja surfaceRaised, radio superior 24, handle 40×4 `borderStrong`, título h2 + subtítulo caption, contenido scrolleable, fila de acciones (ghost + primary). Entrada con `MOTION.sheet`. → `modalOverlay/modalCard/modalHandle ×3 + backdrop/sheet/handle`.
7. **OfferRow** — imagen 60 o placeholder (icono `image-outline` sobre surfaceSunken), nombre a 2 líneas, punto de tienda + nombre, precio por unidad, precio (income si es el mejor), precio de lista tachado, delta `+$216` en expense, caso "mismo precio" en textLow. → unifica `resultCard/resultImg` y `productCard/productImage`, que hoy son el mismo componente con dos nombres.
8. **Progress** — barra normal (track surfaceSunken, fill primary, alto 7-8, radio full) y **sobregiro** (fill expense hasta el 100% + tramo error del excedente + línea "$1.900 por encima"). Anillo en 3 tamaños (112 / 72 / 44): en RN es `react-native-svg` con `strokeDasharray` animado por `Animated` (en el HTML está simulado con conic-gradient). → `progressBar/Track/Fill ×3, ringOverlay, ringContainer, ringOuter/Inner`.
9. **EmptyState** — icono en círculo 56, título h2, texto de 2 líneas máx, un botón. Uno solo, no cinco.
10. **Skeleton** — la misma geometría del componente real, en `borderSubtle`, con pulso de opacidad 0.4→1 en loop (`Animated.loop`). Nada de spinners sueltos en listas.
11. **ScreenHeader** — avatar 42 (iniciales) opcional, título h1 + subtítulo caption, acción derecha 40×40 circular.
12. **TabBar flotante** — 6 items en este orden exacto (**no cambiar, es navegación aprendida**): Wealth · Movs · Metas · Subs · Buscar · Lista. Contenedor surfaceRaised + borde + radio full + `SHADOWS.ambient`, flotando a 26 del borde inferior y 14 de los laterales. Activo: pill `primarySoft`, icono filled + label 9.5/700 en textHigh; inactivo: icono `-outline` + label en textLow. El pill se desplaza con `MOTION.tabPill`. Encima del contenido va un degradado de 96px `transparent → bg` para el fade de scroll.

## Screens / Views

### 1. Dashboard (Wealth)
Para qué: ver el mes, el balance y a dónde se fue la plata.
Layout (padding lateral 16, scroll vertical, tab bar flotante encima):
ScreenHeader (avatar VF + "Hola, Valentina" / "Resumen al 31 de agosto" + campana) → selector de mes (pill full con dos flechas circulares 30px y el mes centrado) → **card de balance** (raised, radio 20: overline "Balance del mes" + badge de tendencia success a la derecha, monto `$127.450` en mono 38/800, y dos cajas 50/50 con Ingresos en income y Egresos en expense) → gráfico de barras 104px con la barra del mes actual en primary y toggle Mes/Cat a la derecha → "Categorías" + card con barras de progreso (una normal, una en sobregiro) → "Movimientos" + filas de transacción (icono 38 en cuadro redondeado con el color de la categoría, nombre + categoría/fecha, monto en income o expense con signo).
Estados: `normal`, `vacío` (EmptyState "Todavía no subiste un resumen" + botón Subir resumen), `cargando` (skeletons con la geometría de la card de balance y de dos cards de lista). En el HTML se alternan desde el panel de Tweaks (`dashboardState`).

### 2. Search (Buscar) — comparador
Para qué: buscar un producto y ver qué cadena lo tiene más barato.
Layout: ScreenHeader ("Buscar" / "6 cadenas · precios de hoy" + filtros) → fila de chips de categoría que **sangra hasta el borde** con degradado a la derecha (afordancia de scroll horizontal; en RN es un `ScrollView horizontal`) → input de búsqueda + botón cuadrado 48 → línea de stats ("14 productos en 6 tiendas" + orden actual) → **grupo de resultado expandible**: cabecera con imagen 62, nombre, "6 tiendas", rango `$929 – $1.290`, mejor precio en income y chevron; expandido muestra una fila por tienda (punto de marca, nombre, badge "Mejor" / delta `+$96` / descuento con precio tachado / "mismo precio", y el precio alineado a la derecha en columna de 64) más el aviso de sustitutos → OfferRow compacta del siguiente producto → **teaser bloqueado por premium** (card locked + CTA dorado).
Estados a cubrir en la implementación: skeletons durante la carga, empty state con acción sugerida, error de scrape.

### 3. Shopping (Compras) — comparador de lista
Para qué: cotizar la lista entera en 6 cadenas.
Layout: header "Mi lista" / "12 ítems · cotizada en 6 cadenas" → card con los chips de ítem (`×N` + borrar) y el botón **Comparar 12 ítems** con `GRADIENTS.action` → **card carrito óptimo** (variante `best`): total `$7.310` en mono 32, "12 de 12 ítems, repartidos en 2 cadenas", ahorro `−$1.100` "vs. tu habitual", y una línea resumen con los puntos de las dos cadenas + "Ver ítems" → card de totales por tienda (Tata 12/12 en success, Devoto "Parcial 9/12" en warning) con la aclaración **"Devoto sale menos porque le faltan 3 ítems. No es un ahorro."** dentro de la misma card → **insightCard "Cruce con tu banco"** (surfaceRaised, título en accent + badge Estimación): "Comprás en Disco y gastás $8.400 por mes. Esta lista sale $1.100 menos en Tata", cajas Al mes / Al año en income, y el disclaimer "Proyección sobre 4 meses con datos; puede variar por promos y faltantes."
La card de carga durante el scrape (5–12 s) usa Progress + texto de paso; no es instantáneo y no debe parecerlo.

## Interactions & Behavior
- Tap en chip de categoría → filtra; solo uno activo.
- Tap en la cabecera de un grupo de resultados → expande/colapsa la lista por tienda (`LayoutAnimation` o `Animated.timing`, 160-200 ms).
- Tap en tab → cambia de pantalla; el pill se desplaza con spring (`MOTION.tabPill`) y el icono pasa a filled.
- Botones: pressed = `primaryPressed` + `scale 0.98`; loading bloquea el tap.
- Sheets: entran desde abajo con `MOTION.sheet`; el scrim cierra al tocar.
- Listas largas: skeletons, nunca spinner solo.
- No hay hover (el HTML lo usa solo para que se pueda inspeccionar en el navegador).

## State Management
Nada nuevo respecto de la app actual. Para las 3 pantallas: mes seleccionado, categoría filtrada, estado del Dashboard (`empty | loading | ready | error`), grupo expandido (id o null), orden activo, ítems de la lista (`{ nombre, cantidad }`), resultado de la comparación (`{ carritoOptimo, porTienda[], insight }`) y `isPremium`.

## Reglas que el diseño no puede romper
- Los 6 tabs y su orden.
- Los colores de marca de las cadenas (los hex en `STORE_COLORS` son **placeholders**: reemplazar por los del código actual).
- La honestidad de los números: un total menor por tener menos productos **no** es un ahorro; la proyección mensual **es** una estimación; el promedio se calcula sobre los meses con datos. Estas aclaraciones tienen componente propio (badge Estimación, card `partial`) y no se ocultan para que quede más limpio.

## Assets
Ninguno propio. Iconos: Ionicons (`@expo/vector-icons`), ya en el proyecto. Fuentes: Manrope y JetBrains Mono (Google Fonts, licencia OFL) para cargar con `expo-font`. Las imágenes de producto son placeholders con icono `image-outline`.

## Pendiente (ronda 2, no incluido)
- **Badge de veredicto caro / normal / barato** contra el histórico del MEF: 3 estados, % de diferencia y rango habitual. Tiene lugar reservado en `OfferRow`.
- **Sucursal más cercana por cadena** ("Tata es el más barato, a 600 m"), va en la card de tienda.
- Las otras 6 pantallas (Upload, Goals, Subs, Suggestions, Login, Paywall/UpgradeModal). No requieren componentes nuevos.

## Files
- `MoneyFlow Redesign.dc.html` — el diseño completo: premisas, tokens, galería de los 12 componentes con estados y las 3 pantallas. Abrir en un navegador.
- `theme.js` — tokens listos para pegar en `frontend/src/theme.js`.
