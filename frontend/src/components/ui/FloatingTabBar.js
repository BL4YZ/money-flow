import React, { useRef, useState, useEffect } from 'react';
import { View, Pressable, Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import Txt from './Text';
import { COLORS, GRADIENTS, RADIUS, SHADOWS, FONTS, MOTION } from '../../theme';

/**
 * Tab bar flotante de 6 items.
 *
 * El orden NO se toca: es navegación aprendida y cambiarlo rompe la memoria
 * muscular de cualquiera que ya use la app.
 *
 * El pill se desplaza en vez de aparecer y desaparecer por item. Para eso hay
 * que medir cada tab (`onLayout`) — no alcanza con repartir el ancho en seis
 * partes iguales porque las etiquetas tienen largos distintos.
 */
export default function FloatingTabBar({ state, navigation, tabs }) {
  const [medidas, setMedidas] = useState({});
  const x = useRef(new Animated.Value(0)).current;
  const w = useRef(new Animated.Value(0)).current;

  const activo = medidas[state.index];

  useEffect(() => {
    if (!activo) return;
    Animated.parallel([
      Animated.spring(x, { toValue: activo.x, ...MOTION.tabPill, useNativeDriver: false }),
      Animated.spring(w, { toValue: activo.width, ...MOTION.tabPill, useNativeDriver: false }),
    ]).start();
  }, [state.index, activo && activo.x, activo && activo.width]);

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      {/* Fade del contenido que scrollea por detrás. */}
      <LinearGradient colors={GRADIENTS.scrollFade} style={styles.fade} pointerEvents="none" />

      <View style={styles.barra}>
        {activo ? (
          <Animated.View style={[styles.pill, { left: x, width: w }]} pointerEvents="none" />
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
      </View>
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
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.full,
    paddingVertical: 7,
    paddingHorizontal: 8,
    ...SHADOWS.ambient,
  },
  pill: {
    position: 'absolute',
    top: 7,
    bottom: 7,
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
