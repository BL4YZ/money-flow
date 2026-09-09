import React, { useRef } from 'react';
import { Pressable, Animated, ActivityIndicator, View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import Txt from './Text';
import { COLORS, GRADIENTS, RADIUS, SHADOWS, MOTION } from '../../theme';

/**
 * El botón. Reemplaza las 15 implementaciones que había (signInBtn, ctaBtn,
 * saveBtn, confirmBtn, depositBtn, generateBtn, compareBtn, addBtn, searchBtn,
 * detectAddBtn, refreshBtn, restoreBtn, lockedCta, clearBtn, addCatBtn).
 *
 * `premiumLocked` es dorado y no gris a propósito: el gris se leía como roto o
 * deshabilitado, cuando lo que comunica es valor, no falta de permiso.
 */

const SIZES = {
  sm: { minHeight: 36, radius: RADIUS.s + 2, padV: 10, padH: 15, variant: 'caption', icon: 15, gap: 6 },
  md: { minHeight: 48, radius: RADIUS.m,     padV: 14, padH: 22, variant: 'h2',      icon: 18, gap: 8 },
  lg: { minHeight: 56, radius: RADIUS.m + 2, padV: 17, padH: 26, variant: 'h2',      icon: 20, gap: 8 },
};

// Alto mínimo táctil. Aunque `sm` mida 36 de caja, el área tocable no baja de acá.
const HIT_MIN = 44;

function paleta(variant, disabled) {
  if (disabled) {
    return { bg: COLORS.surfaceSunken, border: 'transparent', fg: COLORS.textDisabled };
  }
  switch (variant) {
    case 'secondary':
      return { bg: COLORS.primarySoft, border: COLORS.primaryBorderSoft, fg: COLORS.textHigh };
    case 'ghost':
      return { bg: 'transparent', border: 'transparent', fg: COLORS.textMid };
    case 'destructive':
      return { bg: COLORS.errorSoft, border: COLORS.errorBorder, fg: COLORS.expense, iconFg: COLORS.error };
    case 'premiumLocked':
      return { bg: 'transparent', border: 'transparent', fg: COLORS.onPremium };
    case 'primary':
    default:
      return { bg: COLORS.primary, border: 'transparent', fg: COLORS.onPrimary };
  }
}

export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,                 // nombre de Ionicon
  iconRight = false,
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const s = SIZES[size] || SIZES.md;
  const inerte = disabled || loading;
  const p = paleta(variant, disabled);

  const anim = (to) =>
    Animated.spring(scale, { toValue: to, ...MOTION.press, useNativeDriver: true }).start();

  const contenido = (
    <>
      {loading ? (
        <ActivityIndicator size="small" color={p.fg} style={{ marginRight: s.gap }} />
      ) : icon && !iconRight ? (
        <Ionicons name={icon} size={s.icon} color={p.iconFg || p.fg} style={{ marginRight: s.gap }} />
      ) : null}
      <Txt variant={s.variant} color={p.fg}>{label}</Txt>
      {icon && iconRight && !loading ? (
        <Ionicons name={icon} size={s.icon} color={p.iconFg || p.fg} style={{ marginLeft: s.gap }} />
      ) : null}
    </>
  );

  const caja = [
    styles.base,
    {
      minHeight: Math.max(s.minHeight, HIT_MIN),
      borderRadius: s.radius,
      paddingVertical: s.padV,
      paddingHorizontal: s.padH,
    },
    fullWidth && styles.fullWidth,
  ];

  // El dorado es un gradiente, así que la caja la pinta LinearGradient y el
  // Pressable queda por fuera para no perder el área táctil.
  if (variant === 'premiumLocked' && !disabled) {
    return (
      <Animated.View style={[{ transform: [{ scale }] }, fullWidth && styles.fullWidth, SHADOWS.gold, style]}>
        <Pressable
          onPress={inerte ? undefined : onPress}
          onPressIn={() => !inerte && anim(0.98)}
          onPressOut={() => !inerte && anim(1)}
          disabled={inerte}
        >
          <LinearGradient
            colors={GRADIENTS.premium}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={caja}
          >
            {contenido}
          </LinearGradient>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[
        { transform: [{ scale }] },
        fullWidth && styles.fullWidth,
        variant === 'primary' && !inerte && SHADOWS.ambient,
        style,
      ]}
    >
      <Pressable
        onPress={inerte ? undefined : onPress}
        onPressIn={() => !inerte && anim(0.98)}
        onPressOut={() => !inerte && anim(1)}
        disabled={inerte}
        style={({ pressed }) => [
          caja,
          {
            backgroundColor: pressed && variant === 'primary' ? COLORS.primaryPressed : p.bg,
            borderWidth: p.border === 'transparent' ? 0 : 1.5,
            borderColor: p.border,
          },
        ]}
      >
        {contenido}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: { alignSelf: 'stretch' },
});
