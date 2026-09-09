import React from 'react';
import { View, Image, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Txt, { formatUYU } from './Text';
import { StoreDot } from './Badge';
import { COLORS, RADIUS, FONTS } from '../../theme';

/**
 * Fila de producto/oferta. Unifica resultCard/resultImg (Search) y
 * productCard/productImage (Suggestions), que eran el mismo componente con dos
 * juegos de nombres.
 *
 * El precio más barato va en `income` y el resto en `textHigh`, con el delta
 * contra el mejor en `expense`. Eso es lo que deja comparar sin leer los
 * números: el color dice cuál conviene y el delta cuánto cuesta la diferencia.
 *
 * Hueco reservado para el veredicto caro/normal/barato del histórico del MEF
 * (`verdict`), que el backend ya devuelve y entra en la ronda 2 del diseño.
 */
export default function OfferRow({
  name,
  price,
  listPrice,          // precio de lista, si hay descuento
  unitPrice,          // "$103 / 100 ml"
  storeId,
  storeName,
  image,
  delta,              // diferencia contra el más barato (número positivo)
  isBest = false,
  samePrice = false,  // empata con el más barato
  verdict,            // reservado: 'caro' | 'normal' | 'barato'
  onPress,
  style,
}) {
  const Caja = onPress ? Pressable : View;

  return (
    <Caja
      onPress={onPress}
      style={({ pressed } = {}) => [styles.fila, pressed && styles.pressed, style]}
    >
      <View style={styles.imgCaja}>
        {image ? (
          <Image source={{ uri: image }} style={styles.img} resizeMode="contain" />
        ) : (
          <Ionicons name="image-outline" size={22} color={COLORS.textLow} />
        )}
      </View>

      <View style={styles.medio}>
        <Txt style={styles.nombre} numberOfLines={2}>{name}</Txt>
        <View style={styles.tiendaFila}>
          {storeId ? <StoreDot storeId={storeId} size={8} style={{ marginRight: 7 }} /> : null}
          {storeName ? (
            <Txt variant="caption" color={COLORS.textMid} style={styles.tienda}>{storeName}</Txt>
          ) : null}
          {unitPrice ? (
            <Txt variant="caption" color={COLORS.textLow} style={styles.unit}>· {unitPrice}</Txt>
          ) : null}
        </View>
      </View>

      <View style={styles.derecha}>
        <Txt style={[styles.precio, { color: isBest ? COLORS.income : COLORS.textHigh }]}>
          {formatUYU(price)}
        </Txt>
        {listPrice && listPrice > price ? (
          <Txt style={styles.tachado}>{formatUYU(listPrice)}</Txt>
        ) : samePrice ? (
          <Txt variant="caption" color={COLORS.textLow} style={styles.mismo}>mismo precio</Txt>
        ) : delta > 0 ? (
          <Txt style={styles.delta}>+{formatUYU(delta)}</Txt>
        ) : null}
      </View>
    </Caja>
  );
}

const styles = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.m + 2,
    padding: 13,
  },
  pressed: { opacity: 0.85 },
  imgCaja: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.s + 2,
    backgroundColor: COLORS.surfaceSunken,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  img: { width: '100%', height: '100%' },
  medio: { flex: 1, minWidth: 0, marginHorizontal: 13 },
  nombre: {
    fontFamily: FONTS.semibold,
    fontSize: 14.5,
    lineHeight: 19.5,
    color: COLORS.textHigh,
    marginBottom: 5,
  },
  tiendaFila: { flexDirection: 'row', alignItems: 'center' },
  tienda: { fontFamily: FONTS.medium, fontSize: 12.5, lineHeight: 15 },
  unit: { fontFamily: FONTS.medium, fontSize: 12.5, lineHeight: 15, marginLeft: 5, flexShrink: 1 },
  derecha: { alignItems: 'flex-end' },
  precio: { fontFamily: FONTS.amountBold, fontSize: 16, lineHeight: 19 },
  tachado: {
    fontFamily: FONTS.amount,
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.textLow,
    textDecorationLine: 'line-through',
  },
  delta: { fontFamily: FONTS.semibold, fontSize: 12, lineHeight: 16, color: COLORS.expense },
  mismo: { fontSize: 12, lineHeight: 16 },
});
