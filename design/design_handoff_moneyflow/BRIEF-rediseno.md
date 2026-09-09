# MoneyFlow — brief de rediseño

Para Claude Design. Todo lo de acá está sacado del código, no de memoria.

---

## 1. Qué es

App de finanzas personales para Uruguay (es-UY, pesos uruguayos). El usuario sube
el PDF del resumen bancario, la app lo parsea y de ahí salen las categorías, las
suscripciones detectadas y las metas de ahorro. Encima de eso hay un comparador
de precios de supermercados uruguayos: buscador de productos y lista de compras
que se cotiza en 6 cadenas a la vez.

La función que la diferencia: cruza el gasto real del banco con los precios
scrapeados — "comprás en Disco y gastás $8.400 por mes; tu lista sale $1.100
menos en Tata". Eso el diseño lo tiene que poder contar.

Modelo free / premium.

---

## 2. Restricciones duras — leer antes de diseñar

**Es React Native (Expo SDK 57), no web.**

- No hay CSS Grid, ni `:hover`, ni `position: sticky`, ni media queries.
  El layout es flexbox y nada más.
- No hay Tailwind. Los estilos son objetos `StyleSheet.create`.
- **Sin blur.** `expo-blur` no se usa (0 usos hoy). Si el diseño depende de
  glassmorphism, no se puede implementar tal cual.
- `expo-linear-gradient` sí está y se usa mucho (28 instancias). Los gradientes
  son parte del lenguaje actual.
- Animaciones: API `Animated` de RN (51 usos, springs). Nada de CSS transitions.
- Sombras: iOS usa `shadowColor/Offset/Opacity/Radius`, Android usa `elevation`.
  Hay que dar las dos.
- Iconografía: `@expo/vector-icons` → **Ionicons**. Cada icono tiene par
  outline/filled y así se marca el tab activo. Si proponés otro set, decilo
  explícito.
- Solo modo oscuro. No hay tema claro y no se pide.
- Tipografía: hoy es la del sistema, sin fuente custom cargada. Si proponés una,
  tiene que entrar por `expo-font`.

**Formato de datos:** montos en UYU con separador de miles y símbolo `$`. Algunos
productos son USD convertidos y muestran el precio original al lado. Los números
son largos: `$127.450` es normal. No diseñar cajas para 3 dígitos.

---

## 3. Estado actual — el problema real

Hay un `theme.js` con tokens, pero **no hay librería de componentes**. 9 pantallas
y 2 componentes compartidos, ~10.000 líneas con ~2.350 de `StyleSheet` inline.

Lo mismo está dibujado una y otra vez:

| Patrón | Copias | Nombres distintos que usa hoy |
|---|---|---|
| Botón primario | **15** | `signInBtn`, `ctaBtn`, `saveBtn`, `confirmBtn`, `depositBtn`, `generateBtn`, `compareBtn`, `addBtn`, `searchBtn`, `detectAddBtn`, `refreshBtn`, `restoreBtn`, `lockedCta`, `clearBtn`, `addCatBtn` |
| Bottom sheet | **4** | `modalOverlay/modalCard/modalHandle` ×3 + `backdrop/sheet/handle` |
| Header con avatar | **5** | `topBar/topBarLeft/avatar/topBarTitle` |
| Bloque hero | **6** | `hero/heroTitle/heroSubtitle` |
| Empty state | **5** | `emptyCard`, `empty`, `emptyResults` — 3 esquemas de nombres |
| Chip / segmented | **6** | `catChip`, `chip`, `sortChip`, `itemChip`, `freqBtn`, `chartToggleBtn` |
| Input de texto | **7** | `input`, `inputRow`, `inputIcon`, `searchInput` |
| Barra de progreso | **3** | `progressBar/progressFill` vs `progressTrack/progressFill` |
| Anillo de progreso | **3** | `ringOverlay`, `ringContainer`, `ringOuter/ringInner` |
| Card de producto | **2** | `resultCard/resultImg/...` (Search) y `productCard/productImage/...` (Suggestions) — es el mismo componente con dos nombres |
| Badge mejor precio | **3** | `bestBadge/bestBadgeText` |

**Eso es lo que hay que arreglar.** No alcanza con repintar: hace falta un set de
componentes con estados definidos, y que las 9 pantallas se armen con ellos.

Tokens actuales (`frontend/src/theme.js`) — punto de partida, no restricción.
Podés proponer otra paleta:

- Fondo `#131313`, superficies `#0e0e0e` → `#353534` en 5 escalones
- Primary lavanda `#cdbdff`, container `#7c4dff`
- Secondary turquesa `#44ddc1` (es también `success` e `income`)
- Tertiary naranja `#ffb688` (es también `warning`)
- Danger `#ffb4ab` (es también `error` y `expense`)
- Texto `#e5e2e1` / `#cac3d8` / `#948ea1`
- `SPACING` 4·8·16·24·32·48 — `RADIUS` 8·12·16·20·24·full
- 3 sombras nombradas: `ambient` (negra), `nebula` (violeta), `gold` (ámbar, es
  el estado bloqueado-por-premium; se probó gris y se leía como roto)

Hay **66 colores hex distintos en el código y solo 41 en `theme.js`**: 25 están
hardcodeados sueltos. El diseño nuevo tiene que cerrar esa fuga.

---

## 4. Las 9 pantallas

Navegación: stack (`Login` | `Main` + `Sugerencias` + `Paywall`) envolviendo una
**tab bar flotante custom** de 6 tabs — no es la chrome default de React
Navigation, es un componente propio con animación spring y pill de fondo en el
tab activo.

Tabs: Wealth · Transactions · Goals · Subs · Search · Shopping

### 1. Dashboard (Wealth) — la más densa, 1.255 líneas
Selector de mes con flechas · card de balance (monto grande + ingresos/egresos) ·
gráfico con toggle · lista de categorías con barra de progreso de presupuesto y
estado de sobregiro · próximos vencimientos · lista de transacciones con icono,
categoría y monto en color según signo · sheet de alta/edición con toggle
ingreso/egreso, monto, y chips de categoría incluyendo crear categoría nueva.

Estados: vacío (sin resumen subido), cargando, filtrado por categoría.

### 2. Upload (Transactions)
Zona de drop/selección de PDF · anillo de progreso durante el parseo · nombre de
archivo y tag procesando · grilla de features · resultado con stats y preview de
transacciones parseadas.

Estados: idle, subiendo, procesando, listo, **bloqueado por premium**, error.
El parseo real puede fallar con PDFs modernos — el estado de error importa.

### 3. Goals (Metas)
Card resumen con anillo de progreso y porcentaje · cards de meta con anillo,
monto actual/objetivo, pill de racha, barra de progreso, proyección de fecha ·
estado completada · botón de depósito · card agregar meta · sheet de alta con
selector de icono horizontal.

### 4. Subscriptions (Subs) — 1.142 líneas
Card de suscripciones **detectadas automáticamente** con aceptar/descartar ·
próximos cobros con caja de fecha (día/mes) que cambia si es inminente · alerta
de aumento de precio · grilla bento con métricas · lista de facturas y de
suscripciones (activa/inactiva, badge de débito automático, badge de
recordatorio) · sheet de alta con selector de frecuencia.

### 5. Search (Buscar) — comparador, la parte más nueva
Chips de categoría (supermercado, farmacia, belleza, ropa, hogar) · input + botón
buscar · fila de stats (N productos en M tiendas) · chips de orden.

Cada resultado es un **grupo**, no un producto suelto: un producto canónico con
sus ofertas por tienda, expandible. Dentro, por tienda: nombre, precio, delta
contra el más barato, badge del mejor, y caso mismo-precio. Además: imagen o
placeholder, punto de color de la marca de la tienda, badge de descuento, precio
de lista tachado, precio por unidad, rango de precios, contador de tiendas.

Extras: aviso de sustitutos, skeletons durante la carga, empty state con acción
sugerida, y **teaser bloqueado por premium** con gradiente dorado.

**Pendiente de diseñar (el backend ya lo manda, la UI no existe):** badge de
veredicto **caro / normal / barato** — dice si el precio está alto *para ese
producto*, comparado contra el histórico oficial del MEF. Es un dato que ningún
competidor tiene. Necesita: los 3 estados, el % de diferencia y el rango
habitual.

### 6. Shopping (Compras) — comparador de lista
Input + chips de la lista con cantidad · sugerencias mientras escribís · botón
comparar con gradiente · card de carga con barra de progreso (el scrape tarda
5-12s, no es instantáneo) · **card carrito óptimo** con total y ahorro · por
ítem: mejor precio, tienda, nombre real del producto encontrado, otras tiendas ·
cards por tienda con total, badge de mejor, badge de parcial (le faltan ítems) y
desglose · disclaimer.

Y la `insightCard`: el cruce con el banco — cuánto gasta por mes, en qué tienda
compra habitualmente, cuánto ahorraría. Hay que marcar visualmente que la
proyección mensual **es una estimación**.

**Pendiente de diseñar:** sucursal más cercana por cadena (el backend lo manda
con lat/lng). "Tata es el más barato, a 600 m."

### 7. Suggestions (Sugerencias) — premium, fuera de tabs
Sugerencias de ahorro generadas por IA: card de ahorro estimado mensual/anual,
lista numerada con tag, categoría y monto, botón regenerar.

### 8. Login
Glows de fondo, logo, formulario, botones sociales, toggle de idioma.

### 9. Paywall + UpgradeModal
Hero con diamante, lista de features, card de precio con badge de trial, CTA con
gradiente, restaurar compras. El `UpgradeModal` es la versión sheet de lo mismo —
deberían compartir componentes y hoy no lo hacen.

---

## 5. Qué necesito de vuelta

**Un set de componentes con todos sus estados**, no mockups de pantalla. Mínimo:

1. **Botón** — primario / secundario / ghost / destructivo, 3 tamaños, con icono,
   y estados: normal, presionado, cargando, deshabilitado, **bloqueado-premium**
   (dorado, no gris).
2. **Card** — base, elevada, seleccionada, mejor-opción, parcial/advertencia.
3. **Input** — solo, con icono, con prefijo `$`, con error, con sugerencias.
4. **Chip** — filtro (on/off), orden, ítem de lista con cantidad y borrar,
   segmented control.
5. **Badge / pill** — tienda (con color de marca), descuento, mejor precio,
   premium, veredicto caro/normal/barato, racha, estado.
6. **Bottom sheet** — con handle, título, subtítulo, scroll interno, fila de
   acciones. Uno solo, no cuatro.
7. **Fila de producto/oferta** — imagen o placeholder, nombre a 2 líneas, tienda,
   precio, precio tachado, precio por unidad, delta.
8. **Progreso** — barra (normal y sobregiro) y anillo (3 tamaños).
9. **Empty state** — icono, título, texto, acción. Uno solo, no cinco.
10. **Skeleton** — para fila de producto y para card.
11. **Header de pantalla** — título, subtítulo, avatar, acción derecha.
12. **Tab bar flotante** — 6 items, activo con pill y spring.

Más: escala tipográfica, escala de espaciado, y la paleta como tokens con nombres
semánticos.

**Entregado como tokens que se puedan mapear a `COLORS` / `SPACING` / `RADIUS` /
`SHADOWS`.** Si vuelve con valores sueltos, hay que traducir 9 pantallas a mano.

---

## 6. Qué NO tocar

- Los 6 tabs y su orden. Es la navegación aprendida.
- Los colores de marca de las tiendas: son la identidad de cada cadena y sirven
  para escanear resultados rápido.
- La honestidad de los números. Hay reglas deliberadas atrás: un total menor por
  tener menos productos no es un ahorro, la proyección mensual es una estimación,
  el promedio se calcula sobre los meses con datos. El diseño no puede esconder
  esas aclaraciones para que quede más limpio.
