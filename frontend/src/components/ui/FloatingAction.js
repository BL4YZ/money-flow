import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Txt from './Text';
import { GlassEdge, GlassPieza, nivelDeVidrio } from './GlassSurface';
import { COLORS, RADIUS, SPACING, SHADOWS, MOTION } from '../../theme';

/**
 * El botón flotante de la acción principal de una pantalla.
 *
 * POR QUÉ EXISTE. La única forma de cargar un ingreso o un gasto era un "+" de
 * 19px en `textMid` dentro del encabezado, al lado del avatar y de los botones
 * de idioma y salir. Ahí no se lee como la acción principal de la pantalla: se
 * lee como un icono de utilidad más, del mismo color y del mismo tamaño que
 * los que no hacen nada importante. Reportado por usuarios, textual: no
 * entienden qué hacer en la pantalla de inicio ni cómo agregar un movimiento.
 *
 * LA TENSIÓN DEL DISEÑO, Y CÓMO SE RESUELVE. Se pidió vidrio como la barra de
 * navegación, pero el vidrio es discreto por naturaleza y acá el problema es
 * justamente que no se ve. La regla que ya gobierna los botones de esta app
 * resuelve las dos cosas: el material puede ser vidrio, el COLOR es el dato. En
 * iOS 26 esto es vidrio de verdad —refracta y se deforma bajo el dedo— pero
 * TEÑIDO en hueso al 72%, que compone 8.34:1 contra el icono oscuro; medido,
 * no elegido a ojo (ver `glassAction` en theme.js). Fuera de iOS 26 no hay
 * material que teñir, así que queda el relleno sólido: feo antes que invisible.
 *
 * LLEVA ETIQUETA, y es el mismo argumento que ya se usó en la barra de
 * pestañas: un icono solo no alcanza cuando la pregunta del usuario es "¿qué
 * hago acá?". Un "+" pelado sigue exigiendo que lo interpreten.
 *
 * La sombra va en la vista de AFUERA. `overflow: 'hidden'` y una sombra en la
 * misma vista se pelean —iOS recorta la sombra contra el borde— y sin sombra
 * un botón flotante deja de flotar, que es lo que lo despega del contenido.
 */
export default function FloatingAction({
  icon = 'add',
  label,
  onPress,
  // Queda por encima de la barra de pestañas flotante, no encima de ella.
  bottom = 104,
  style,
}) {
  const escala = useRef(new Animated.Value(1)).current;
  const liquido = nivelDeVidrio() === 'liquid';

  const anim = (a) =>
    Animated.spring(escala, { toValue: a, ...MOTION.press, useNativeDriver: true }).start();

  const contenido = (
    <>
      <Ionicons name={icon} size={21} color={COLORS.onPrimary} />
      {label ? (
        <Txt variant="h2" color={COLORS.onPrimary} style={styles.label}>{label}</Txt>
      ) : null}
    </>
  );

  return (
    <Animated.View
      style={[styles.raiz, { bottom, transform: [{ scale: escala }] }, SHADOWS.glow, style]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={() => anim(0.96)}
        onPressOut={() => anim(1)}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {liquido ? (
          // El Pressable va por FUERA para que el vidrio reciba el toque: sin
          // eso `isInteractive` no se entera del contacto y se pierde la única
          // parte genuinamente líquida del material.
          <GlassPieza
            tinte={COLORS.glassAction}
            radius={RADIUS.full}
            interactivo
            style={styles.caja}
          >
            {contenido}
          </GlassPieza>
        ) : (
          <View style={[styles.caja, styles.solido]}>
            <GlassEdge radius={RADIUS.full} />
            {contenido}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  raiz: { position: 'absolute', right: SPACING.m },
  caja: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 20,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  solido: { backgroundColor: COLORS.primary },
  label: { marginLeft: 7 },
});
