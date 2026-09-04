/**
 * Set de evaluación de precisión: búsquedas reales de usuarios uruguayos con
 * aserciones sobre el resultado esperado.
 *
 * POR QUÉ SON ASERCIONES Y NO RESULTADOS FIJOS: el catálogo de las tiendas
 * cambia todos los días (stock, precios, nombres). Una lista de "estos son
 * los productos correctos para esta búsqueda" se pudre en una semana. En
 * cambio "ningún resultado de 'leche' puede ser dulce de leche" sigue siendo
 * verdad para siempre.
 *
 * Vocabulario de aserciones:
 *   minResults      cantidad mínima de resultados
 *   expectEmpty     debe devolver 0 (producto que no se vende acá)
 *   allMatch        TODO resultado debe matchear este regex
 *   noneMatch       NINGÚN resultado puede matchear este regex
 *   topMatch        el primer resultado debe matchear este regex
 *   allHaveUnit     todo resultado debe traer precio por unidad
 *   qty             todo resultado debe tener esta cantidad {qty, base}
 *   maxPrice        cota superior de cordura (detecta que se coló otra cosa)
 *   minPrice        cota inferior (detecta accesorios/placeholders baratos)
 *   noVariantMix    ningún grupo puede mezclar variantes excluyentes
 *
 * Al fallar un caso: revisar PRIMERO si la aserción está bien escrita antes
 * de tocar el algoritmo. Varias veces el bug estuvo en el test.
 */

// Accesorios/complementos que nunca deberían ganar una búsqueda del producto
const ACCESORIO = /funda|estuche|protector|cargador|cable\b|soporte|correa|joystick|control remoto|adaptador|repuesto|filtro para/i;

module.exports = [
  // ─── A. Supermercado: la compra semanal ─────────────────────────
  { q: 'leche', cat: 'supermercado', minResults: 5, allMatch: /leche/i, noneMatch: /dulce de leche|crema de leche|chocolate|baton|alfajor/i, allHaveUnit: true },
  { q: 'pan lactal', cat: 'supermercado', minResults: 3, allMatch: /pan/i },
  { q: 'arroz', cat: 'supermercado', minResults: 5, allMatch: /arroz/i, allHaveUnit: true },
  { q: 'fideos', cat: 'supermercado', minResults: 5, allMatch: /fideo|pasta/i },
  { q: 'aceite', cat: 'supermercado', minResults: 5, allMatch: /aceite/i },
  { q: 'azucar', cat: 'supermercado', minResults: 3, allMatch: /azucar/i },
  { q: 'sal fina', cat: 'supermercado', minResults: 2, allMatch: /sal/i },
  { q: 'harina', cat: 'supermercado', minResults: 3, allMatch: /harina/i },
  { q: 'yerba', cat: 'supermercado', minResults: 5, allMatch: /yerba/i, allHaveUnit: true },
  { q: 'cafe', cat: 'supermercado', minResults: 3, allMatch: /cafe/i },
  { q: 'huevos', cat: 'supermercado', minResults: 2, allMatch: /huevo/i },
  { q: 'manteca', cat: 'supermercado', minResults: 3, allMatch: /manteca/i },
  { q: 'queso', cat: 'supermercado', minResults: 5, allMatch: /queso/i },
  { q: 'atun', cat: 'supermercado', minResults: 3, allMatch: /atun/i },
  { q: 'galletitas', cat: 'supermercado', minResults: 3, allMatch: /galletit|galleta/i },
  { q: 'papel higienico', cat: 'supermercado', minResults: 5, allMatch: /papel higienico/i, allHaveUnit: true },
  { q: 'detergente', cat: 'supermercado', minResults: 3, allMatch: /detergente|lavavajilla/i },
  { q: 'jabon en polvo', cat: 'supermercado', minResults: 2, allMatch: /jabon|polvo/i },
  { q: 'shampoo', cat: 'supermercado', minResults: 2, allMatch: /shampoo|champu/i },
  { q: 'pañales', cat: 'supermercado', minResults: 3, allMatch: /panal|pañal/i },

  // ─── B. Con marca: lo que la gente busca de verdad ───────────────
  { q: 'yerba canarias', cat: 'supermercado', minResults: 2, allMatch: /canarias/i, allHaveUnit: true },
  { q: 'leche conaprole', cat: 'supermercado', minResults: 3, allMatch: /conaprole/i, noneMatch: /dulce de leche/i },
  { q: 'coca cola', cat: 'supermercado', minResults: 5, allMatch: /coca.?cola/i },
  { q: 'arroz saman', cat: 'supermercado', minResults: 1, allMatch: /saman/i },
  { q: 'agua salus', cat: 'supermercado', minResults: 2, allMatch: /salus/i },
  { q: 'cerveza pilsen', cat: 'supermercado', minResults: 1, allMatch: /pilsen/i },
  { q: 'yerba sara', cat: 'supermercado', minResults: 1, allMatch: /sara/i },
  { q: 'fideos adria', cat: 'supermercado', minResults: 1, allMatch: /adria/i },
  { q: 'manteca conaprole', cat: 'supermercado', minResults: 1, allMatch: /conaprole/i },
  { q: 'nescafe', cat: 'supermercado', minResults: 1, allMatch: /nescafe/i },
  { q: 'nutella', cat: 'supermercado', minResults: 1, allMatch: /nutella/i },
  { q: 'coca cola zero', cat: 'supermercado', minResults: 2, allMatch: /coca.?cola/i, noVariantMix: true },

  // ─── C. Con cantidad: el caso donde el precio por unidad importa ──
  { q: 'coca cola 2 litros', cat: 'supermercado', minResults: 2, allMatch: /coca.?cola/i, qty: { qty: 2000, base: 'ml' }, allHaveUnit: true },
  { q: 'leche 1l', cat: 'supermercado', minResults: 3, allMatch: /leche/i, qty: { qty: 1000, base: 'ml' }, allHaveUnit: true },
  { q: 'arroz 1kg', cat: 'supermercado', minResults: 2, allMatch: /arroz/i, qty: { qty: 1000, base: 'g' } },
  { q: 'yerba 1 kilo', cat: 'supermercado', minResults: 2, allMatch: /yerba/i, qty: { qty: 1000, base: 'g' } },
  { q: 'azucar 1kg', cat: 'supermercado', minResults: 1, allMatch: /azucar/i, qty: { qty: 1000, base: 'g' } },
  { q: 'harina 1kg', cat: 'supermercado', minResults: 1, allMatch: /harina/i, qty: { qty: 1000, base: 'g' } },
  { q: 'aceite 900ml', cat: 'supermercado', minResults: 1, allMatch: /aceite/i, qty: { qty: 900, base: 'ml' } },
  { q: 'agua 2 litros', cat: 'supermercado', minResults: 2, allMatch: /agua/i, qty: { qty: 2000, base: 'ml' } },
  { q: 'fideos 500g', cat: 'supermercado', minResults: 1, allMatch: /fideo|pasta/i, qty: { qty: 500, base: 'g' } },
  { q: 'leche 3 litros', cat: 'supermercado', minResults: 1, allMatch: /leche/i, qty: { qty: 3000, base: 'ml' } },
  { q: 'yogur 1 litro', cat: 'supermercado', minResults: 1, allMatch: /yogur/i, qty: { qty: 1000, base: 'ml' } },
  { q: 'sal 500g', cat: 'supermercado', minResults: 1, allMatch: /sal/i, qty: { qty: 500, base: 'g' } },

  // ─── D. Trampas semánticas: "X de Y" no es X ─────────────────────
  { q: 'dulce de leche', cat: 'supermercado', minResults: 2, allMatch: /dulce de leche/i, label: 'la inversa: acá SÍ debe traerlo' },
  { q: 'crema', cat: 'supermercado', minResults: 3, allMatch: /crema/i },
  { q: 'chocolate', cat: 'supermercado', minResults: 3, allMatch: /chocolate|bombon/i },
  { q: 'coco', cat: 'supermercado', minResults: 1, allMatch: /coco/i },
  { q: 'limon', cat: 'supermercado', minResults: 1, allMatch: /limon/i },
  { q: 'naranja', cat: 'supermercado', minResults: 1, allMatch: /naranja/i },
  { q: 'frutilla', cat: 'supermercado', minResults: 1, allMatch: /frutilla/i },
  { q: 'vainilla', cat: 'supermercado', minResults: 1, allMatch: /vainilla/i },
  { q: 'miel', cat: 'supermercado', minResults: 1, allMatch: /miel/i },
  { q: 'avena', cat: 'supermercado', minResults: 1, allMatch: /avena/i },

  // ─── E. Farmacia ────────────────────────────────────────────────
  { q: 'paracetamol', cat: 'farmacia', minResults: 3, allMatch: /paracetamol|perifar|dolotandax/i },
  // Sin allMatch a proposito: el respaldo de buscador de tienda (ver
  // routes/prices.js) devuelve las marcas con que se vende el generico
  // -- Perifar, Actron, Ibupirac, Privalgia -- y ninguna lleva la palabra
  // "ibuprofeno" en el nombre. Exigirla media mi lista de marcas, no la
  // relevancia. Lo que si se puede afirmar es que sean medicamentos.
  { q: 'ibuprofeno', cat: 'farmacia', minResults: 2, noneMatch: /shampoo|perfume|panal|cepillo|maquillaje/i },
  { q: 'aspirina', cat: 'farmacia', minResults: 1, allMatch: /aspirina|aas/i },
  { q: 'protector solar', cat: 'farmacia', minResults: 3, allMatch: /protector solar|solar/i },
  { q: 'alcohol en gel', cat: 'farmacia', minResults: 3, allMatch: /alcohol/i },
  { q: 'alcohol', cat: 'farmacia', minResults: 3, allMatch: /alcohol/i },
  { q: 'algodon', cat: 'farmacia', minResults: 1, allMatch: /algodon/i },
  { q: 'curitas', cat: 'farmacia', minResults: 1, allMatch: /curita|aposito|banda/i },
  { q: 'vitamina c', cat: 'farmacia', minResults: 2, allMatch: /vitamina/i },
  { q: 'omeprazol', cat: 'farmacia', minResults: 1, allMatch: /omeprazol/i },
  { q: 'suero fisiologico', cat: 'farmacia', minResults: 1, allMatch: /suero|fisiologic/i },
  { q: 'termometro', cat: 'farmacia', minResults: 1, allMatch: /termometro/i },

  // ─── F. Belleza ─────────────────────────────────────────────────
  { q: 'shampoo', cat: 'belleza', minResults: 5, allMatch: /shampoo|champu/i },
  { q: 'shampoo anticaspa', cat: 'belleza', minResults: 2, allMatch: /shampoo|champu/i },
  { q: 'acondicionador', cat: 'belleza', minResults: 3, allMatch: /acondicionador/i },
  { q: 'desodorante', cat: 'belleza', minResults: 5, allMatch: /desodorante|antitranspirante/i },
  { q: 'perfume', cat: 'belleza', minResults: 5, allMatch: /perfume|edt|edp|fragancia|colonia/i },
  { q: 'crema facial', cat: 'belleza', minResults: 3, allMatch: /crema/i },
  { q: 'crema de manos', cat: 'belleza', minResults: 1, allMatch: /crema/i },
  { q: 'jabon liquido', cat: 'belleza', minResults: 1, allMatch: /jabon/i },
  { q: 'esmalte de uñas', cat: 'belleza', minResults: 1, allMatch: /esmalte|uña/i },
  { q: 'cepillo de dientes', cat: 'belleza', minResults: 1, allMatch: /cepillo/i },
  { q: 'pasta dental', cat: 'belleza', minResults: 1, allMatch: /pasta|dental|dentifrico/i },
  { q: 'protector labial', cat: 'belleza', minResults: 1, allMatch: /labial|labios/i },

  // ─── G. Ropa ────────────────────────────────────────────────────
  { q: 'remera', cat: 'ropa', minResults: 3, allMatch: /remera|camiseta/i },
  { q: 'campera', cat: 'ropa', minResults: 3, allMatch: /campera|abrigo|chaqueta/i },
  { q: 'pantalon', cat: 'ropa', minResults: 2, allMatch: /pantalon|jean/i },
  { q: 'buzo', cat: 'ropa', minResults: 1, allMatch: /buzo|hoodie|canguro/i },
  { q: 'short', cat: 'ropa', minResults: 1, allMatch: /short|bermuda/i },
  { q: 'medias', cat: 'ropa', minResults: 1, allMatch: /media|calcetin/i },

  // ─── H. Hogar y tecnología: genéricos ───────────────────────────
  { q: 'heladera', cat: 'hogar', minResults: 5, allMatch: /heladera|refrigerador/i, minPrice: 5000, noneMatch: ACCESORIO },
  { q: 'lavarropas', cat: 'hogar', minResults: 3, allMatch: /lavarropas?|lavadora/i, minPrice: 5000 },
  { q: 'microondas', cat: 'hogar', minResults: 3, allMatch: /microondas/i, minPrice: 1500 },
  { q: 'aire acondicionado', cat: 'hogar', minResults: 5, allMatch: /aire acondicionado|split/i, minPrice: 5000 },
  { q: 'ventilador', cat: 'hogar', minResults: 3, allMatch: /ventilador/i },
  { q: 'licuadora', cat: 'hogar', minResults: 2, allMatch: /licuadora/i },
  { q: 'cafetera', cat: 'hogar', minResults: 3, allMatch: /cafetera/i },
  { q: 'freidora de aire', cat: 'hogar', minResults: 3, allMatch: /freidora/i },
  { q: 'aspiradora', cat: 'hogar', minResults: 3, allMatch: /aspiradora/i },
  { q: 'plancha', cat: 'hogar', minResults: 3, allMatch: /plancha/i },
  { q: 'smart tv', cat: 'hogar', minResults: 5, allMatch: /tv|televisor/i, minPrice: 5000, noneMatch: ACCESORIO },
  { q: 'notebook', cat: 'hogar', minResults: 5, allMatch: /notebook|laptop/i, minPrice: 5000, noneMatch: /mochila|bolso|funda|soporte|cooler/i },
  { q: 'monitor', cat: 'hogar', minResults: 3, allMatch: /monitor/i, minPrice: 800 },
  { q: 'termo', cat: 'hogar', minResults: 1, allMatch: /termo/i },

  // ─── I. Modelo específico: los casos difíciles ──────────────────
  { q: 'nintendo switch 2', cat: 'hogar', minResults: 2, allMatch: /switch 2/i, noneMatch: /joy.?con|volante|estuche|juego para|camara|funda/i, minPrice: 20000 },
  { q: 'playstation 5', cat: 'hogar', minResults: 2, allMatch: /ps5|playstation 5/i, noneMatch: /estacion de carga|portal|funda|joystick/i, minPrice: 20000 },
  { q: 'ps5', cat: 'hogar', minResults: 2, allMatch: /ps5/i, minPrice: 20000 },
  { q: 'iphone 16', cat: 'hogar', minResults: 2, allMatch: /iphone 16/i, noneMatch: /^funda|^protector|^cable/i, minPrice: 20000 },
  { q: 'iphone 13', cat: 'hogar', minResults: 2, allMatch: /iphone 13/i, minPrice: 10000 },
  { q: 'smart tv 55', cat: 'hogar', minResults: 3, allMatch: /55/i, minPrice: 8000 },
  { q: 'smart tv 43', cat: 'hogar', minResults: 2, allMatch: /43/i, minPrice: 5000 },
  { q: 'notebook i5', cat: 'hogar', minResults: 2, allMatch: /i5/i, minPrice: 8000 },
  { q: 'notebook i7', cat: 'hogar', minResults: 2, allMatch: /i7/i, minPrice: 8000 },
  { q: 'auriculares bluetooth', cat: 'hogar', minResults: 3, allMatch: /auricular/i },
  { q: 'parlante bluetooth', cat: 'hogar', minResults: 3, allMatch: /parlante|speaker/i },
  { q: 'tablet samsung', cat: 'hogar', minResults: 2, allMatch: /tablet|tab\b/i },
  { q: 'apple watch', cat: 'hogar', minResults: 2, allMatch: /watch/i },
  { q: 'airpods', cat: 'hogar', minResults: 1, allMatch: /airpod/i },
  { q: 'monitor gamer', cat: 'hogar', minResults: 3, allMatch: /monitor/i },
  { q: 'heladera samsung', cat: 'hogar', minResults: 1, allMatch: /samsung/i },

  // ─── J. Typos que la gente comete de verdad ─────────────────────
  { q: 'shampo', cat: 'belleza', minResults: 2, allMatch: /shampoo|champu/i, label: 'typo: falta una o' },
  { q: 'yogurt', cat: 'supermercado', minResults: 2, allMatch: /yogur/i, label: 'yogurt/yogur' },
  { q: 'aseite', cat: 'supermercado', minResults: 1, allMatch: /aceite/i, label: 'typo fonético' },
  { q: 'detergnte', cat: 'supermercado', minResults: 1, allMatch: /detergente/i, label: 'typo: falta una e' },
  { q: 'microndas', cat: 'hogar', minResults: 1, allMatch: /microondas/i, label: 'typo: falta una o' },
  { q: 'lavaropas', cat: 'hogar', minResults: 1, allMatch: /lavarropas?/i, label: 'typo: falta una r' },
  { q: 'panales', cat: 'supermercado', minResults: 2, allMatch: /panal|pañal/i, label: 'sin la ñ' },
  { q: 'galletas', cat: 'supermercado', minResults: 2, allMatch: /galletit|galleta/i, label: 'galletas/galletitas' },

  // ─── K. No se vende en Uruguay: debe devolver vacío, no basura ───
  { q: 'xbox series x', cat: 'hogar', expectEmpty: true, label: 'ninguna tienda tiene la consola' },
  { q: 'macbook pro m4', cat: 'hogar', minResults: 1, allMatch: /macbook/i, minPrice: 20000 },
  // ─── L. "Sin X" — el producto que NO tiene lo que buscás ─────────
  // "Pulpa de Tomate SIN AZÚCAR" contiene la palabra "azúcar" y matcheaba
  // la búsqueda de azúcar. Es literalmente el producto opuesto al pedido.
  { q: 'azucar', cat: 'supermercado', minResults: 3, noneMatch: /sin azucar/i, label: 'no "sin azúcar"' },
  { q: 'azucar 1kg', cat: 'supermercado', minResults: 1, noneMatch: /sin azucar/i, label: 'no "sin azúcar"' },
  { q: 'sal', cat: 'supermercado', minResults: 3, noneMatch: /sin sal/i, label: 'no "sin sal"' },
  { q: 'sal 500g', cat: 'supermercado', minResults: 1, noneMatch: /sin sal/i, label: 'no "sin sal"' },
  { q: 'lactosa', cat: 'supermercado', minResults: 1, label: 'buscar "lactosa" SÍ debe traer deslactosados' },
  { q: 'gluten', cat: 'supermercado', minResults: 1, label: 'idem: "sin gluten" es válido acá' },

  // ─── M. Regresión: bugs ya arreglados que no pueden volver ───────
  { q: 'leche', cat: 'supermercado', minResults: 5, noneMatch: /chocolate|baton|alfajor|helado/i, label: 'regresión: "chocolate de leche"' },
  { q: 'agua 2 litros', cat: 'supermercado', minResults: 1, noneMatch: /lavandina|desodorante/i, label: 'regresión: lavandina no es agua' },
  { q: 'leche 3 litros', cat: 'supermercado', minResults: 1, noneMatch: /helado/i, label: 'regresión: helado no es leche' },
  { q: 'smart tv', cat: 'hogar', minResults: 5, noneMatch: /soporte|rack|control remoto/i, label: 'regresión: accesorios de TV' },
  { q: 'nintendo switch 2', cat: 'hogar', minResults: 1, noneMatch: /joy.?con|volante/i, label: 'regresión: el bug original' },
  { q: 'notebook i5', cat: 'hogar', minResults: 1, noneMatch: /\bi7\b|\bi3\b/i, label: 'regresión: i5 no es i7' },
  { q: 'notebook i7', cat: 'hogar', minResults: 1, noneMatch: /\bi5\b|\bi3\b/i, label: 'regresión: i7 no es i5' },
  { q: 'coca cola 2 litros', cat: 'supermercado', minResults: 1, qty: { qty: 2000, base: 'ml' }, label: 'regresión: "2 L" = "2 litros"' },

  // ─── N. Substring accidental (reportado probando a mano) ────────
  // "ipad" salia 1ro un "DISipADOr CPU Cougar": la palabra contiene el token
  // como substring, y eso ademas disparaba los bonus de frase exacta y de
  // sustantivo principal, mandandolo al tope del ranking.
  { q: 'ipad', cat: 'hogar', minResults: 2, allMatch: /ipad/i, noneMatch: /disipador|cooler|teclado|keyboard/i, label: 'regresion: ipad en disipador' },
  { q: 'ipad air', cat: 'hogar', minResults: 1, noneMatch: /keyboard|teclado|funda|lapiz|pencil/i, label: 'regresion: periferico gana' },
  { q: 'sal', cat: 'supermercado', minResults: 3, allMatch: /\bsal\b|\bsales\b/i, noneMatch: /salsa/i, label: 'regresion: sal en salsa' },
  { q: 'pan', cat: 'supermercado', minResults: 3, noneMatch: /pantalon|panal/i, label: 'regresion: pan en pantalon' },
  { q: 'teclado', cat: 'hogar', minResults: 2, label: 'buscar el accesorio SI debe traerlo' },
  { q: 'auriculares', cat: 'hogar', minResults: 2, label: 'idem: accesorio pedido explicitamente' },

  // Reportado probando a mano: los 4 Apple Pencil reales quedaban marcados
  // como accesorio ajeno porque el producto dice "Lapiz" y la busqueda dice
  // "pencil", y el lookup de sinonimos iba en una sola direccion. Sintoma
  // intermitente segun la categoria (ver queryAsksFor en productMatcher.js).
  { q: 'apple pencil', cat: 'hogar', minResults: 2, allMatch: /pencil|lapiz/i, minPrice: 2000, label: 'regresion: sinonimo bidireccional' },
  { q: 'ipad', cat: 'hogar', minResults: 2, noneMatch: /pencil|lapiz|keyboard|teclado/i, label: 'y el lapiz SIGUE siendo accesorio del ipad' },

  // ─── N2. Encontrados por scripts/audit-disagreement.js ──────────
  // Ninguno de estos lo cazaba la bateria: los encontro la auditoria sin
  // etiquetas comparando lo que eligen las dos rutas para la misma busqueda.
  { q: 'manteca', cat: 'supermercado', minResults: 3, noneMatch: /poroto|lata/i, label: 'regresion: poroto manteca no es manteca' },
  { q: 'heladera', cat: 'hogar', minResults: 3, noneMatch: /caja|organizador|bandeja|iman/i, minPrice: 5000, label: 'regresion: organizador de heladera' },
  { q: 'refresco', cat: 'supermercado', minResults: 3, noneMatch: /\bpolvo\b|sobre/i, label: 'regresion: Tang en polvo vs botella' },
  { q: 'arroz', cat: 'supermercado', minResults: 3, noneMatch: /harina de arroz|leche de arroz/i, label: 'regresion: harina de arroz no es arroz' },
  { q: 'queso', cat: 'supermercado', minResults: 3, noneMatch: /ravioles|sorrentinos|tarta/i, label: 'regresion: relleno de queso no es queso' },

  // ─── O. Frescos y carniceria ────────────────────────────────────
  { q: 'carne picada', cat: 'supermercado', minResults: 2, allMatch: /carne|picad|molid/i },
  { q: 'milanesas', cat: 'supermercado', minResults: 2, allMatch: /milanesa/i },
  { q: 'pollo', cat: 'supermercado', minResults: 3, allMatch: /pollo|pechuga|suprema|pata|muslo/i },
  { q: 'pechuga de pollo', cat: 'supermercado', minResults: 1, allMatch: /pechuga|pollo/i },
  { q: 'chorizo', cat: 'supermercado', minResults: 2, allMatch: /chorizo/i },
  { q: 'salchichas', cat: 'supermercado', minResults: 2, allMatch: /salchicha|pancho/i },
  { q: 'jamon', cat: 'supermercado', minResults: 3, allMatch: /jamon/i },
  { q: 'mortadela', cat: 'supermercado', minResults: 1, allMatch: /mortadela/i },
  { q: 'panceta', cat: 'supermercado', minResults: 1, allMatch: /panceta|bacon/i },
  { q: 'pescado', cat: 'supermercado', minResults: 1, allMatch: /pescado|merluza|salmon|filet|atun/i },
  { q: 'muzzarella', cat: 'supermercado', minResults: 2, allMatch: /muzzarella|mozzarella/i },

  // ─── P. Frutas y verduras ───────────────────────────────────────
  { q: 'papa', cat: 'supermercado', minResults: 2, allMatch: /papa/i },
  { q: 'cebolla', cat: 'supermercado', minResults: 1, allMatch: /cebolla/i },
  { q: 'tomate', cat: 'supermercado', minResults: 2, allMatch: /tomate/i },
  { q: 'zanahoria', cat: 'supermercado', minResults: 1, allMatch: /zanahoria/i },
  { q: 'manzana', cat: 'supermercado', minResults: 1, allMatch: /manzana/i },
  { q: 'banana', cat: 'supermercado', minResults: 1, allMatch: /banana/i },
  { q: 'lechuga', cat: 'supermercado', minResults: 1, allMatch: /lechuga/i },
  { q: 'palta', cat: 'supermercado', minResults: 1, allMatch: /palta|aguacate/i },
  { q: 'zapallo', cat: 'supermercado', minResults: 1, allMatch: /zapallo|calabaza/i },
  { q: 'boniato', cat: 'supermercado', minResults: 1, allMatch: /boniato|batata/i },

  // ─── Q. Congelados y almacen ────────────────────────────────────
  { q: 'papas congeladas', cat: 'supermercado', minResults: 1, allMatch: /papa/i },
  { q: 'pizza congelada', cat: 'supermercado', minResults: 1, allMatch: /pizza/i },
  { q: 'nuggets', cat: 'supermercado', minResults: 1, allMatch: /nugget/i },
  { q: 'lentejas', cat: 'supermercado', minResults: 1, allMatch: /lenteja/i },
  { q: 'garbanzos', cat: 'supermercado', minResults: 1, allMatch: /garbanzo/i },
  { q: 'polenta', cat: 'supermercado', minResults: 1, allMatch: /polenta/i },
  { q: 'pure de tomate', cat: 'supermercado', minResults: 2, allMatch: /tomate/i },
  { q: 'mayonesa', cat: 'supermercado', minResults: 2, allMatch: /mayonesa/i },
  { q: 'ketchup', cat: 'supermercado', minResults: 1, allMatch: /ketchup|catsup/i },
  { q: 'mostaza', cat: 'supermercado', minResults: 1, allMatch: /mostaza/i },
  { q: 'aceitunas', cat: 'supermercado', minResults: 1, allMatch: /aceituna/i },
  { q: 'vinagre', cat: 'supermercado', minResults: 1, allMatch: /vinagre/i },
  { q: 'mermelada', cat: 'supermercado', minResults: 1, allMatch: /mermelada|dulce/i },
  { q: 'cereales', cat: 'supermercado', minResults: 1, allMatch: /cereal|copos|granola|avena/i },

  // ─── R. Bebidas ─────────────────────────────────────────────────
  { q: 'jugo', cat: 'supermercado', minResults: 3, allMatch: /jugo|nectar/i },
  { q: 'vino tinto', cat: 'supermercado', minResults: 2, allMatch: /vino|tinto|tannat|cabernet|merlot/i },
  { q: 'whisky', cat: 'supermercado', minResults: 1, allMatch: /whisky|whiskey/i },
  { q: 'vodka', cat: 'supermercado', minResults: 1, allMatch: /vodka/i },
  { q: 'agua mineral', cat: 'supermercado', minResults: 3, allMatch: /agua/i, noneMatch: /lavandina|oxigenada|jane/i, label: 'trampa: lavandina no es agua mineral' },
  { q: 'agua con gas', cat: 'supermercado', minResults: 2, allMatch: /agua/i, noneMatch: /lavandina|jane/i },
  { q: 'sprite', cat: 'supermercado', minResults: 1, allMatch: /sprite/i },
  { q: 'pepsi', cat: 'supermercado', minResults: 1, allMatch: /pepsi/i },

  // ─── S. Limpieza del hogar ──────────────────────────────────────
  { q: 'lavandina', cat: 'supermercado', minResults: 2, allMatch: /lavandina|hipoclorito/i, label: 'la inversa: aca SI debe traerla' },
  { q: 'suavizante', cat: 'supermercado', minResults: 1, allMatch: /suavizante/i },
  { q: 'esponja', cat: 'supermercado', minResults: 1, allMatch: /esponja/i },
  { q: 'bolsas de residuo', cat: 'supermercado', minResults: 1, allMatch: /bolsa/i },
  { q: 'servilletas', cat: 'supermercado', minResults: 1, allMatch: /servilleta/i },
  { q: 'rollo de cocina', cat: 'supermercado', minResults: 1, allMatch: /rollo|cocina|papel/i },
  { q: 'insecticida', cat: 'supermercado', minResults: 1, allMatch: /insecticida|raid|mata|mosquito/i },

  // ─── T. Bebe y mascotas ─────────────────────────────────────────
  { q: 'toallitas humedas', cat: 'supermercado', minResults: 1, allMatch: /toallit|humed/i },
  { q: 'alimento para perro', cat: 'supermercado', minResults: 1, allMatch: /perro|dog|can|pedigree|dogui/i },
  { q: 'alimento para gato', cat: 'supermercado', minResults: 1, allMatch: /gato|cat|felin|whiskas/i },
  { q: 'arena para gatos', cat: 'supermercado', minResults: 1, allMatch: /arena|piedra|sanitaria|gato/i },

  // ─── U. Farmacia ampliada ───────────────────────────────────────
  { q: 'diclofenac', cat: 'farmacia', minResults: 1, noneMatch: /shampoo|perfume|panal|maquillaje/i },
  { q: 'amoxicilina', cat: 'farmacia', minResults: 1, noneMatch: /shampoo|perfume|maquillaje/i },
  { q: 'jarabe para la tos', cat: 'farmacia', minResults: 1, allMatch: /jarabe|tos|bisolvon|notusin|ambroxol/i },
  { q: 'gasas', cat: 'farmacia', minResults: 1, allMatch: /gasa|aposito/i },
  { q: 'agua oxigenada', cat: 'farmacia', minResults: 1, allMatch: /oxigenada|peroxido/i },
  { q: 'repelente', cat: 'farmacia', minResults: 1, allMatch: /repelente|off|mosquito/i },
  { q: 'preservativos', cat: 'farmacia', minResults: 1, allMatch: /preservativo|condon|prime|tulipan/i },
  { q: 'test de embarazo', cat: 'farmacia', minResults: 1, allMatch: /embarazo|test/i },
  { q: 'jeringa', cat: 'farmacia', minResults: 1, allMatch: /jeringa/i },
  { q: 'barbijo', cat: 'farmacia', minResults: 1, allMatch: /barbijo|tapaboca|mascarilla|n95/i },
  { q: 'vitamina d', cat: 'farmacia', minResults: 1, allMatch: /vitamina|calcio/i },
  { q: 'magnesio', cat: 'farmacia', minResults: 1, allMatch: /magnesio/i },

  // ─── V. Belleza ampliada ────────────────────────────────────────
  { q: 'crema hidratante', cat: 'belleza', minResults: 2, allMatch: /crema|hidrat|locion/i },
  { q: 'serum facial', cat: 'belleza', minResults: 1, allMatch: /serum|facial/i },
  { q: 'agua micelar', cat: 'belleza', minResults: 1, allMatch: /micelar|agua/i },
  { q: 'mascarilla capilar', cat: 'belleza', minResults: 1, allMatch: /mascarilla|capilar|tratamiento|pelo|cabello/i },
  { q: 'tintura para el pelo', cat: 'belleza', minResults: 1, allMatch: /tintura|coloracion|color|koleston|nutrisse/i },
  { q: 'base de maquillaje', cat: 'belleza', minResults: 1, allMatch: /base|maquillaje|foundation/i },
  { q: 'rimel', cat: 'belleza', minResults: 1, allMatch: /rimel|mascara|pestan/i },
  { q: 'delineador', cat: 'belleza', minResults: 1, allMatch: /delineador|eyeliner/i },
  { q: 'quitaesmalte', cat: 'belleza', minResults: 1, allMatch: /quitaesmalte|acetona|removedor/i },
  { q: 'gel de ducha', cat: 'belleza', minResults: 1, allMatch: /gel|ducha|bano|body/i },
  { q: 'talco', cat: 'belleza', minResults: 1, allMatch: /talco/i },
  { q: 'hilo dental', cat: 'belleza', minResults: 1, allMatch: /hilo|seda|dental/i },
  { q: 'enjuague bucal', cat: 'belleza', minResults: 1, allMatch: /enjuague|bucal|listerine/i },
  { q: 'colonia', cat: 'belleza', minResults: 2, allMatch: /colonia|perfume|edt|fragancia/i },

  // ─── W. Ropa ampliada ───────────────────────────────────────────
  { q: 'jean', cat: 'ropa', minResults: 2, allMatch: /jean|pantalon|denim/i },
  { q: 'vestido', cat: 'ropa', minResults: 2, allMatch: /vestido/i },
  { q: 'camisa', cat: 'ropa', minResults: 2, allMatch: /camisa/i },
  { q: 'pollera', cat: 'ropa', minResults: 1, allMatch: /pollera|falda/i },
  { q: 'zapatillas', cat: 'ropa', minResults: 1, allMatch: /zapatilla|championes|sneaker|calzado/i },
  { q: 'gorro', cat: 'ropa', minResults: 1, allMatch: /gorro|gorra|sombrero/i },
  { q: 'bufanda', cat: 'ropa', minResults: 1, allMatch: /bufanda|chalina/i },
  { q: 'ropa interior', cat: 'ropa', minResults: 1, allMatch: /interior|calzoncillo|bombacha|slip|boxer|culotte/i },
  { q: 'malla', cat: 'ropa', minResults: 1, allMatch: /malla|bikini|banador|bano/i },
  { q: 'campera de abrigo', cat: 'ropa', minResults: 1, allMatch: /campera|abrigo|chaqueta|parka/i },

  // ─── X. Tecnologia y hogar ampliado ─────────────────────────────
  { q: 'tostadora', cat: 'hogar', minResults: 2, allMatch: /tostadora|tostador/i },
  { q: 'batidora', cat: 'hogar', minResults: 1, allMatch: /batidora|mixer/i },
  { q: 'procesadora', cat: 'hogar', minResults: 1, allMatch: /procesador|multiprocesador/i },
  { q: 'pava electrica', cat: 'hogar', minResults: 1, allMatch: /pava|jarra|hervidor|kettle/i },
  { q: 'estufa', cat: 'hogar', minResults: 2, allMatch: /estufa|calefactor|caloventor/i },
  { q: 'anafe', cat: 'hogar', minResults: 1, allMatch: /anafe|cocina|hornalla/i },
  { q: 'horno electrico', cat: 'hogar', minResults: 1, allMatch: /horno/i },
  { q: 'secador de pelo', cat: 'hogar', minResults: 1, allMatch: /secador/i },
  { q: 'impresora', cat: 'hogar', minResults: 2, allMatch: /impresora|multifuncion/i },
  { q: 'router wifi', cat: 'hogar', minResults: 1, allMatch: /router|repetidor|wifi|mesh/i },
  { q: 'disco duro externo', cat: 'hogar', minResults: 1, allMatch: /disco|hdd|ssd|externo/i },
  { q: 'pendrive', cat: 'hogar', minResults: 1, allMatch: /pendrive|usb|flash/i },
  { q: 'camara de seguridad', cat: 'hogar', minResults: 1, allMatch: /camara|seguridad|vigilancia/i },
  { q: 'smartwatch', cat: 'hogar', minResults: 2, allMatch: /smartwatch|reloj|watch|band/i },
  { q: 'celular samsung', cat: 'hogar', minResults: 2, allMatch: /samsung|galaxy/i, minPrice: 3000 },
  { q: 'celular motorola', cat: 'hogar', minResults: 1, allMatch: /motorola|moto/i, minPrice: 3000 },
  { q: 'colchon', cat: 'hogar', minResults: 2, allMatch: /colchon/i, minPrice: 800, label: 'los inflables son colchones reales: la cota estaba mal' },
  { q: 'sillon', cat: 'hogar', minResults: 1, allMatch: /sillon|sofa|butaca/i },
  { q: 'silla de escritorio', cat: 'hogar', minResults: 1, allMatch: /silla/i },
];
