/**
 * Casos etiquetados para el categorizador.
 *
 * DE DONDE SALEN LAS ETIQUETAS, dicho derecho: las escribi a mano a partir de
 * comercios uruguayos conocidos, NO de resumenes reales de usuarios. Eso las
 * hace utiles como red de regresion y flojas como estimacion de la precision en
 * produccion: un resumen del banco escribe "COMPRA 1234 DISCO POCITOS 12/09" y
 * no "Disco". Las etiquetas de verdad van a venir de las correcciones que haga
 * la gente en la app (PATCH /api/transactions/:id con category) — ese es el
 * unico corpus real que va a existir, igual que search_log para el buscador.
 *
 * Cada caso: [descripcion, categoria esperada, nota opcional].
 * La seccion T son trampas: casos donde equivocarse es caro o donde la regla
 * actual es demasiado amplia.
 */
module.exports = [
  // A. Supermercado
  ['COMPRA DISCO POCITOS',                'Supermercado'],
  ['DEVOTO EXPRESS CORDON',               'Supermercado'],
  ['GEANT SHOPPING',                      'Supermercado'],
  ['TIENDA INGLESA CARRASCO',             'Supermercado'],
  ['TA-TA MALDONADO',                     'Supermercado'],
  ['EL DORADO CENTRO',                    'Supermercado'],
  ['MULTIAHORRO HOGAR',                   'Supermercado'],
  ['SUPERMERCADO MACRO',                  'Supermercado'],

  // B. Restaurantes y delivery
  ['PEDIDOSYA',                           'Restaurantes'],
  ['PEDIDOS YA URUGUAY',                  'Restaurantes'],
  ['RAPPI URUGUAY',                       'Restaurantes'],
  ['MCDONALDS PUNTA CARRETAS',            'Restaurantes'],
  ['BURGER KING 18 DE JULIO',             'Restaurantes'],
  ['PIZZA HUT',                           'Restaurantes'],
  ['RESTAURANT LA PASIVA',                'Restaurantes'],
  ['SUSHI CLUB',                          'Restaurantes'],

  // C. Transporte y combustible
  ['ANCAP LAGOMAR',                       'Transporte'],
  ['ESTACION ANCAP RUTA 8',               'Transporte'],
  ['AXION ENERGY',                        'Transporte'],
  ['PETROBRAS CARRASCO',                  'Transporte'],
  ['UBER TRIP',                           'Transporte'],
  ['CABIFY',                              'Transporte'],
  ['CUTCSA',                              'Transporte'],
  ['PEAJE RUTA INTERBALNEARIA',           'Transporte'],

  // D. Servicios publicos
  ['UTE FACTURA 09/2026',                 'Servicios'],
  ['ANTEL HOGAR',                         'Servicios'],
  ['OSE SANEAMIENTO',                     'Servicios'],
  ['MONTEVIDEO GAS',                      'Servicios'],

  // E. Salud
  ['FARMACIA SAN ROQUE',                  'Salud'],
  ['FARMASHOP 145',                       'Salud'],
  ['MEDICA URUGUAYA',                     'Salud'],
  ['MUTUALISTA ESPANOLA',                 'Salud'],
  ['HOSPITAL BRITANICO',                  'Salud'],
  ['FONASA APORTE',                        'Salud'],

  // F. Streaming
  ['NETFLIX.COM',                         'Streaming'],
  ['SPOTIFY P2A3B',                       'Streaming'],
  ['DISNEY +',                            'Streaming'],
  ['HBO MAX',                             'Streaming'],
  ['YOUTUBE PREMIUM',                     'Streaming'],

  // G. Resto de las categorias
  ['SMART FIT MONTEVIDEO',                'Deporte'],
  ['MEGATLON CUOTA',                      'Deporte',        'la marca gana sobre "cuota"'],
  ['MOVIE CINEMAS PUNTA CARRETAS',        'Entretenimiento'],
  ['TEATRO SOLIS',                        'Entretenimiento'],
  ['ZARA MONTEVIDEO SHOPPING',            'Ropa'],
  ['KOAJ',                                'Ropa'],
  ['ZAPATILLAS NIKE',                     'Ropa'],
  ['UNIVERSIDAD ORT',                     'Educación'],
  ['COLEGIO Y LICEO',                     'Educación'],
  ['CURSO DE INGLES',                     'Educación'],
  ['ALQUILER SETIEMBRE',                  'Vivienda'],
  ['CUOTA PRESTAMO BROU',                 'Préstamos'],
  ['HIPOTECA BHU',                        'Préstamos'],
  ['SEGURO SURA AUTO',                    'Seguros'],
  ['POLIZA BSE',                          'Seguros'],
  ['SUELDO SETIEMBRE 2026',               'Salario'],
  ['HABERES MES 09',                      'Salario'],
  ['TRANSFERENCIA RECIBIDA',              'Transferencia'],
  ['DEPOSITO EN EFECTIVO',                'Transferencia'],

  // T. Trampas — aca equivocarse cuesta caro
  ['PAGO TARJETA VISA',                   'Otros',          'pagar la tarjeta no es un ingreso'],
  ['MERCADO PAGO',                        'Otros',          '"pago" no puede significar ingreso'],
  ['ABITAB COBRANZA',                     'Otros',          'una red de cobranza no dice que se pago'],
  ['REDPAGOS',                            'Otros'],
  ['AGUA MINERAL SALUS 2L',               'Otros',          'comprar agua no es el servicio de agua'],
  ['GASEOSA COCA COLA',                   'Otros',          '"gas" no puede matchear adentro de gaseosa'],
  ['TRANSFERENCIA SUELDO SETIEMBRE',      'Salario',        'el sueldo gana sobre el medio de pago'],
  ['COMPRA CREDITO DISCO POCITOS',        'Supermercado',   '"credito" es el medio, no un prestamo'],
  ['PAGO CUOTA GIMNASIO',                 'Deporte',        '"cuota" no lo convierte en prestamo'],
  ['CINE CENTER',                         'Entretenimiento'],
  ['RETIRO CAJERO AUTOMATICO',            'Otros',          'no se sabe en que se gasto'],
  ['COMPRA EXTERIOR AMAZON',              'Otros'],

  // M. Regresion — uno por bug ya arreglado
  ['OSE FACTURA AGOSTO',                  'Servicios',      'el patron decia "osse", con dos eses'],
  ['CUTCSA ABONO',                        'Transporte',     '"cut[cs]a" no matchea CUTCSA'],
  ['FARMASHOP CENTRO',                    'Salud',          'la cadena mas grande del pais no estaba'],
  ['PEDIDOS YA',                          'Restaurantes',   'el banco lo escribe separado'],
  ['AGUA MINERAL SALUS',                  'Otros',          '"agua" suelto se comia cualquier compra de agua'],
  ['ANCAP SUPERGAS',                      'Servicios',      'la garrafa es del hogar; la nafta es Transporte'],
];
