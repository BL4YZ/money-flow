const pdfParse = require('pdf-parse');
const { createWorker } = require('tesseract.js');

/**
 * Extrae texto de un PDF.
 * Intenta pdf-parse primero (PDFs de texto), luego Tesseract (PDFs escaneados).
 * @param {Buffer} pdfBuffer
 * @returns {Promise<string>} texto extraído
 */
async function extractTextFromPDF(pdfBuffer) {
  try {
    const data = await pdfParse(pdfBuffer);
    if (data.text && data.text.trim().length > 100) {
      return data.text;
    }
  } catch (err) {
    console.warn('pdf-parse failed, trying OCR:', err.message);
  }

  // Fallback: Tesseract sobre el buffer directamente
  // (para PDFs escaneados, idealmente convertir a imagen primero con pdf2pic)
  const worker = await createWorker('spa+eng');
  try {
    const { data: { text } } = await worker.recognize(pdfBuffer);
    return text;
  } finally {
    await worker.terminate();
  }
}

/**
 * Parsea el texto de un estado de cuenta y extrae transacciones.
 * Maneja formatos comunes de bancos uruguayos (BROU, Santander, BBVA, Itaú).
 * @param {string} text
 * @returns {Array} transacciones
 */
function parseTransactions(text) {
  const transactions = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Patrones de fecha comunes en estados de cuenta uruguayos
  // Formatos: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD/MM/YY
  const DATE_PATTERN = /(\d{2}[\/\-]\d{2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})/;
  const AMOUNT_PATTERN = /[\$\s]?([\d\.]+,\d{2}|[\d,]+\.\d{2}|[\d\.]+)/;

  // Patrón genérico para líneas de transacción
  // Ejemplo: "15/03/2024  NETFLIX COM  -1.299,00  12.500,50"
  const TX_LINE = new RegExp(
    `${DATE_PATTERN.source}\\s+(.+?)\\s+([-+]?${AMOUNT_PATTERN.source})(?:\\s+([-+]?${AMOUNT_PATTERN.source}))?`,
    'g'
  );

  // Patrones específicos por banco
  const patterns = [
    parseBROUFormat,
    parseSantanderFormat,
    parseGenericFormat,
  ];

  for (const parser of patterns) {
    const result = parser(lines);
    if (result.length > 2) {
      return result;
    }
  }

  // Último recurso: parseo genérico línea por línea
  return parseGenericFormat(lines);
}

/**
 * Formato BROU (Banco República Oriental del Uruguay)
 * "DD/MM/AAAA  DESCRIPCION  IMPORTE  SALDO"
 */
function parseBROUFormat(lines) {
  const transactions = [];
  const pattern = /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([-+]?\d[\d.,]+)\s+([-+]?\d[\d.,]+)?$/;

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
      type: amount < 0 ? 'debit' : 'credit',
      rawText: line,
    });
  }

  return transactions;
}

/**
 * Formato Santander Uruguay
 * Similar al BROU pero con variaciones en el espaciado
 */
function parseSantanderFormat(lines) {
  const transactions = [];
  const pattern = /^(\d{2}[\/\-]\d{2}[\/\-]\d{2,4})\s{2,}(.+?)\s{2,}([-+]?[\d.,]+)$/;

  for (const line of lines) {
    const match = line.match(pattern);
    if (!match) continue;

    const [, dateStr, description, amountStr] = match;
    const amount = parseAmount(amountStr);
    if (!amount) continue;

    transactions.push({
      date: parseDate(dateStr),
      description: cleanDescription(description),
      amount: Math.abs(amount),
      type: amount < 0 ? 'debit' : 'credit',
      rawText: line,
    });
  }

  return transactions;
}

/**
 * Parseo genérico — busca cualquier línea con fecha + texto + número
 */
function parseGenericFormat(lines) {
  const transactions = [];
  // Captura: fecha | cualquier texto | número (posiblemente con signo)
  const pattern = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\s+(.{3,60}?)\s+([-+]?[\d.]+[,\d]*|\d+,\d{2})/;

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
      type: amount < 0 || amountStr.startsWith('-') ? 'debit' : 'credit',
      rawText: line,
    });
  }

  return transactions;
}

/** Normaliza montos: "1.299,00" → 1299, "1,299.00" → 1299 */
function parseAmount(str) {
  if (!str) return null;
  const cleaned = str.replace(/\s/g, '');

  // Formato europeo: 1.299,00
  if (/^\-?\d{1,3}(\.\d{3})*(,\d{2})?$/.test(cleaned)) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
  }

  // Formato americano: 1,299.00
  if (/^\-?\d{1,3}(,\d{3})*(\.\d{2})?$/.test(cleaned)) {
    return parseFloat(cleaned.replace(/,/g, ''));
  }

  // Número simple
  const num = parseFloat(cleaned.replace(',', '.'));
  return isNaN(num) ? null : num;
}

/** Normaliza fechas a formato YYYY-MM-DD */
function parseDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];

  const parts = dateStr.split(/[\/\-\.]/);
  if (parts.length !== 3) return new Date().toISOString().split('T')[0];

  let [a, b, c] = parts;

  // YYYY-MM-DD ya está en formato correcto
  if (a.length === 4) {
    return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`;
  }

  // DD/MM/YYYY o DD/MM/YY
  const year = c.length === 2 ? `20${c}` : c;
  return `${year}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
}

/** Limpia descripciones de ruido OCR */
function cleanDescription(desc) {
  return desc
    .replace(/\s{2,}/g, ' ')
    .replace(/[|\\\/]{2,}/g, '')
    .replace(/^\W+/, '')
    .trim()
    .substring(0, 255);
}

module.exports = { extractTextFromPDF, parseTransactions };
