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

module.exports = { extractTextFromPDF, parseTransactions };
