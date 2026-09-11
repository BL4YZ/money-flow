import React, { useRef, useState, useEffect } from 'react';
import { View, Pressable, Animated, PanResponder, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import Txt from './Text';
import GlassSurface, { GlassPieza, nivelDeVidrio } from './GlassSurface';
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

  // ARRASTRE, igual que el selector de moneda: se apoya el dedo y se corre
  // entre las pestanas. Mismas dos trampas evitadas —el PanResponder se crea
  // una sola vez, asi que lee de un ref y no de su closure; y mide por
  // DESPLAZAMIENTO y no por posicion, porque `locationX` cambia de sistema de
  // coordenadas al cruzar sobre un Pressable hijo.
  //
  // Solo navega cuando el indice CAMBIA: sin eso, un arrastre de dos pestanas
  // dispararia una navegacion por cada cuadro del gesto.
  const vivo = useRef({});
  vivo.current = { ancho: activo && activo.width, indice: state.index, rutas: state.routes, navigation };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderGrant: () => { vivo.current.desde = vivo.current.indice; },
      onPanResponderMove: (_e, g) => {
        const v = vivo.current;
        if (!v.ancho || v.desde == null) return;
        const k = Math.max(0, Math.min(v.rutas.length - 1, v.desde + Math.round(g.dx / v.ancho)));
        if (k !== v.indice) v.navigation.navigate(v.rutas[k].name);
      },
    }),
  ).current;

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      {/* EL FADE SOLO EXISTE SI NO HAY VIDRIO.
          `scrollFade` termina en el fondo OPACO de la app, en una banda de 96px
          donde la barra entra entera — asi que el vidrio estaba refractando un
          rectangulo oscuro solido y no habia nada que ver a traves. Era la razon
          de que no se pareciera a la barra de WhatsApp.
          Con vidrio real el degradado sobra: el propio material es lo que separa
          la barra del contenido, y dejar pasar lo de atras es justamente el
          efecto. Sin vidrio sigue haciendo falta, o el contenido se corta seco. */}
      {vidrio ? null : (
        <LinearGradient colors={GRADIENTS.scrollFade} style={styles.fade} pointerEvents="none" />
      )}

      {/* La barra flota SOBRE el contenido, asi que ser de vidrio no es un
          adorno: deja ver que hay algo abajo y de paso hace que el fade de
          arriba tenga sentido. Sobre iOS 26 es el material del sistema; en el
          resto, desenfoque real con el canto iluminado a mano. Ver GlassSurface. */}
      <GlassSurface
        style={[styles.barra, vidrio && styles.barraVidrio]}
        radius={RADIUS.full}
        estilo="clear"
        {...pan.panHandlers}
      >
        {/* VIDRIO SOBRE VIDRIO, como el pill de WhatsApp. Un rectangulo de color
            solido encima de una barra transparente se lee como una mancha
            pintada; una pieza de vidrio tenue se lee como parte del mismo
            cristal, apenas mas densa donde estas parado.
            Sin GlassContainer: la fusion entre piezas ya se probo en el
            selector de moneda y dibujaba una mancha oscura. */}
        {activo ? (
          <GlassPieza
            tinte={COLORS.primarySoft}
            radius={RADIUS.full}
            style={[styles.pill, { width: activo.width, transform: [{ translateX: x }] }]}
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
  // SIN BORDE sobre vidrio. Una linea dibujada alrededor es justo lo que
  // delata que es un panel pintado: en el material de Apple el canto lo define
  // la refraccion, y por eso la barra de WhatsApp no tiene ningun borde.
  barraVidrio: { borderWidth: 0 },
  pill: {
    position: 'absolute',
    top: 7,
    bottom: 7,
    left: 0,          // la posicion la pone translateX, que si es nativo
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
