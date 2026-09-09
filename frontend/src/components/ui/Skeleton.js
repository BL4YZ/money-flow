import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { COLORS, RADIUS } from '../../theme';

/**
 * Bloque de carga. La regla del diseño: el skeleton tiene la MISMA geometría
 * que el componente real, y las listas nunca muestran un spinner suelto — un
 * spinner no dice cuánto viene ni cómo se va a ver, y acá los scrapes tardan
 * 5-12 segundos, que es demasiado para no mostrar nada.
 */
export default function Skeleton({ width, height = 12, radius = 6, style }) {
  const pulso = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulso, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: COLORS.borderSubtle, opacity: pulso },
        style,
      ]}
    />
  );
}

/**
 * Skeleton con la geometría exacta de OfferRow, para que la lista no salte
 * cuando llegan los datos.
 */
export function OfferRowSkeleton({ style }) {
  return (
    <View style={[styles.fila, style]}>
      <View style={styles.img} />
      <View style={styles.medio}>
        <Skeleton width="78%" height={12} radius={6} />
        <Skeleton width="44%" height={10} radius={5} style={{ marginTop: 9 }} />
      </View>
      <View style={styles.derecha}>
        <Skeleton width={62} height={14} radius={6} />
        <Skeleton width={40} height={9} radius={5} style={{ marginTop: 7 }} />
      </View>
    </View>
  );
}

/** Skeleton de card genérica: un título y dos líneas. */
export function CardSkeleton({ style }) {
  return (
    <View style={[styles.card, style]}>
      <Skeleton width="52%" height={14} radius={6} />
      <Skeleton width="84%" height={10} radius={5} style={{ marginTop: 12 }} />
      <Skeleton width="66%" height={10} radius={5} style={{ marginTop: 8 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.borderSubtle,
    borderRadius: RADIUS.m + 2,
    padding: 13,
  },
  img: {
    width: 60, height: 60, borderRadius: RADIUS.s + 2,
    backgroundColor: COLORS.surfaceRaised,
  },
  medio: { flex: 1, minWidth: 0, marginLeft: 13 },
  derecha: { alignItems: 'flex-end', marginLeft: 13 },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.borderSubtle,
    borderRadius: RADIUS.l,
    padding: 16,
  },
});
