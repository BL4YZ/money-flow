const pdfParse = require('pdf-parse');

/**
 * Extrae texto de un PDF usando pdf-parse (PDFs de texto).
 * Para PDFs escaneados se requiere instalación adicional de tesseract.
 * @param {Buffer} pdfBuffer
 * @returns {Promise<string>} texto extraído
 */
async function extractTextFromPDF(pdfBuffer) {
  try {
    const data = await pdfParse(pdfBuffer);
    if (data.text && data.text.trim().length > 50) {
      return data.text;
    }
    throw new Error('PDF sin texto extraíble (posiblemente escaneado)');
  } catch (err) {
    throw new Error('No se pudo leer el PDF: ' + err.message);
  }
}

/**
 * Parsea el texto de un estado de cuenta y extrae transacciones.
 * Maneja formatos comunes de bancos uruguayos (BROU, Santander, BBVA, Itaú).
 * @param {string} text
 * @returns {Array} transacciones
 */
function parseTransactions(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const parsers = [parseBROUFormat, parseSantanderFormat, parseGenericFormat];

  for (const parser of parsers) {
    const result = parser(lines);
    if (result.length > 2) return result;
  }

  return parseGenericFormat(lines);
}

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

function parseGenericFormat(lines) {
  const transactions = [];
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

function parseAmount(str) {
  if (!str) return null;
  const cleaned = str.replace(/\s/g, '');
  if (/^\-?\d{1,3}(\.\d{3})*(,\d{2})?$/.test(cleaned)) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
  }
  if (/^\-?\d{1,3}(,\d{3})*(\.\d{2})?$/.test(cleaned)) {
    return parseFloat(cleaned.replace(/,/g, ''));
  }
  const num = parseFloat(cleaned.replace(',', '.'));
  return isNaN(num) ? null : num;
}

function parseDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const parts = dateStr.split(/[\/\-\.]/);
  if (parts.length !== 3) return new Date().toISOString().split('T')[0];
  let [a, b, c] = parts;
  if (a.length === 4) return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`;
  const year = c.length === 2 ? `20${c}` : c;
  return `${year}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
}

function cleanDescription(desc) {
  return desc.replace(/\s{2,}/g, ' ').replace(/[|\\\/]{2,}/g, '').replace(/^\W+/, '').trim().substring(0, 255);
}

module.exports = { extractTextFromPDF, parseTransactions };
