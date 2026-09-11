import React, { useRef, useState, useEffect } from 'react';
import { View, Pressable, Animated, PanResponder, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Txt from './Text';
import { GlassEdge, GlassFondo } from './GlassSurface';
import { COLORS, RADIUS, FONTS, TYPE, MOTION } from '../../theme';

/**
 * Chips. Reemplaza catChip, chip, sortChip, itemChip, freqBtn y chartToggleBtn
 * — seis variantes de la misma idea que existían por separado.
 */

export default function Chip({ label, active, onPress, icon, style }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active ? styles.chipActive : styles.chipIdle,
        pressed && styles.pressed,
        style,
      ]}
    >
      {/* En reposo es vidrio de verdad; elegido, su color con el canto. Asi el
          contraste entre los dos estados sigue siendo evidente. */}
      {active ? <GlassEdge radius={RADIUS.full} /> : <GlassFondo radius={RADIUS.full} />}
      {icon ? (
        <Ionicons
          name={icon}
          size={13}
          color={active ? COLORS.textHigh : COLORS.textMid}
          style={{ marginRight: 6 }}
        />
      ) : null}
      <Txt style={[styles.chipTxt, active ? styles.chipTxtActive : styles.chipTxtIdle]}>
        {label}
      </Txt>
    </Pressable>
  );
}

/**
 * Chip de orden: igual al de filtro pero con la flecha de dirección cuando está
 * activo, porque "Precio" sin dirección no dice si ordena ascendente.
 */
export function SortChip({ label, active, desc, onPress, style }) {
  return (
    <Chip
      label={label}
      active={active}
      onPress={onPress}
      icon={active ? (desc ? 'arrow-down' : 'arrow-up') : undefined}
      style={style}
    />
  );
}

/**
 * Segmented control. `tone` permite que el toggle Ingreso/Egreso pinte el
 * seleccionado con el color del dato en vez del hueso neutro.
 */
const PAD = 4;   // padding del riel; lo necesita el arrastre para ubicar el dedo

export function Segmented({ options, value, onChange, tone, style }) {
  // TODOS LOS SEGMENTOS MIDEN IGUAL, y eso no es cosmético: con anchos
  // distintos el pill tendría que animar `width`, que obliga a salir del hilo
  // nativo. Se mide el más ancho y se aplica a todos, así el pill sólo se
  // traslada. Además es como se ven los segmented de iOS.
  const [ancho, setAncho] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const i = options.findIndex((o) => (typeof o === 'string' ? o : o.value) === value);

  useEffect(() => {
    if (ancho === 0 || i < 0) return;
    Animated.spring(x, { toValue: i * ancho, ...MOTION.snappy, useNativeDriver: true }).start();
  }, [i, ancho]);

  const activo = i >= 0;
  const tinte = tone || COLORS.primary;

  // ARRASTRE. En iOS se apoya el dedo y se corre entre las opciones; con solo
  // taps cada cambio es un salto y el pill nunca acompana al dedo.
  //
  // DOS TRAMPAS, las dos evitadas a proposito:
  //
  //  1. El PanResponder se crea UNA vez, asi que si leyera `ancho`, `value` u
  //     `options` directo se quedaria con los de la primera pasada — y `ancho`
  //     todavia vale 0 ahi. Por eso lee de un ref que se actualiza en cada
  //     render.
  //  2. Se mide por DESPLAZAMIENTO (`dx`), no por posicion. `locationX` cambia
  //     de sistema de coordenadas cuando el dedo pasa sobre un hijo, asi que
  //     una posicion absoluta salta sola al cruzar de segmento. El indice de
  //     partida mas cuantos anchos se corrio no tiene ese problema.
  const vivo = useRef({});
  vivo.current = { ancho, options, value, onChange, i };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 4 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => { vivo.current.desde = vivo.current.i; },
      onPanResponderMove: (_e, g) => {
        const v = vivo.current;
        if (!v.ancho || v.desde == null || v.desde < 0) return;
        const k = Math.max(0, Math.min(v.options.length - 1, v.desde + Math.round(g.dx / v.ancho)));
        const val = typeof v.options[k] === 'string' ? v.options[k] : v.options[k].value;
        if (val !== v.value) v.onChange && v.onChange(val);
      },
    }),
  ).current;

  return (
    // GlassContainer quedo afuera: en el dispositivo dibujaba una mancha oscura
    // pegada al pill que ademas tapaba la etiqueta de al lado. El efecto de
    // fusion existe, pero no con un pill claro sobre fondo oscuro y etiquetas
    // debajo. El pill vuelve a ser color solido, que es lo que se lee bien.
    <View style={[styles.track, style]} {...pan.panHandlers}>
      <GlassFondo radius={RADIUS.full} />

      {/* El pill DESLIZA en vez de saltar de un segmento a otro. Antes el fondo
          simplemente cambiaba de lugar, y sin movimiento no hay nada que se lea
          como continuidad. */}
      {activo && ancho > 0 ? (
        <Animated.View
          style={[styles.pill, { width: ancho, backgroundColor: tinte, transform: [{ translateX: x }] }]}
          pointerEvents="none"
        />
      ) : null}

      {options.map((o, k) => {
        const val = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : o.label;
        const esActivo = val === value;
        const fg = tone && esActivo ? COLORS.onExpense : esActivo ? COLORS.onPrimary : COLORS.textMid;
        return (
          <Pressable
            key={val}
            onPress={() => onChange && onChange(val)}
            onLayout={(ev) => {
              const w = ev.nativeEvent.layout.width;
              setAncho((prev) => (w > prev ? w : prev));   // el más ancho manda
            }}
            style={[styles.segment, ancho > 0 && { width: ancho }]}
          >
            <Txt style={[styles.segmentTxt, { color: fg }]}>{label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Ítem de la lista de compras: nombre + cantidad + borrar.
 */
export function ListItemChip({ label, qty = 1, onRemove, style }) {
  return (
    <View style={[styles.chip, styles.chipIdle, styles.itemChip, style]}>
      <Txt style={styles.itemName}>{label}</Txt>
      <View style={styles.qtyPill}>
        <Txt style={styles.qtyTxt}>×{qty}</Txt>
      </View>
      <Pressable
        onPress={onRemove}
        hitSlop={8}
        style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}
      >
        <Ionicons name="close" size={13} color={COLORS.textMid} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',      // el canto es absoluto: sin esto asoma en las esquinas
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipIdle:   { backgroundColor: 'transparent',        borderColor: COLORS.glassBorder },
  chipActive: { backgroundColor: COLORS.primarySoft,   borderColor: COLORS.primaryBorderSoft },
  pressed:    { opacity: 0.7 },
  chipTxt:       { fontSize: 13, lineHeight: 16 },
  chipTxtIdle:   { fontFamily: FONTS.semibold, color: COLORS.textMid },
  chipTxtActive: { fontFamily: FONTS.bold,     color: COLORS.textHigh },

  track: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: COLORS.glassBorder,
    borderRadius: RADIUS.full,
    padding: PAD,
  },
  segment: {
    borderRadius: RADIUS.full,
    paddingVertical: 9,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  // Va detrás de las etiquetas: el texto del seleccionado tiene que leerse
  // POR ENCIMA del vidrio, no a través de él.
  pill: { position: 'absolute', top: PAD, bottom: PAD, left: PAD, borderRadius: RADIUS.full },
  segmentTxt: { fontFamily: FONTS.bold, fontSize: 13, lineHeight: 16 },

  itemChip: { paddingVertical: 7, paddingRight: 8, paddingLeft: 14 },
  itemName: { ...TYPE.caption, fontFamily: FONTS.semibold, fontSize: 13.5, color: COLORS.textHigh },
  qtyPill: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: RADIUS.full,
    paddingVertical: 4,
    paddingHorizontal: 7,
    marginLeft: 9,
  },
  qtyTxt: { fontFamily: FONTS.amountBold, fontSize: 12, lineHeight: 14, color: COLORS.textHigh },
  removeBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 9,
  },
});
