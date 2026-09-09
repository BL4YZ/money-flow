import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Txt from './Text';
import { COLORS, RADIUS, FONTS } from '../../theme';

/**
 * Progreso. Reemplaza progressBar/Track/Fill (×3), ringOverlay, ringContainer y
 * ringOuter/Inner.
 *
 * La barra tiene un estado de SOBREGIRO que no es sólo "roja": se parte en dos
 * tramos, lo presupuestado y el excedente, y dice cuánto se pasó. Una barra al
 * 100% en rojo no distingue "gastaste justo" de "gastaste el doble".
 */

const ALTO = 8;

export function ProgressBar({
  value,
  max,
  label,
  detail,
  color = COLORS.primary,
  style,
}) {
  const v = Number(value) || 0;
  const m = Number(max) || 0;
  const sobregiro = m > 0 && v > m;
  const pct = m > 0 ? Math.min(1, v / m) : 0;

  // En sobregiro la barra se llena entera: el primer tramo es lo presupuestado
  // (proporcional) y el segundo el excedente.
  const tramoPresupuesto = sobregiro ? m / v : pct;
  const tono = sobregiro ? COLORS.expense : color;

  return (
    <View style={style}>
      {(label || detail) ? (
        <View style={styles.fila}>
          {label ? (
            <Txt variant="caption" color={sobregiro ? COLORS.expense : COLORS.textMid} style={styles.label}>
              {label}
            </Txt>
          ) : null}
          {detail ? (
            <Txt variant="amount" color={sobregiro ? COLORS.expense : COLORS.textMid} style={styles.detail}>
              {detail}
            </Txt>
          ) : null}
        </View>
      ) : null}

      <View style={styles.track}>
        <View style={{ width: `${tramoPresupuesto * 100}%`, height: '100%', backgroundColor: tono }} />
        {sobregiro ? (
          <View style={{ width: `${(1 - tramoPresupuesto) * 100}%`, height: '100%', backgroundColor: COLORS.error }} />
        ) : null}
      </View>

      {sobregiro ? (
        <Txt variant="caption" color={COLORS.expense} style={styles.aviso}>
          {`$${Math.round(v - m).toLocaleString('es-UY')} por encima del presupuesto`}
        </Txt>
      ) : null}
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const ANILLOS = {
  lg: { size: 112, stroke: 12,  pctVariant: 'amountXL', pctSize: 22 },
  md: { size: 72,  stroke: 8,   pctVariant: 'amountXL', pctSize: 15 },
  sm: { size: 44,  stroke: 5.5, pctVariant: 'amount',   pctSize: 0  },
};

/**
 * Anillo de progreso. En el HTML del diseño está simulado con conic-gradient,
 * que no existe en RN; acá es react-native-svg con strokeDashoffset animado.
 *
 * DOS COSAS QUE NO SE PUEDEN CAMBIAR SIN ROMPERLO:
 *
 * 1. `strokeDasharray` va como ARRAY. Con un número suelto react-native-svg no
 *    arma bien el patrón y sólo se dibuja el casquete redondeado del principio
 *    — se ve un puntito arriba en vez del arco.
 * 2. La rotación va por `rotation` + `originX/originY`, no por un `transform`
 *    en string: el componente está envuelto en Animated y el string no
 *    sobrevive de forma confiable.
 */
export function ProgressRing({
  value = 0,           // 0..1
  size = 'md',
  color = COLORS.primary,
  label,               // texto bajo el porcentaje (sólo en lg)
  showPct = true,
  style,
}) {
  const a = ANILLOS[size] || ANILLOS.md;
  const radio = (a.size - a.stroke) / 2;
  const circunferencia = 2 * Math.PI * radio;
  const pct = Math.max(0, Math.min(1, Number(value) || 0));
  const centro = a.size / 2;

  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: pct,
      duration: 650,
      useNativeDriver: false,   // strokeDashoffset no es una prop nativa animable
    }).start();
  }, [pct]);

  const offset = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [circunferencia, 0],
  });

  return (
    <View style={[{ width: a.size, height: a.size }, style]}>
      <Svg width={a.size} height={a.size}>
        <Circle
          cx={centro} cy={centro} r={radio}
          stroke={COLORS.border} strokeWidth={a.stroke} fill="none"
        />
        <AnimatedCircle
          cx={centro} cy={centro} r={radio}
          stroke={color} strokeWidth={a.stroke} fill="none"
          strokeLinecap="round"
          strokeDasharray={[circunferencia, circunferencia]}
          strokeDashoffset={offset}
          rotation={-90}
          originX={centro}
          originY={centro}
        />
      </Svg>

      {/* La capa del texto va con los cuatro lados en 0 y explícitos: es lo que
          garantiza que quede centrada DENTRO del anillo y no pueda desbordar la
          card de abajo. */}
      {showPct && a.pctSize > 0 ? (
        <View style={styles.centro} pointerEvents="none">
          <Txt
            numberOfLines={1}
            style={{ fontFamily: FONTS.amountBold, fontSize: a.pctSize, color: COLORS.textHigh }}
          >
            {Math.round(pct * 100)}%
          </Txt>
          {label && size === 'lg' ? (
            <Txt variant="caption" color={COLORS.textLow} style={styles.anilloLabel} numberOfLines={1}>
              {label}
            </Txt>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  label: { fontFamily: FONTS.semibold },
  detail: { fontSize: 13, lineHeight: 16 },
  track: {
    flexDirection: 'row',
    height: ALTO,
    backgroundColor: COLORS.surfaceSunken,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  aviso: { marginTop: 6, fontSize: 12 },
  centro: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  anilloLabel: { fontFamily: FONTS.semibold, fontSize: 10, lineHeight: 12, marginTop: 2 },
});

export default ProgressBar;
