import React, { useEffect, useRef } from 'react';
import { Pressable, Animated, StyleSheet } from 'react-native';
import { COLORS, RADIUS, MOTION } from '../../theme';

const ANCHO = 46;
const ALTO = 28;
const KNOB = 22;
const RECORRIDO = ANCHO - KNOB - 6;

/**
 * Interruptor. Se usa el propio y no el `Switch` de RN porque el nativo pinta
 * con los colores del sistema en cada plataforma y rompe la paleta — que es
 * justamente lo que este rediseño viene a cerrar.
 */
export default function Toggle({ value, onValueChange, disabled, style }) {
  const x = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(x, { toValue: value ? 1 : 0, ...MOTION.press, useNativeDriver: true }).start();
  }, [value]);

  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [0, RECORRIDO] });

  return (
    <Pressable
      onPress={disabled ? undefined : () => onValueChange && onValueChange(!value)}
      hitSlop={8}
      style={[
        styles.track,
        value ? styles.trackOn : styles.trackOff,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.knob,
          { backgroundColor: value ? COLORS.onPrimary : COLORS.textLow, transform: [{ translateX }] },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: ANCHO,
    height: ALTO,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  trackOff: { backgroundColor: COLORS.surfaceSunken, borderColor: COLORS.borderStrong },
  trackOn:  { backgroundColor: COLORS.primary,       borderColor: COLORS.primary },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2 },
  disabled: { opacity: 0.45 },
});
