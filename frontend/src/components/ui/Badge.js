import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import Txt from './Text';
import { COLORS, GRADIENTS, RADIUS, FONTS, storeDot } from '../../theme';

/**
 * Badges y pills. Reemplaza bestBadge (×3), storeDot, discountBadge, streakPill
 * y autoDebitBadge.
 *
 * El badge `estimate` es un componente y no letra chica a propósito: es la
 * pieza que sostiene la regla de que la proyección mensual es una estimación.
 * Si eso vive como texto gris de 11px al pie de una card, el primer rediseño
 * que busque "limpiar" lo borra.
 */

const VARIANTES = {
  best:        { bg: COLORS.successSoft,  border: COLORS.success,       fg: COLORS.success,   icon: 'pricetag' },
  discount:    { bg: COLORS.errorSoft,    border: COLORS.errorBorder,   fg: COLORS.expense },
  premium:     { gradiente: GRADIENTS.premium,                          fg: COLORS.onPremium, icon: 'diamond' },
  streak:      { bg: COLORS.premiumSoft,  border: COLORS.premiumBorder, fg: COLORS.warning,   icon: 'flame' },
  status:      { bg: COLORS.primarySoft,  border: COLORS.primaryBorderSoft, fg: COLORS.textHigh },
  statusMuted: { bg: COLORS.surfaceSunken,border: COLORS.borderStrong,  fg: COLORS.textMid },
  estimate:    { bg: COLORS.warningSoft,  border: COLORS.premiumBorder, fg: COLORS.warning,   icon: 'information-circle' },
};

export default function Badge({ variant = 'status', label, icon, style }) {
  const v = VARIANTES[variant] || VARIANTES.status;
  const nombreIcono = icon !== undefined ? icon : v.icon;

  const contenido = (
    <>
      {nombreIcono ? (
        <Ionicons name={nombreIcono} size={12} color={v.fg} style={{ marginRight: 5 }} />
      ) : null}
      <Txt style={[styles.txt, { color: v.fg }]}>{label}</Txt>
    </>
  );

  if (v.gradiente) {
    return (
      <LinearGradient
        colors={v.gradiente}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.pill, style]}
      >
        {contenido}
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.pill, { backgroundColor: v.bg, borderColor: v.border, borderWidth: 1.5 }, style]}>
      {contenido}
    </View>
  );
}

/**
 * El punto de color de una cadena. Es lo que permite escanear de qué tienda es
 * cada precio sin leer el nombre, así que no es decorativo — y por eso el color
 * sale de `storeDot`, que devuelve la variante con contraste suficiente sobre
 * el fondo oscuro cuando la marca original no lo tiene (Stadium es negro).
 */
export function StoreDot({ storeId, size = 9, style }) {
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: storeDot(storeId) },
        style,
      ]}
    />
  );
}

/**
 * Pill de tienda: punto de marca + nombre. El nombre va SIEMPRE en textHigh,
 * nunca en el color de la cadena — de los 16 colores de marca, 11 no llegan a
 * contraste de texto sobre el fondo y cinco no se ven ni como punto.
 */
export function StoreBadge({ storeId, name, style }) {
  return (
    <View style={[styles.pill, styles.storePill, style]}>
      <StoreDot storeId={storeId} style={{ marginRight: 7 }} />
      <Txt variant="caption" color={COLORS.textHigh} style={styles.storeName}>{name}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.full,
    paddingVertical: 6,
    paddingHorizontal: 11,
    alignSelf: 'flex-start',
  },
  txt: {
    fontFamily: FONTS.extrabold,
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 0.66,
    textTransform: 'uppercase',
  },
  storePill: {
    backgroundColor: COLORS.surfaceRaised,
    borderColor: COLORS.border,
    borderWidth: 1.5,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  storeName: { fontFamily: FONTS.semibold },
});
