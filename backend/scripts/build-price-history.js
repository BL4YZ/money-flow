/**
 * Convierte el gigabyte de precios del MEF en unos KB de estadística por producto.
 *
 *   node scripts/build-price-history.js
 *
 * QUÉ PRODUCE Y POR QUÉ
 *
 * El SIPC publica ~14 millones de precios diarios (980 MB para 2026): precio de
 * cada producto de la canasta, en cada uno de los 893 comercios, cada día. Eso
 * no se sube a Render ni se consulta en vivo, pero lo que hace falta cabe en un
 * JSON chico: para cada producto, cuál es su precio HABITUAL.
 *
 * Con eso se puede decir algo que ningún comparador dice: no sólo "acá sale más
 * barato que allá", sino "esto está caro para lo que suele costar".
 *
 * EL PROBLEMA DE LA FECHA, Y CÓMO SE RESUELVE CON EL PROPIO DATO
 *
 * El volcado cubre enero a junio y se publicó en julio; hoy es septiembre. Con
 * inflación, comparar un precio de hoy contra una mediana de hace medio año
 * exagera todo hacia "caro". En vez de traer un índice externo, se mide la
 * tendencia DENTRO del mismo archivo — cuánto subió cada producto entre el
 * primer y el último mes — y se guarda, para que quien consulte pueda proyectar
 * hasta la fecha de hoy. El dato se corrige con el dato.
 *
 * MEMORIA
 *
 * No se guardan los 14M de precios: por producto se acumula un histograma de
 * precios redondeados (unos cientos de valores distintos) y sumas por mes. Todo
 * el proceso corre en decenas de MB pase lo que pase.
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const axios = require("axios");

const URL_PRECIOS =
  "https://catalogodatos.gub.uy/dataset/c2edcd30-8a99-45da-b208-b76056de430e/" +
  "resource/8226cb72-6ff0-4ed5-84a4-6eb7ee3be208/download/precios_2026.csv";

// Columnas: ID_PrecioDiario, Declaracion, Fecha, Fecha_anterior, Oferta,
// Precio, PrecioAnterior, Publico, Establecimiento, Feria_id, Presentacion_Producto
const COL_FECHA = 2;
const COL_OFERTA = 4;
const COL_PRECIO = 5;
const COL_PRODUCTO = 10;

function percentil(hist, total, p) {
  const objetivo = total * p;
  let acumulado = 0;
  const claves = [...hist.keys()].sort((a, b) => a - b);
  for (const v of claves) {
    acumulado += hist.get(v);
    if (acumulado >= objetivo) return v;
  }
  return claves[claves.length - 1] ?? null;
}

(async () => {
  const salida = path.join(__dirname, "..", "data", "sipc-price-history.json");

  console.log("Descargando precios del MEF (~980 MB, unos 3 minutos)…");
  const resp = await axios.get(URL_PRECIOS, {
    responseType: "stream",
    timeout: 0,
    headers: { "User-Agent": "MoneyFlow/1.0" },
  });

  const porProducto = new Map();   // idProducto → { hist, total, meses }
  let filas = 0, descartadas = 0, ofertas = 0;
  let ultimoAviso = Date.now();

  const rl = readline.createInterface({ input: resp.data, crlfDelay: Infinity });
  let primera = true;

  for await (const linea of rl) {
    if (primera) { primera = false; continue; }   // encabezado
    if (!linea) continue;
    filas++;

    const c = linea.split(",");
    const precio = Number(c[COL_PRECIO]);
    const idProd = c[COL_PRODUCTO];
    const fecha = (c[COL_FECHA] || "").replace(/"/g, "");
    if (!idProd || !fecha || !Number.isFinite(precio) || precio <= 0) { descartadas++; continue; }

    // Los precios en oferta se cuentan aparte: mezclarlos baja la mediana y
    // haría que un precio normal parezca caro.
    const enOferta = c[COL_OFERTA] === "1";
    if (enOferta) ofertas++;

    let p = porProducto.get(idProd);
    if (!p) { p = { hist: new Map(), total: 0, meses: new Map(), ofertas: 0 }; porProducto.set(idProd, p); }

    if (enOferta) { p.ofertas++; }
    else {
      const v = Math.round(precio);
      p.hist.set(v, (p.hist.get(v) || 0) + 1);
      p.total++;
      const mes = fecha.slice(0, 7);
      const m = p.meses.get(mes) || { suma: 0, n: 0 };
      m.suma += precio; m.n++;
      p.meses.set(mes, m);
    }

    if (Date.now() - ultimoAviso > 15000) {
      process.stderr.write(`\r  ${(filas / 1e6).toFixed(1)}M filas · ${porProducto.size} productos`);
      ultimoAviso = Date.now();
    }
  }
  process.stderr.write("\n");

  // ─── Estadística por producto ───────────────────────────────────
  const salidaJson = { generado: new Date().toISOString().slice(0, 10), fuente: "SIPC / MEF", productos: {} };
  let conTendencia = 0;

  for (const [id, p] of porProducto) {
    if (p.total < 30) continue;    // muestra insuficiente para hablar de "habitual"

    const mediana = percentil(p.hist, p.total, 0.5);
    const p25 = percentil(p.hist, p.total, 0.25);
    const p75 = percentil(p.hist, p.total, 0.75);

    // Tendencia mensual: promedio del último mes contra el del primero, repartido
    // entre los meses transcurridos. Sirve para proyectar hasta hoy.
    const meses = [...p.meses.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    let tendencia = 0;
    if (meses.length >= 2) {
      const prim = meses[0][1].suma / meses[0][1].n;
      const ult = meses[meses.length - 1][1].suma / meses[meses.length - 1][1].n;
      if (prim > 0) tendencia = (ult / prim - 1) / (meses.length - 1);
      conTendencia++;
    }

    salidaJson.productos[id] = {
      p25, mediana, p75,
      n: p.total,
      ofertas: p.ofertas,
      desde: meses[0] ? meses[0][0] : null,
      hasta: meses[meses.length - 1] ? meses[meses.length - 1][0] : null,
      tendenciaMensual: Number(tendencia.toFixed(5)),
    };
  }

  fs.mkdirSync(path.dirname(salida), { recursive: true });
  fs.writeFileSync(salida, JSON.stringify(salidaJson));

  const conservados = Object.keys(salidaJson.productos).length;
  const tendencias = Object.values(salidaJson.productos).map((x) => x.tendenciaMensual).sort((a, b) => a - b);
  const medianaTendencia = tendencias[Math.floor(tendencias.length / 2)] || 0;

  console.log(`\nfilas leídas        : ${filas.toLocaleString("es-UY")}`);
  console.log(`descartadas         : ${descartadas.toLocaleString("es-UY")}`);
  console.log(`precios en oferta   : ${ofertas.toLocaleString("es-UY")} (excluidos de la mediana)`);
  console.log(`productos con datos : ${conservados} de ${porProducto.size}`);
  console.log(`con tendencia       : ${conTendencia}`);
  console.log(`inflación mensual mediana observada: ${(medianaTendencia * 100).toFixed(2)}%`);
  console.log(`archivo             : ${(fs.statSync(salida).size / 1024).toFixed(0)} KB`);
})().catch((e) => {
  console.error("Falló:", e.message);
  process.exit(1);
});
