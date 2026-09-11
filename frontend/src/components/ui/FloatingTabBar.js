import React, { useRef, useState, useEffect } from 'react';
import { View, Pressable, Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import Txt from './Text';
import GlassSurface, { nivelDeVidrio } from './GlassSurface';
import { COLORS, GRADIENTS, RADIUS, SHADOWS, FONTS, MOTION } from '../../theme';

/**
 * Tab bar flotante de 6 items.
 *
 * El orden NO se toca: es navegación aprendida y cambiarlo rompe la memoria
 * muscular de cualquiera que ya use la app.
 *
 * El pill se desplaza en vez de aparecer y desaparecer por item.
 *
 * SE ANIMA `translateX`, NO `left`, Y ESA ES LA DIFERENCIA ENTRE FLUIDO Y NO.
 * Antes se animaban `left` y `width` a la vez, y ninguna de las dos es una
 * propiedad que el hilo nativo pueda animar solo: obligaban a
 * `useNativeDriver: false`, o sea a que cada cuadro cruzara el puente hacia
 * JavaScript. Con la pantalla haciendo cualquier otra cosa —un fetch, un
 * re-render— eso se ve como tirones.
 *
 * `width` ademas nunca hizo falta: los seis items son `flex: 1`, asi que miden
 * todos igual. Se mide uno para saber el ancho y el pill solo se traslada, en
 * el hilo de UI, sin enterarse de lo que pase en JS.
 */
export default function FloatingTabBar({ state, navigation, tabs }) {
  const [medidas, setMedidas] = useState({});
  const x = useRef(new Animated.Value(0)).current;

  const activo = medidas[state.index];
  // Con vidrio el fondo opaco tiene que salir, o no se ve nada detras. Se
  // calcula una vez: no cambia durante la vida de la app.
  const vidrio = nivelDeVidrio() !== 'solido';

  useEffect(() => {
    if (!activo) return;
    // Un solo resorte, nativo. Si se toca otra pestaña a mitad de camino, el
    // resorte se re-apunta desde donde esta y con la velocidad que lleva: no
    // reinicia ni salta. Eso es lo que se siente como continuidad.
    Animated.spring(x, { toValue: activo.x, ...MOTION.tabPill, useNativeDriver: true }).start();
  }, [state.index, activo && activo.x]);

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      {/* Fade del contenido que scrollea por detrás. */}
      <LinearGradient colors={GRADIENTS.scrollFade} style={styles.fade} pointerEvents="none" />

      {/* La barra flota SOBRE el contenido, asi que ser de vidrio no es un
          adorno: deja ver que hay algo abajo y de paso hace que el fade de
          arriba tenga sentido. Sobre iOS 26 es el material del sistema; en el
          resto, desenfoque real con el canto iluminado a mano. Ver GlassSurface. */}
      <GlassSurface style={[styles.barra, vidrio && styles.barraVidrio]} radius={RADIUS.full}>
        {activo ? (
          <Animated.View
            style={[
              styles.pill,
              { width: activo.width, transform: [{ translateX: x }] },
            ]}
            pointerEvents="none"
          />
        ) : null}

        {state.routes.map((route, i) => {
          const tab = tabs.find((t) => t.name === route.name) || {};
          const focused = state.index === i;

          const onPress = () => {
            const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLayout={(ev) => {
                const { x: lx, width } = ev.nativeEvent.layout;
                setMedidas((m) =>
                  m[i] && m[i].x === lx && m[i].width === width ? m : { ...m, [i]: { x: lx, width } },
                );
              }}
              style={styles.item}
            >
              <Ionicons
                name={tab.icon ? tab.icon(focused) : 'ellipse-outline'}
                size={21}
                color={focused ? COLORS.textHigh : COLORS.textLow}
              />
              <Txt style={[styles.label, { color: focused ? COLORS.textHigh : COLORS.textLow }]}>
                {tab.label}
              </Txt>
            </Pressable>
          );
        })}
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    alignItems: 'center',
  },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 96 },
  barra: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginHorizontal: 14,
    marginBottom: 26,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.full,
    paddingVertical: 7,
    paddingHorizontal: 8,
    ...SHADOWS.ambient,
  },
  // Sobre vidrio el borde opaco delata el truco: pasa a una linea clara, que es
  // como se ve el canto de un cristal y no como un marco dibujado alrededor.
  barraVidrio: { borderColor: COLORS.glassBorder },
  pill: {
    position: 'absolute',
    top: 7,
    bottom: 7,
    left: 0,          // la posicion la pone translateX, que si es nativo
    backgroundColor: COLORS.primarySoft,
    borderRadius: RADIUS.full,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
  },
  label: { fontFamily: FONTS.bold, fontSize: 9.5, lineHeight: 12, marginTop: 3 },
});
