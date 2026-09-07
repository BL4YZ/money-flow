/**
 * Clasificador de tipo de producto, con la taxonomía oficial del MEF.
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * Productos de familias distintas que comparten el sustantivo: "Agua Lavandina"
 * contra un agua mineral, "Puré de papas" contra "Puré de tomate". Ninguna regla
 * sobre el texto los separa — ya se intentó con cobertura de corpus y hubo que
 * revertirlo tras medir (ver requiredTokens en productMatcher.js). Hace falta
 * saber QUÉ ES cada producto, y eso es un dato, no una inferencia.
 *
 * CÓMO CLASIFICA, EN ORDEN DE CONFIANZA
 *
 *   1. Por MARCA. Es la señal fuerte y la que resuelve el caso difícil: el
 *      nombre "Lavandina Agua Jane 2Lt" empieza con "agua", pero la marca
 *      "Agua Jane" pertenece a hipoclorito según el catálogo oficial. Se busca
 *      la marca como frase completa, no como palabra suelta, justamente porque
 *      "agua jane" contiene "agua".
 *   2. Por las PALABRAS DEL TIPO. "Pan de molde lacteado" matchea un producto
 *      que diga "pan" y "molde", o "pan" y "lacteado".
 *
 * CÓMO SE USA: NUNCA COMO FILTRO DURO.
 *
 * Se compara la familia del producto contra las familias plausibles de la
 * búsqueda, y sólo cuando AMBAS se conocen. Si alguna es desconocida —el caso
 * más común, porque la canasta oficial son 379 productos y las tiendas venden
 * decenas de miles— no se opina. Un castigo sobre una señal parcial es seguro;
 * un filtro sobre una señal parcial borra medio catálogo.
 */

const path = require("path");
const { normalize, tokenize, matchesToken, tokenInProduct } = require("./productMatcher");

let datos = { tipos: {}, familias: {}, marcas: {} };
try {
  datos = require(path.join(__dirname, "..", "data", "sipc-types.json"));
} catch (e) {
  // Sin el archivo el módulo queda inerte: todo devuelve null y nada cambia.
  console.warn("[tipos] sipc-types.json no encontrado; clasificación desactivada");
}

// Las marcas más largas primero: "agua jane" tiene que ganarle a "agua" si
// alguna vez existiera una marca así de corta.
const MARCAS = Object.keys(datos.marcas || {}).sort((a, b) => b.length - a.length);

const TIPOS = Object.entries(datos.tipos || {});

/**
 * Familia del producto ("agua", "hipoclorito", "pan"), o null si no se sabe.
 */
function familiaDeProducto(nombre) {
  const n = normalize(nombre);
  if (!n) return null;

  // 1. Una palabra EXCLUSIVA de una familia manda sobre todo lo demás. "hipoclorito", "molde" o
  // "pulpa" identifican solas; "agua" o "blanco" no, y por eso no están en esa
  // lista. Se usa tokenInProduct para que valgan los sinónimos: el catálogo dice
  // "hipoclorito" y la góndola dice "lavandina".
  for (const [token, familia] of Object.entries(datos.exclusivos || {})) {
    if (tokenInProduct(token, n)) return familia;
  }

  // 2. La MARCA, pero sólo si el propio nombre no la contradice.
  //
  // "Agua Mineral Nix Con Gas 2lt" es agua, y la marca Nix figura en el catálogo
  // sólo bajo gaseosa — porque el catálogo lista la Nix cola, no la Nix agua.
  // Confiar en la marca ahí descartaba un agua mineral real de la búsqueda
  // "agua". Cuando el nombre dice una familia y la marca dice otra, no sabemos:
  // abstenerse es el lado seguro, porque un falso descarte esconde un producto
  // correcto y no mostrar señal sólo deja las cosas como estaban.
  for (const marca of MARCAS) {
    if (!n.includes(marca)) continue;
    const famMarca = datos.marcas[marca];
    const contradice = Object.entries(datos.tokenFamilias || {}).some(
      ([t, fams]) => matchesToken(t, n) && !fams.includes(famMarca)
        && fams.length === 1 && t !== marca
    );
    return contradice ? null : famMarca;
  }

  // 3. Nombre completo del tipo, para los que no tienen palabra exclusiva.
  for (const [clave, tokens] of TIPOS) {
    if (tokens.length === 0) continue;
    if (tokens.every((t) => matchesToken(t, n))) return datos.familias[clave];
  }
  return null;
}

/**
 * Familias que la búsqueda podría estar pidiendo. Devuelve un conjunto porque
 * "agua" es legítimamente ambigua entre varios tipos de agua — lo que importa
 * es que hipoclorito NO esté en ese conjunto.
 */
function familiasDeBusqueda(queryTokens) {
  if (!queryTokens || queryTokens.length === 0) return null;
  const fams = new Set();
  const q = queryTokens.join(" ");

  for (const marca of MARCAS) {
    if (q.includes(marca)) fams.add(datos.marcas[marca]);
  }
  // Se admite la familia de CUALQUIER tipo que comparta una palabra con la
  // búsqueda, no sólo del que empieza con ella. Mirar únicamente la primera
  // palabra marcaba "Pulpa de tomate" como ajena a "pure de tomate", porque esa
  // familia es "pulpa" y la de "Tomate Perita" es "tomate" — dos familias para
  // el mismo tomate. Ser generoso acá sólo hace que se marque de menos, que es
  // el lado seguro del error: un falso positivo esconde un producto correcto.
  for (const [clave, tokens] of TIPOS) {
    if (tokens.some((t) => matchesToken(t, q))) fams.add(datos.familias[clave]);
  }
  return fams.size > 0 ? fams : null;
}

/**
 * ¿El producto es de otra familia que la pedida? Sólo dice `true` cuando las
 * dos partes se conocen y no coinciden.
 */
function esOtraFamilia(queryTokens, nombreProducto, familiasQuery) {
  const fams = familiasQuery !== undefined ? familiasQuery : familiasDeBusqueda(queryTokens);
  if (!fams) return false;
  const f = familiaDeProducto(nombreProducto);
  if (!f) return false;
  return !fams.has(f);
}

module.exports = {
  familiaDeProducto,
  familiasDeBusqueda,
  esOtraFamilia,
  _cargado: TIPOS.length > 0,
};
