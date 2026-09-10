/**
 * Extrae texto de un PDF usando pdf-parse (lazy loaded para evitar crash al iniciar).
 * Se utiliza una función personalizada (pagerender) para alinear correctamente
 * el texto de las tablas basándose en su coordenada Y (altura).
 * @param {Buffer} pdfBuffer
 * @returns {Promise<string>} texto extraído
 */
async function extractTextFromPDF(pdfBuffer) {
  const pdfParse = require("pdf-parse/lib/pdf-parse");

  // Agrupa texto en la misma línea horizontal por coordenada Y
  function render_page(pageData) {
    return pageData.getTextContent().then(function (textContent) {
      let lastY, text = "";
      for (let item of textContent.items) {
        if (!item.str) continue;
        if (lastY === item.transform[5] || !lastY) {
          text += item.str + " ";
        } else {
          text += "\n" + item.str + " ";
        }
        lastY = item.transform[5];
      }
      return text;
    });
  }

  // Suprime warnings de pdf.js sobre fuentes TrueType (TT: undefined function, etc.)
  // Son inofensivos pero saturan los logs con PDFs bancarios
  const originalWarn = console.warn;
  const originalError = console.error;
  const suppress = (msg, ...args) => {
    if (typeof msg === "string" && /TT:|Warning:|WARN |FontFile|undefined function/i.test(msg)) return;
    originalWarn(msg, ...args);
  };

  try {
    console.warn = suppress;
    console.error = suppress;

    // Intento 1: extracción con alineación de columnas (mejor para tablas)
    let data = await pdfParse(pdfBuffer, { pagerender: render_page });
    if (data.text && data.text.trim().length > 20) {
      return data.text;
    }

    // Intento 2: extracción simple sin pagerender personalizado (fallback)
    data = await pdfParse(pdfBuffer);
    if (data.text && data.text.trim().length > 20) {
      return data.text;
    }

    throw new Error("PDF sin texto extraíble (posiblemente escaneado o protegido)");
  } catch (err) {
    // Si el error es nuestro, lo propagamos; si es del parser, damos mensaje claro
    if (err.message.includes("PDF sin texto")) throw err;
    throw new Error("No se pudo leer el PDF: " + err.message);
  } finally {
    // Siempre restauramos console aunque haya error
    console.warn = originalWarn;
    console.error = originalError;
  }
}

// ─── CSV del banco ────────────────────────────────────────────────
//
// Santander (y la mayoría) ofrece el resumen en CSV además de PDF, y el CSV es
// muchísimo mejor punto de entrada: no depende de pdf-parse, no hay que
// reconstruir una tabla por posiciones y el resultado es determinístico.
// Verificado contra un resumen real: el PDF extrae texto pero queda tabulado a
// ~13 caracteres por línea y ninguno de los tres parsers lo reconoce.

/**
 * Split que respeta comillas (RFC 4180). Con `split(',')` a secas las filas de
 * un resumen real daban 7 u 8 columnas contra un encabezado de 8, porque los
 * conceptos traen comas adentro y vienen entrecomillados. Con esto, todas dan 7.
 */
function splitCSVLine(linea) {
  const out = [];
  let cur = '';
  let dentro = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (dentro && linea[i + 1] === '"') { cur += '"'; i++; }
      else dentro = !dentro;
    } else if (c === ',' && !dentro) {
      out.push(cur); cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const sinTildes = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const ES_FECHA = /^\s*\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\s*$/;

/**
 * Encuentra la columna del SALDO y las del IMPORTE sin confiar en el encabezado.
 *
 * POR QUÉ NO SE PUEDE CONFIAR EN EL ENCABEZADO
 *
 * En el resumen de Santander el encabezado declara 8 columnas
 * (Fecha, Referencia, Concepto, Descripción, Débito, Crédito, Saldos, "") y las
 * filas de datos traen 7: NO emiten `Descripción`. Todo lo que viene después de
 * la posición 2 queda corrido un lugar, así que mapear por nombre entregaba la
 * columna de SALDO como si fuera el crédito. Reportado por el usuario: un carga
 * de 1.000 pesos en ANCAP aparecía como 43.311, que era el saldo de la cuenta.
 *
 * LA PROPIEDAD QUE SÍ SE VERIFICA
 *
 * Un saldo corriente cambia entre filas consecutivas exactamente por el importe
 * de la fila. Eso se puede comprobar sobre los propios datos y no depende de
 * cómo el banco haya nombrado ni ordenado las columnas. En el archivo real la
 * identidad se cumple en 11/11 y 4/4 filas, sin ambigüedad.
 *
 * Y el SIGNO sale del saldo, no de qué columna sea: si el saldo subió es un
 * crédito y si bajó es un débito. Más robusto que adivinar cuál de las dos
 * columnas numéricas se llamaba "Débito".
 */
function detectarColumnas(filas, ancho) {
  const col = (f, k) => parseAmount((f[k] || '').trim());
  const numericas = [];
  for (let k = 1; k < ancho; k++) {   // 0 es la fecha
    const n = filas.filter((f) => col(f, k) !== null).length;
    if (n > 0) numericas.push({ k, n });
  }

  let saldo = -1;
  let mejor = 0;
  for (const { k, n } of numericas) {
    if (n < filas.length * 0.9) continue;   // el saldo está en casi todas
    for (const { k: imp } of numericas) {
      if (imp === k) continue;
      let ok = 0, total = 0;
      for (let i = 1; i < filas.length; i++) {
        const a = col(filas[i - 1], k);
        const b = col(filas[i], k);
        const m = col(filas[i], imp);
        if (a === null || b === null || m === null) continue;
        total++;
        if (Math.abs(Math.abs(b - a) - Math.abs(m)) < 0.02) ok++;
      }
      if (total >= 3 && ok / total > 0.6 && ok > mejor) { mejor = ok; saldo = k; }
    }
  }

  // Las de importe son las numéricas que no son el saldo ni la referencia. La
  // referencia se descarta por magnitud: es un identificador largo, no plata.
  const importes = numericas
    .filter(({ k }) => k !== saldo)
    .filter(({ k }) => {
      const vals = filas.map((f) => col(f, k)).filter((v) => v !== null).sort((a, b) => a - b);
      if (vals.length === 0) return false;
      const mediana = Math.abs(vals[Math.floor(vals.length / 2)]);
      return mediana < 1e9;   // un número de referencia de 12 dígitos no es un monto
    })
    .map(({ k }) => k);

  return { saldo, importes };
}

/**
 * Transacciones de un CSV de banco.
 *
 * El archivo trae un preámbulo (cliente, cuenta, moneda, sucursal) y cierra con
 * saldo anterior y saldo final: esas filas tienen la misma cantidad de columnas
 * pero NO empiezan con fecha, que es como se las descarta sin listarlas a mano.
 */
function parseCSVTransactions(buffer) {
  // Los bancos uruguayos mandan windows-1252. Leerlo como utf-8 rompe cada
  // acento y con eso las descripciones y los nombres de columna.
  let texto = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer);
  if (/�/.test(texto) && Buffer.isBuffer(buffer)) {
    texto = new TextDecoder('windows-1252').decode(buffer);
  }

  const lineas = texto.split(/\r?\n/).filter((l) => l.trim()).map(splitCSVLine);

  // Los movimientos son las filas que empiezan con fecha. El preámbulo y las
  // filas de saldo anterior / saldo final tienen la misma cantidad de columnas
  // pero no fecha, así que caen solas.
  const filas = lineas.filter((c) => ES_FECHA.test((c[0] || '').trim()));
  if (filas.length === 0) return [];
  const ancho = Math.max(...filas.map((f) => f.length));

  const { saldo, importes } = detectarColumnas(filas, ancho);
  if (importes.length === 0) return [];

  // Saldo de arranque: la última fila ANTES del primer movimiento que traiga un
  // número en la columna del saldo. Es el "saldo anterior" del resumen, y sirve
  // para saber el signo del primer movimiento — sin él habría que adivinarlo.
  let saldoPrevio = null;
  if (saldo >= 0) {
    const iPrimera = lineas.indexOf(filas[0]);
    for (let i = iPrimera - 1; i >= 0; i--) {
      const v = parseAmount((lineas[i][saldo] || '').trim());
      if (v !== null) { saldoPrevio = v; break; }
    }
  }

  // La descripción sale de las columnas de TEXTO, que es lo que queda después
  // de sacar fecha, saldo, importes y la referencia.
  const usadas = new Set([0, saldo, ...importes]);
  const textuales = [];
  for (let k = 1; k < ancho; k++) {
    if (usadas.has(k)) continue;
    const largos = filas.map((f) => (f[k] || '').trim().length);
    const prom = largos.reduce((a, b) => a + b, 0) / largos.length;
    if (prom >= 4) textuales.push(k);   // una referencia corta no describe nada
  }

  // La REFERENCIA del banco: entre las columnas que quedaron, la que tiene un
  // valor casi único por fila. Es el identificador que el banco ya le puso al
  // movimiento, y sirve de clave para no duplicar al volver a subir.
  let colRef = -1;
  let mejorRatio = 0;
  for (const k of textuales) {
    const vals = filas.map((f) => (f[k] || '').trim()).filter(Boolean);
    if (vals.length < filas.length * 0.8) continue;
    const ratio = new Set(vals).size / vals.length;
    if (ratio > mejorRatio) { mejorRatio = ratio; colRef = k; }
  }
  if (mejorRatio < 0.9) colRef = -1;   // sin unicidad no sirve como clave

  const transactions = [];
  for (const f of filas) {
    let amount = null;
    for (const k of importes) {
      const v = parseAmount((f[k] || '').trim());
      if (v !== null && Math.abs(v) > 0) { amount = Math.abs(v); break; }
    }
    if (amount === null) continue;

    // EL SIGNO SALE DEL SALDO, no de qué columna sea: si subió es un ingreso.
    // Si no hay saldo utilizable se cae a la posición, que es lo que había.
    let type = 'debit';
    const actual = saldo >= 0 ? parseAmount((f[saldo] || '').trim()) : null;
    if (actual !== null && saldoPrevio !== null) {
      type = actual > saldoPrevio ? 'credit' : 'debit';
    } else if (importes.length > 1) {
      const k = importes.find((x) => parseAmount((f[x] || '').trim()));
      type = k === importes[0] ? 'debit' : 'credit';
    }
    if (actual !== null) saldoPrevio = actual;

    const description = cleanDescription(
      textuales.map((k) => (f[k] || '').trim()).filter(Boolean).join(' - '),
    ) || 'Movimiento';

    const fecha = parseDate((f[0] || '').trim());

    // Clave de idempotencia: fecha + la referencia del propio banco. En el
    // resumen real esa combinación es única en las 16 filas. Va SIN el importe
    // a propósito — si el monto formara parte de la clave, volver a subir un
    // resumen con un importe corregido crearía una fila nueva en vez de
    // arreglar la vieja, que es exactamente lo que hay que evitar.
    const ref = colRef >= 0 ? (f[colRef] || '').trim() : '';
    const externalId = `${fecha}|${ref || description.slice(0, 60)}`;

    transactions.push({
      date: fecha,
      description,
      amount,
      type,
      externalId,
      // Sin rawText a propósito: es la línea entera del resumen y termina
      // guardada o logueada.
    });
  }
  return transactions;
}

/** ¿Este archivo parece un CSV de banco? Se decide por contenido, no por nombre. */
function pareceCSV(buffer, mimeType, filename) {
  if (/csv|excel|spreadsheet/i.test(mimeType || '')) return true;
  if (/\.csv$/i.test(filename || '')) return true;
  const cabeza = Buffer.isBuffer(buffer) ? buffer.slice(0, 2048).toString('latin1') : '';
  return /(^|\n)[^\n]*,[^\n]*,/.test(cabeza) && !cabeza.startsWith('%PDF');
}

/**
 * Parsea el texto de un estado de cuenta y extrae transacciones.
 */
function parseTransactions(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const parsers = [parseBROUFormat, parseSantanderFormat, parseGenericFormat];

  for (const parser of parsers) {
    const result = parser(lines);
    if (result.length > 2) return result;
  }

  return parseGenericFormat(lines);
}

function parseBROUFormat(lines) {
  const transactions = [];
  const pattern =
    /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([-+]?\d[\d.,]+)\s+([-+]?\d[\d.,]+)?$/;

  for (const line of lines) {
    const match = line.match(pattern);
    if (!match) continue;
    const [, dateStr, description, amountStr] = match;
    const amount = parseAmount(amountStr);
    if (!amount || !description.trim()) continue;
    transactions.push({
      date: parseDate(dateStr),
      description: cleanDescription(description),
      amount: Math.abs(amount),
      type: amount < 0 ? "debit" : "credit",
      rawText: line,
    });
  }
  return transactions;
}

function parseSantanderFormat(lines) {
  const transactions = [];

  // Santander UY: cada transacción ocupa varias líneas.
  // Línea de inicio: "DD/MM/YYYY  REFERENCIA  TIPO"
  // Línea de monto:  "-1.102,21 5.833,07"  (monto + saldo) o "1.000,00 9.000,00" (crédito + saldo)
  const dateLinePattern = /^(\d{2}\/\d{2}\/\d{4})\s+\d+\s+/;
  const amountLinePattern = /^(-?\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/;

  // Agrupar líneas en bloques que empiezan con fecha
  const groups = [];
  let current = null;

  for (const line of lines) {
    if (dateLinePattern.test(line)) {
      if (current) groups.push(current);
      const dateMatch = line.match(/^(\d{2}\/\d{2}\/\d{4})/);
      current = { date: dateMatch[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) groups.push(current);

  for (const group of groups) {
    // Buscar la línea del monto (la que tiene "monto saldo")
    let amountStr = null;
    let amountLineIdx = -1;

    for (let i = group.lines.length - 1; i >= 0; i--) {
      const m = group.lines[i].trim().match(amountLinePattern);
      if (m) {
        amountStr = m[1];   // primer número = débito/crédito
        amountLineIdx = i;
        break;
      }
    }

    if (!amountStr) continue;

    const amount = parseAmount(amountStr);
    if (!amount) continue;

    // Descripción: todas las líneas antes del monto, excluyendo la última línea
    // si termina en " -" (es el indicador de columna del PDF)
    const descLines = group.lines
      .slice(0, amountLineIdx)
      .map(l => l.trim().replace(/\s+-\s*$/, ""))   // quitar " -" final
      .filter(l => l && l !== "-");

    const rawDescription = descLines.join(" ");
    const description = cleanDescription(rawDescription);

    if (!description || description.length < 3) continue;

    transactions.push({
      date: parseDate(group.date),
      description,
      amount: Math.abs(amount),
      type: amount < 0 ? "debit" : "credit",
      rawText: group.lines.join(" "),
    });
  }

  return transactions;
}

function parseGenericFormat(lines) {
  const transactions = [];
  const pattern =
    /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\s+(.{3,60}?)\s+([-+]?[\d.]+[,\d]*|\d+,\d{2})/;

  for (const line of lines) {
    if (line.length < 15 || line.length > 200) continue;
    const match = line.match(pattern);
    if (!match) continue;
    const [, dateStr, description, amountStr] = match;
    const amount = parseAmount(amountStr);
    if (!amount || isNaN(amount)) continue;
    const desc = cleanDescription(description);
    if (desc.length < 3) continue;
    transactions.push({
      date: parseDate(dateStr),
      description: desc,
      amount: Math.abs(amount),
      type: amount < 0 || amountStr.startsWith("-") ? "debit" : "credit",
      rawText: line,
    });
  }
  return transactions;
}

function parseAmount(str) {
  if (!str) return null;
  const cleaned = str.replace(/\s/g, "");
  if (/^\-?\d{1,3}(\.\d{3})*(,\d{2})?$/.test(cleaned)) {
    return parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
  }
  if (/^\-?\d{1,3}(,\d{3})*(\.\d{2})?$/.test(cleaned)) {
    return parseFloat(cleaned.replace(/,/g, ""));
  }
  const num = parseFloat(cleaned.replace(",", "."));
  return isNaN(num) ? null : num;
}

function parseDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split("T")[0];
  const parts = dateStr.split(/[\/\-\.]/);
  if (parts.length !== 3) return new Date().toISOString().split("T")[0];
  let [a, b, c] = parts;
  if (a.length === 4) return `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`;
  const year = c.length === 2 ? `20${c}` : c;
  return `${year}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
}

/**
 * Limpia y embellece la descripción eliminando basura bancaria, referencias y tarjetas.
 */
function cleanDescription(desc) {
  let cleaned = desc;

  // 1. Quitar frases genéricas y burocráticas de los bancos
  const bankPhrases = [
    /COMPRA CON TARJETA (DEBITO|CREDITO)/gi,
    /DEBITO A CONFIRMAR/gi,
    /BANRED COMPRA/gi,
    /PAGO DE SERVICIO POR BANRED/gi,
    /DEBITO OPERACION EN SUPERNET O SMS/gi,
    /PAGO ELECTRONICO TARJETA CREDITO/gi,
    /TRANSF INSTANTANEA (RECIBIDA|ENVIADA)/gi,
    /TARJETA DEBITO/gi,
    /COMPRA CON/gi,
    /SERVICIO DE PAGOS BANRED,?/gi,
    /RETIRO CORRESPONSALES,?/gi,
  ];

  for (const phrase of bankPhrases) {
    cleaned = cleaned.replace(phrase, "");
  }

  // 2. Quitar el enmascarado de la tarjeta (Ej: "TARJ: ############5025")
  cleaned = cleaned.replace(/TARJ(?:ETA)?[:\s]*[#X]*\d{4}/gi, "");

  // 3. Quitar códigos de referencia largos (Ej: 610020699, TT55203750, 653179LR:0000305839).
  // Requiere al menos un dígito en la secuencia — si no, esto borraba por
  // completo cualquier palabra normal de 8+ letras (SUPERMERCADO, FARMACIA,
  // ELECTRODOMESTICOS...), destruyendo la pista principal que el categorizador
  // necesita y degradando la categorización automática a "Otros".
  cleaned = cleaned.replace(/\b(?=[A-Z0-9:-]*\d)[A-Z0-9:-]{8,}\b/gi, "");

  // 4. Quitar secuencias de números cortos sueltos que suelen ser referencias (Ej: "441", "810")
  cleaned = cleaned.replace(/\b\d{3,7}\b/g, "");

  // 5. Limpieza final: quitar comas, asteriscos, guiones, espacios múltiples y normalizar
  cleaned = cleaned
    .replace(/[,*:-]/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/[|\\\/]{2,}/g, "")
    .replace(/^\W+/, "") // Quita símbolos al principio
    .trim()
    .substring(0, 255);

  return cleaned;
}

module.exports = { extractTextFromPDF, parseTransactions, parseCSVTransactions, pareceCSV };
