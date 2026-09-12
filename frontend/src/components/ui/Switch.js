import React, { useEffect, useRef } from 'react';
import { Pressable, Animated, StyleSheet } from 'react-native';
import { GlassEdge, GlassFondo } from './GlassSurface';
import { COLORS, RADIUS, MOTION, estilos } from '../../theme';

const ANCHO = 46;
const ALTO = 28;
const KNOB = 22;
const RECORRIDO = ANCHO - KNOB - 6;

/**
 * Interruptor. Se usa el propio y no el `Switch` de RN porque el nativo pinta
 * con los colores del sistema en cada plataforma y rompe la paleta — que es
 * justamente lo que este rediseño viene a cerrar.
 *
 * Apagado es vidrio; encendido NO. El color del riel encendido es el estado:
 * si fuera translúcido habría que mirar la posición del botón para saber si
 * está activo, y eso es justo lo que un interruptor tiene que responder de un
 * vistazo. La perilla lleva su propio canto, que es lo que la levanta del riel.
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
      {value ? <GlassEdge radius={RADIUS.full} /> : <GlassFondo radius={RADIUS.full} />}
      <Animated.View
        style={[
          styles.knob,
          { backgroundColor: value ? COLORS.onPrimary : COLORS.textLow, transform: [{ translateX }] },
        ]}
      >
        <GlassEdge radius={KNOB / 2} />
      </Animated.View>
    </Pressable>
  );
}

// Se declara con `estilos()` y no con `StyleSheet.create` suelto: create COPIA
// los colores al cargar el modulo, asi que un cambio de tema en caliente no
// repintaria nada. Ver theme.js.
const styles = estilos(() => StyleSheet.create({
  track: {
    width: ANCHO,
    height: ALTO,
    overflow: 'hidden',      // el canto es absoluto: sin esto asoma en las esquinas
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  trackOff: { backgroundColor: 'transparent',        borderColor: COLORS.glassBorder },
  trackOn:  { backgroundColor: COLORS.primary,       borderColor: COLORS.primary },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2, overflow: 'hidden' },
  disabled: { opacity: 0.45 },
}));
