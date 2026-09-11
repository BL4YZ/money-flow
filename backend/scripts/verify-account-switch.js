/**
 * Cambiar de cuenta tiene que cambiar los números.
 *
 *   npm run dev            (en otra terminal)
 *   node scripts/verify-account-switch.js [baseUrl]
 *
 * Reportado desde la app: "cuando cambio a dólares no cambian las métricas".
 * El bug estaba del lado de la pantalla —el efecto sólo escuchaba el mes, así
 * que el selector se movía y no se volvía a pedir nada— pero lo que tiene que
 * quedar garantizado es el contrato del backend: pedir una cuenta devuelve
 * SOLO esa cuenta, sumada en SU moneda, y vacía si no hay nada.
 *
 * Sale distinto de cero si alguna falla.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const db = require('../db');
const { getUsdToUyuRateOn } = require('../services/exchangeRate');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const PASS = `Pw-${Math.random().toString(36).slice(2, 12)}!`;

let token;
const api = async (metodo, ruta, cuerpo) => {
  const r = await fetch(`${BASE}/api${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch (_) {}
  return { status: r.status, data };
};

const num = (v) => Math.round(parseFloat(v || 0));

(async () => {
  console.log(`Probando ${BASE}\n`);
  let fallas = 0;
  const chequeo = (etiqueta, ok, detalle) => {
    if (!ok) fallas++;
    console.log(`   ${ok ? 'ok   ' : 'FALLA'} ${etiqueta.padEnd(50)} ${detalle}`);
  };

  const alta = await api('POST', '/auth/register', {
    name: 'Switch', email: `switch-${Date.now()}@ejemplo.local`, password: PASS,
  });
  if (!alta.data?.token) { console.error('no se pudo registrar'); process.exit(1); }
  token = alta.data.token;
  const uid = alta.data.user.id;
  const mes = new Date().toISOString().slice(0, 7);
  const hoy = new Date().toISOString().slice(0, 10);

  try {
    // Estado inicial: sin nada cargado, la cuenta en dolares tiene que venir
    // vacia y no heredar los numeros de la de pesos.
    let usd = await api('GET', `/transactions/summary?currency=USD&month=${mes}`);
    chequeo('cuenta en dolares vacia da vacio', num(usd.data.totals.total_spent) === 0,
      `gastado ${usd.data.totals.total_spent}`);

    // Solo pesos.
    await api('POST', '/transactions', {
      date: hoy, description: 'SUPERMERCADO', amount: 3000, type: 'debit', category: 'Supermercado', currency: 'UYU',
    });

    let uyu = await api('GET', `/transactions/summary?currency=UYU&month=${mes}`);
    chequeo('la cuenta en pesos suma lo suyo', num(uyu.data.totals.total_spent) === 3000,
      `$${num(uyu.data.totals.total_spent)}`);

    usd = await api('GET', `/transactions/summary?currency=USD&month=${mes}`);
    chequeo('y la de dolares SIGUE vacia', num(usd.data.totals.total_spent) === 0,
      `no hereda los $3.000 de la otra`);
    chequeo('...y no trae categorias de la otra cuenta', (usd.data.byCategory || []).length === 0,
      `${(usd.data.byCategory || []).length} categorias`);

    // Ahora un movimiento en dolares.
    await api('POST', '/transactions', {
      date: hoy, description: 'SERVIDOR', amount: 100, type: 'debit', category: 'Servicios', currency: 'USD',
    });

    usd = await api('GET', `/transactions/summary?currency=USD&month=${mes}`);
    chequeo('la cuenta en dolares suma EN DOLARES', num(usd.data.totals.total_spent) === 100,
      `US$${num(usd.data.totals.total_spent)} — no convertido a pesos`);
    chequeo('y lo dice en la respuesta', usd.data.currency === 'USD' && usd.data.convertido === false,
      `currency=${usd.data.currency} convertido=${usd.data.convertido}`);

    uyu = await api('GET', `/transactions/summary?currency=UYU&month=${mes}`);
    chequeo('la de pesos no se contamina', num(uyu.data.totals.total_spent) === 3000,
      `$${num(uyu.data.totals.total_spent)}`);

    // "Todo": las dos, convertidas a pesos.
    const tasa = await getUsdToUyuRateOn(hoy);
    const todo = await api('GET', `/transactions/summary?month=${mes}`);
    const esperado = Math.round(3000 + 100 * tasa);
    chequeo('"Todo" suma las dos en pesos', Math.abs(num(todo.data.totals.total_spent) - esperado) <= 2,
      `$${num(todo.data.totals.total_spent)} (esperado ~$${esperado})`);
    chequeo('...y avisa que esta convertido', todo.data.convertido === true, `convertido=${todo.data.convertido}`);

    // El listado tambien filtra.
    const listaUsd = await api('GET', '/transactions?currency=USD');
    chequeo('el listado devuelve solo esa cuenta',
      listaUsd.data.transactions.length === 1 && listaUsd.data.transactions[0].currency === 'USD',
      `${listaUsd.data.transactions.length} movimiento(s)`);

    // Y las cuentas que existen de verdad.
    const cuentas = await api('GET', '/transactions/accounts');
    chequeo('lista las dos cuentas', (cuentas.data.accounts || []).length === 2,
      (cuentas.data.accounts || []).map((c) => c.currency).join(' '));
  } finally {
    await db.query('DELETE FROM transactions WHERE user_id = $1', [uid]).catch(() => {});
    await api('DELETE', '/account', { password: PASS });
  }

  console.log(`\n${fallas === 0 ? 'TODO OK: cada cuenta muestra lo suyo' : `${fallas} chequeos fallaron`}`);
  process.exit(fallas === 0 ? 0 : 1);
})().catch((e) => { console.error('error:', e.message); process.exit(1); });
