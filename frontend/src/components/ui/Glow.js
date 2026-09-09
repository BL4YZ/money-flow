import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { COLORS } from '../../theme';

/**
 * Halo radial de la esquina superior. Es lo que da profundidad al fondo plano y
 * está en todas las pantallas de tab.
 *
 * Va en SVG y no en expo-linear-gradient porque **RN no tiene gradiente
 * radial**: `LinearGradient` sólo interpola en una dirección, y aproximar un
 * halo con capas lineales deja bandas visibles sobre un fondo tan oscuro.
 *
 * `pointerEvents="none"` es obligatorio: se dibuja por encima del fondo pero
 * debajo del contenido, y sin eso se come los toques de lo que tiene detrás.
 */
export default function Glow({
  color = COLORS.accent,
  size = 300,
  opacity = 0.14,
  top = -90,
  left,
  right,
  style,
}) {
  // Cada pantalla lo ancla de un lado distinto; si no se pide ninguno, izquierda.
  const lado = right != null ? { right } : { left: left != null ? left : -40 };

  return (
    <View
      style={[styles.wrap, { top, ...lado, width: size, height: size }, style]}
      pointerEvents="none"
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={opacity} />
            {/* El corte al 70% es el del diseño: más allá el halo ya no se
                distingue del fondo y sólo agrega banding. */}
            <Stop offset="70%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={size} height={size} fill="url(#glow)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', zIndex: 0 },
});
