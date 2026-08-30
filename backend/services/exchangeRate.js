const axios = require("axios");

// ─── BCU (Banco Central del Uruguay) official exchange rate ───────
// Used to convert USD-denominated store prices (ZonaTecno, NNET, Digital
// Outlet, TopTecnoUY, Thot) into UYU so they can be fairly compared/sorted
// against the peso-denominated supermarket prices in the same list.
//
// The BCU only exposes a SOAP web service (no REST/JSON API, no API key).
// Building the raw XML envelope ourselves avoids pulling in the `soap`
// package for what is, in practice, one fixed-shape request.
const BCU_URL = "https://cotizaciones.bcu.gub.uy/wscotizaciones/servlet/awsbcucotizaciones";
const USD_MONEDA_CODE = 2225; // "DOLAR USA BILLETE"

const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 horas — el BCU publica una cotización por día
let cache = { rate: null, date: null, expiresAt: 0 };

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function buildRequestXml(desde, hasta) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cot="Cotiza">
  <soapenv:Header/>
  <soapenv:Body>
    <cot:wsbcucotizaciones.Execute>
      <cot:Entrada>
        <cot:Moneda><cot:item>${USD_MONEDA_CODE}</cot:item></cot:Moneda>
        <cot:FechaDesde>${desde}</cot:FechaDesde>
        <cot:FechaHasta>${hasta}</cot:FechaHasta>
        <cot:Grupo>0</cot:Grupo>
      </cot:Entrada>
    </cot:wsbcucotizaciones.Execute>
  </soapenv:Body>
</soapenv:Envelope>`;
}

// Queries a 7-day window and takes the most recent entry — today's rate
// isn't published until after the BCU's daily close, and weekends/holidays
// have none at all, so always asking for a range (not just "today") avoids
// an empty-result error on those days.
async function fetchLatestUsdRate() {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - 7 * 24 * 60 * 60 * 1000);

  const { data: xml } = await axios.post(BCU_URL, buildRequestXml(isoDate(desde), isoDate(hasta)), {
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""' },
    timeout: 10000,
  });

  const blocks =
    String(xml).match(/<datoscotizaciones\.dato[^>]*>[\s\S]*?<\/datoscotizaciones\.dato>/g) || [];
  if (blocks.length === 0) {
    throw new Error("BCU no devolvió cotizaciones para el rango consultado");
  }

  const last = blocks[blocks.length - 1]; // entries come in ascending date order
  const rate = parseFloat(last.match(/<TCV>([\d.]+)<\/TCV>/)?.[1]);
  const date = last.match(/<Fecha>([\d-]+)<\/Fecha>/)?.[1] || null;

  if (!rate || rate <= 0) {
    throw new Error("BCU devolvió una cotización inválida");
  }
  return { rate, date };
}

/**
 * Returns the current USD→UYU rate (BCU "billete" sell rate), cached for
 * CACHE_TTL. If the BCU call fails and a previous rate is cached (even if
 * stale), returns that instead of throwing — a transient BCU outage
 * shouldn't take down price comparison for USD-priced stores.
 */
async function getUsdToUyuRate() {
  if (cache.rate && Date.now() < cache.expiresAt) return cache.rate;
  try {
    const { rate, date } = await fetchLatestUsdRate();
    cache = { rate, date, expiresAt: Date.now() + CACHE_TTL };
    return rate;
  } catch (err) {
    console.error("[exchangeRate] BCU fetch failed:", err.message);
    if (cache.rate) return cache.rate; // stale-but-known-good fallback
    throw err;
  }
}

function convertUsdToUyu(usdAmount, rate) {
  return Math.round(usdAmount * rate * 100) / 100;
}

module.exports = { getUsdToUyuRate, convertUsdToUyu };
