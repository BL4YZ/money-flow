import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Txt from './Text';
import { GlassEdge, GlassFondo } from './GlassSurface';
import { COLORS, RADIUS, FONTS, TYPE } from '../../theme';

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
export function Segmented({ options, value, onChange, tone, style }) {
  return (
    <View style={[styles.track, style]}>
      <GlassFondo radius={RADIUS.full} />
      {options.map((o) => {
        const val = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : o.label;
        const activo = val === value;
        const bg = tone && activo ? tone : COLORS.primary;
        const fg = tone && activo ? COLORS.onExpense : COLORS.onPrimary;
        return (
          <Pressable
            key={val}
            onPress={() => onChange && onChange(val)}
            style={[styles.segment, activo && { backgroundColor: bg }]}
          >
            {/* Solo el seleccionado: el canto marca lo que esta por encima, y
                un riel entero iluminado no distingue nada. */}
            {activo ? <GlassEdge radius={RADIUS.full} /> : null}
            <Txt style={[styles.segmentTxt, { color: activo ? fg : COLORS.textMid }]}>
              {label}
            </Txt>
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
    padding: 4,
  },
  segment: {
    overflow: 'hidden',
    borderRadius: RADIUS.full,
    paddingVertical: 9,
    paddingHorizontal: 18,
  },
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
