import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Txt from './Text';
import { COLORS, RADIUS, FONTS, estilos } from '../../theme';

const ALTO = 104;
const ALTO_BARRA_MAX = 64;
const ALTO_BARRA_MIN = 6;   // una barra de 0 igual se ve, para no leerse como "falta el dato"

/**
 * Barras compactas. Reemplaza los dos PieChart de `react-native-chart-kit` que
 * ocupaban media pantalla cada uno y empujaban categorías y movimientos abajo
 * del pliegue — que era la razón principal por la que el Dashboard no se
 * parecía al diseño.
 *
 * Son Views con altura, no una librería de gráficos: a esta escala un canvas no
 * aporta nada y traía una dependencia entera con su propia paleta.
 *
 * El toggle de la derecha es lo que salva el dato que mostraban las tortas: la
 * misma caja alterna entre la serie por MES y el desglose por CATEGORÍA.
 */
export default function BarChart({
  data,              // [{ label, value, active }]
  mode,              // 'mes' | 'cat'
  onModeChange,
  style,
}) {
  const max = Math.max(1, ...data.map((d) => Math.abs(Number(d.value) || 0)));

  return (
    <View style={[styles.caja, style]}>
      {data.map((d, i) => {
        const v = Math.abs(Number(d.value) || 0);
        const alto = Math.max(ALTO_BARRA_MIN, Math.round((v / max) * ALTO_BARRA_MAX));
        return (
          <View key={`${d.label}-${i}`} style={styles.col}>
            <View
              style={[
                styles.barra,
                { height: alto, backgroundColor: d.active ? COLORS.primary : COLORS.border },
              ]}
            />
            <Txt
              style={[
                styles.label,
                d.active ? styles.labelActivo : styles.labelIdle,
              ]}
              numberOfLines={1}
            >
              {d.label}
            </Txt>
          </View>
        );
      })}

      {onModeChange ? (
        <View style={styles.toggle}>
          {[{ id: 'mes', label: 'Mes' }, { id: 'cat', label: 'Cat' }].map((o) => {
            const on = mode === o.id;
            return (
              <Pressable
                key={o.id}
                onPress={() => onModeChange(o.id)}
                style={[styles.toggleBtn, on && styles.toggleBtnOn]}
              >
                <Txt style={[styles.toggleTxt, { color: on ? COLORS.onPrimary : COLORS.textLow }]}>
                  {o.label}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

// Se declara con `estilos()` y no con `StyleSheet.create` suelto: create COPIA
// los colores al cargar el modulo, asi que un cambio de tema en caliente no
// repintaria nada. Ver theme.js.
const styles = estilos(() => StyleSheet.create({
  caja: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: ALTO,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.l,
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  col: { flex: 1, alignItems: 'center' },
  barra: { width: '100%', maxWidth: 20, borderRadius: 5 },
  label: { fontSize: 9.5, lineHeight: 12, marginTop: 6 },
  labelIdle: { fontFamily: FONTS.medium, color: COLORS.textLow },
  labelActivo: { fontFamily: FONTS.bold, color: COLORS.textHigh },

  toggle: {
    justifyContent: 'flex-end',
    alignSelf: 'stretch',
    paddingLeft: 6,
    marginLeft: 4,
    borderLeftWidth: 1.5,
    borderLeftColor: COLORS.borderSubtle,
  },
  toggleBtn: { paddingVertical: 5, paddingHorizontal: 7, borderRadius: 6, marginTop: 4 },
  toggleBtnOn: { backgroundColor: COLORS.primary },
  toggleTxt: { fontFamily: FONTS.bold, fontSize: 9.5, lineHeight: 12 },
}));
