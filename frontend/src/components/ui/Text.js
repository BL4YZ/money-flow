import React from 'react';
import { Text as RNText } from 'react-native';
import { TYPE, COLORS } from '../../theme';

/**
 * Texto tipado. Es la pieza que hace cumplible "ningún hex fuera de theme.js":
 * si cada texto pasa por acá, no hay dónde escribir un color suelto.
 *
 * `variant` sale de TYPE (display, h1, h2, body, caption, overline, amount,
 * amountXL). Los montos usan las variantes `amount*`, que son JetBrains Mono
 * por las cifras tabulares: en el comparador los precios se leen en columna
 * entre tiendas y sin eso no alinean.
 *
 * NO acepta fontWeight: el peso viaja en el nombre de la familia (ver theme.js).
 */
export default function Txt({
  variant = 'body',
  color = COLORS.textHigh,
  center,
  style,
  children,
  ...rest
}) {
  return (
    <RNText
      style={[TYPE[variant] || TYPE.body, { color }, center && { textAlign: 'center' }, style]}
      {...rest}
    >
      {children}
    </RNText>
  );
}

/**
 * Monto en pesos uruguayos. Centraliza el formato para que no haya dos maneras
 * de escribir un precio en la app: separador de miles con punto, símbolo pegado,
 * sin decimales (las góndolas no los muestran y sumarlos alarga la caja).
 */
export function formatUYU(n, { signo = false } = {}) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(Math.round(v));
  const txt = '$' + abs.toLocaleString('es-UY');
  if (!signo) return (v < 0 ? '−' : '') + txt;
  return (v < 0 ? '−' : '+') + txt;
}

/**
 * Un importe CON su moneda. "US$ 50" y "$50" son cantidades muy distintas y
 * hasta acá se veían igual: todo salía con el mismo "$", así que un gasto de
 * cincuenta dólares parecía cincuenta pesos.
 *
 * En Uruguay el peso se escribe "$" y el dólar "US$" — nunca "$" solo para el
 * dólar, justamente porque se confunden. Los decimales sólo van en dólares,
 * donde cincuenta centavos son veinte pesos y sí importan.
 */
export function formatMoney(n, currency = 'UYU', { signo = false } = {}) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (currency !== 'USD') return formatUYU(v, { signo });
  const abs = Math.abs(v);
  const txt = 'US$ ' + abs.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!signo) return (v < 0 ? '−' : '') + txt;
  return (v < 0 ? '−' : '+') + txt;
}

/**
 * "$45/L", "$139/kg", "$4,90/un" — la única forma honesta de comparar envases
 * de distinto tamaño. Vivía duplicada en SearchScreen y ShoppingScreen.
 *
 * Con decimales por debajo de $10 porque ahí la diferencia está en los
 * centésimos: "$5/un" contra "$4/un" esconde que uno sale 4,90 y el otro 4,10.
 */
export function formatUnitPrice(item) {
  if (!item || item.unitPrice == null) return null;
  const decimales = item.unitPrice < 10 ? 2 : 0;
  return `$${item.unitPrice.toLocaleString('es-UY', { maximumFractionDigits: decimales })}/${item.unitLabel}`;
}

/**
 * Monto ya formateado y coloreado por signo. `tono` fuerza el color cuando el
 * signo no alcanza — por ejemplo el precio más barato de una fila, que es
 * positivo pero se pinta `income` porque es la buena noticia.
 */
export function Amount({ value, variant = 'amount', tono, signo, style, ...rest }) {
  const color = tono
    || (signo && Number(value) < 0 ? COLORS.expense : undefined)
    || COLORS.textHigh;
  return (
    <Txt variant={variant} color={color} style={style} {...rest}>
      {formatUYU(value, { signo })}
    </Txt>
  );
}
