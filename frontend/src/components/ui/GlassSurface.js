import React from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../theme';

/**
 * Superficie de vidrio, con tres niveles según lo que el dispositivo pueda dar.
 *
 * QUÉ ES CADA UNO, SIN ADORNOS:
 *
 *  1. LIQUID GLASS DE VERDAD (iOS 26+) — `expo-glass-effect` envuelve el
 *     `UIGlassEffect` de Apple. Es el material del sistema: refracta, tiene
 *     brillo especular en los cantos y se adapta al contenido de atrás en
 *     tiempo real. Nada de eso se puede escribir en JavaScript.
 *  2. DESENFOQUE REAL (iOS anterior, Android 12+) — `expo-blur` desenfoca lo
 *     que hay detrás de verdad, y le agregamos a mano el velo y el brillo del
 *     canto. Se parece; no es lo mismo. No refracta ni reacciona al contenido.
 *  3. SÓLIDO — si ningún módulo nativo está disponible (Expo Go sin el módulo,
 *     Android viejo), queda la superficie opaca de siempre. Fea antes que rota.
 *
 * Los `require` van envueltos porque en Expo Go un módulo nativo ausente tira
 * al importar, y una barra de navegación que no renderiza deja la app sin
 * navegación. Mismo patrón que `services/purchases.js`.
 */
let GlassView = null;
let hayLiquidGlass = () => false;
try {
  const glass = require('expo-glass-effect');
  GlassView = glass.GlassView;
  hayLiquidGlass = glass.isLiquidGlassAvailable;
} catch (_) {}

let BlurView = null;
try {
  BlurView = require('expo-blur').BlurView;
} catch (_) {}

// El desenfoque de Android llegó con RenderEffect (API 31). Por debajo de eso
// `expo-blur` pinta un velo translúcido y nada más, que con el borde brillante
// encima queda peor que la superficie sólida: se lee como un error de dibujo.
const hayDesenfoque =
  !!BlurView && (Platform.OS === 'ios' || (Platform.OS === 'android' && Platform.Version >= 31));

export const nivelDeVidrio = () => {
  if (GlassView && hayLiquidGlass()) return 'liquid';
  if (hayDesenfoque) return 'blur';
  return 'solido';
};

export default function GlassSurface({ style, children, radius, ...rest }) {
  const nivel = nivelDeVidrio();

  // El canto superior iluminado. En iOS 26 no se dibuja: el material del
  // sistema ya trae el suyo, y superponerle otro lo ensucia.
  const canto =
    nivel === 'liquid' ? null : (
      <LinearGradient
        colors={[COLORS.glassEdge, 'transparent']}
        style={styles.canto}
        pointerEvents="none"
      />
    );

  if (nivel === 'liquid') {
    return (
      <GlassView glassEffectStyle="regular" isInteractive style={style} {...rest}>
        {children}
      </GlassView>
    );
  }

  if (nivel === 'blur') {
    // El recorte va en una capa INTERIOR, no en la superficie.
    // `overflow: 'hidden'` y una sombra en la misma vista se pelean: iOS recorta
    // la sombra contra el borde y la barra flotante pierde justo lo que la hace
    // flotar. Asi la superficie conserva su sombra y el desenfoque se recorta
    // por su cuenta.
    return (
      <View style={style} {...rest}>
        <View
          style={[StyleSheet.absoluteFill, styles.recorta, radius ? { borderRadius: radius } : null]}
          pointerEvents="none"
        >
          <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.glassTint }]} />
          {canto}
        </View>
        {children}
      </View>
    );
  }

  return (
    <View style={[style, { backgroundColor: COLORS.surfaceRaised }]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // El desenfoque se dibuja en una capa absoluta, asi que la superficie tiene
  // que recortar: sin esto el blur se sale por las esquinas redondeadas.
  recorta: { overflow: 'hidden' },
  canto: { position: 'absolute', top: 0, left: 0, right: 0, height: 1.5 },
});
