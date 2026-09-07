/**
 * Genera data/sipc-stores.json: las 893 sucursales del país, geolocalizadas.
 *
 *   node scripts/build-stores.js
 *
 * PARA QUÉ
 *
 * El comparador dice "Tata es el más barato para tu lista". La pregunta que la
 * gente hace después es "¿y dónde queda?". El SIPC publica todas las sucursales
 * relevadas con dirección, barrio y coordenadas — 893 en los 23 departamentos,
 * el 100% con lat/long — así que "el más barato" puede pasar a ser "el más
 * barato, a 600 m de acá".
 *
 * También cubre 117 comercios "Sin Cadena" y cadenas que no scrapeamos (Kinko,
 * Frog, El Clon…). Esas no tienen precio online, pero sirven igual: sabemos que
 * existen y dónde están, que es más de lo que teníamos.
 *
 * DETALLE DEL FORMATO: el CSV viene en windows-1252 y las coordenadas usan COMA
 * decimal ("-34,8765665"). Leerlo como UTF-8 rompe los acentos y parsear la
 * coma como separador de miles manda todas las sucursales al Golfo de Guinea.
 */

const fs = require("fs");
const path = require("path");
const axios = require("axios");

const URL_EST =
  "https://catalogodatos.gub.uy/dataset/c2edcd30-8a99-45da-b208-b76056de430e/" +
  "resource/26a1743a-2a63-4712-a220-a5a19879e748/download/establecimiento.csv";

// Cadena del SIPC → id de tienda del scraper. Sólo las que además tienen precio
// online; el resto se guarda igual pero sin storeId, y la UI las trata distinto.
const CADENA_A_TIENDA = {
  "Ta - Ta": "tata",
  "Disco": "disco",
  "Devoto": "devoto",
  "Devoto Express": "devoto",
  "Géant": "geant",
  "Tienda Inglesa": "tiendainglesa",
  "El Dorado": "eldorado",
  "Farmashop": "farmashop",
  "San Roque": "sanroque",
};

const num = (s) => {
  const v = parseFloat(String(s || "").replace(",", "."));
  return Number.isFinite(v) ? v : null;
};

(async () => {
  const salida = path.join(__dirname, "..", "data", "sipc-stores.json");

  console.log("Descargando establecimientos del MEF…");
  let r = null;
  for (let i = 1; i <= 4 && !r; i++) {
    try {
      r = await axios.get(URL_EST, {
        responseType: "arraybuffer", timeout: 40000,
        headers: { "User-Agent": "MoneyFlow/1.0" },
      });
    } catch (e) {
      console.log(`   intento ${i} falló (${e.response ? e.response.status : e.message})`);
      if (i === 4) throw e;
      await new Promise((res) => setTimeout(res, 2500 * i));
    }
  }

  const texto = new TextDecoder("windows-1252").decode(r.data);
  const filas = texto.split(/\r?\n/).slice(1).filter((l) => l.trim()).map((l) => l.split(";"));

  const tiendas = [];
  let sinCoord = 0;
  for (const c of filas) {
    // OJO: el encabezado del CSV dice "long;lat" pero los valores vienen al
    // reves. La columna 8 trae -34,87 (latitud de Montevideo) y la 9 trae
    // -56,18 (longitud). Confiar en el encabezado mandaba las 893 sucursales
    // al Golfo de Guinea; el chequeo de limites de abajo lo delato.
    const lat = num(c[8]);
    const lng = num(c[9]);
    if (lat === null || lng === null) { sinCoord++; continue; }
    // Uruguay está entre -30/-35 de latitud y -53/-58 de longitud. Un punto
    // fuera de eso es un error de parseo, no una sucursal.
    if (lat > -30 || lat < -35.5 || lng > -53 || lng < -59) { sinCoord++; continue; }

    const cadena = (c[7] || "").trim();
    tiendas.push({
      id: Number(c[0]),
      nombre: (c[2] || c[1] || "").trim(),
      cadena,
      storeId: CADENA_A_TIENDA[cadena] || null,
      direccion: (c[3] || "").trim(),
      barrio: (c[5] || "").trim(),
      ciudad: (c[10] || "").trim(),
      depto: (c[11] || "").trim(),
      lat, lng,
    });
  }

  fs.mkdirSync(path.dirname(salida), { recursive: true });
  fs.writeFileSync(salida, JSON.stringify(tiendas));

  const conPrecio = tiendas.filter((t) => t.storeId).length;
  console.log(`\nsucursales          : ${tiendas.length}`);
  console.log(`descartadas         : ${sinCoord} (sin coordenadas o fuera de Uruguay)`);
  console.log(`con precio online   : ${conPrecio} (cadenas que scrapeamos)`);
  console.log(`sin precio online   : ${tiendas.length - conPrecio}`);
  console.log(`departamentos       : ${new Set(tiendas.map((t) => t.depto)).size}`);
  console.log(`archivo             : ${(fs.statSync(salida).size / 1024).toFixed(0)} KB`);
})().catch((e) => {
  console.error("Falló:", e.message);
  process.exit(1);
});
