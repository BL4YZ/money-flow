import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import Txt from './Text';
import { COLORS, GRADIENTS, RADIUS, SPACING, SHADOWS } from '../../theme';

/**
 * La card. Reemplaza emptyCard, insightCard, storeCard, resultCard, productCard
 * y bentoCell.
 *
 * `best` y `partial` no son decoración: sostienen la regla de honestidad de los
 * números. Una tienda con la lista incompleta se marca `partial` en ámbar
 * porque su total menor NO es un ahorro, y esa distinción tiene que ser visible
 * antes de leer la letra chica.
 */

const VARIANTES = {
  base:     { bg: COLORS.surface,       border: COLORS.border },
  raised:   { bg: COLORS.surfaceRaised, border: COLORS.border, sombra: SHADOWS.ambient },
  selected: { bg: COLORS.primarySoft,   border: COLORS.primary },
  best:     { bg: COLORS.successSoft,   border: COLORS.success, icon: 'checkmark-circle', tono: COLORS.success },
  partial:  { bg: COLORS.warningSoft,   border: COLORS.warning, icon: 'alert-circle',     tono: COLORS.warning },
  locked:   { bg: COLORS.surface,       border: COLORS.premiumBorder, sombra: SHADOWS.gold, icon: 'lock-closed', tono: COLORS.premium, velo: true },
};

export default function Card({
  variant = 'base',
  label,          // overline opcional; en best/partial/locked viene con su icono
  onPress,
  style,
  contentStyle,
  children,
}) {
  const v = VARIANTES[variant] || VARIANTES.base;

  const cabecera = label ? (
    <View style={styles.labelRow}>
      {v.icon ? <Ionicons name={v.icon} size={15} color={v.tono} style={{ marginRight: 7 }} /> : null}
      <Txt variant="overline" color={v.tono || COLORS.textLow}>{label}</Txt>
    </View>
  ) : null;

  const cuerpo = (
    <>
      {/* El velo dorado va detrás del contenido, no encima: encima apagaría el texto. */}
      {v.velo ? (
        <LinearGradient
          colors={GRADIENTS.lockedVeil}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}
      <View style={contentStyle}>
        {cabecera}
        {children}
      </View>
    </>
  );

  const caja = [
    styles.card,
    { backgroundColor: v.bg, borderColor: v.border },
    v.sombra,
    style,
  ];

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [caja, pressed && styles.pressed]}>
        {cuerpo}
      </Pressable>
    );
  }
  return <View style={caja}>{cuerpo}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.l,
    borderWidth: 1.5,
    padding: SPACING.m,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.85 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
});
