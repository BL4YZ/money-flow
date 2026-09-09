import React, { useState } from 'react';
import { View, TextInput, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Txt from './Text';
import { COLORS, RADIUS, FONTS, TYPE } from '../../theme';

/**
 * El input. Reemplaza input, inputRow, inputIcon y searchInput.
 *
 * El halo de foco se hace con un contenedor que aporta 3px de color, no con
 * sombra: en Android `shadow*` no dibuja halos (sólo `elevation`, que proyecta
 * hacia abajo), así que una sombra sin desplazamiento se vería en iOS y no en
 * Android — el tipo de diferencia que aparece recién en un dispositivo real.
 */
export default function Input({
  value,
  onChangeText,
  placeholder,
  icon,                 // Ionicon a la izquierda
  money = false,        // prefijo $ en bloque, valor en mono
  error,                // string: pinta el borde y muestra el texto de ayuda
  onClear,
  suggestions,          // array de strings; se muestran pegadas abajo
  onSelectSuggestion,
  style,
  inputStyle,
  ...rest
}) {
  const [focused, setFocused] = useState(false);
  const abierto = !!(suggestions && suggestions.length);
  const borde = error ? COLORS.error : focused ? COLORS.primary : COLORS.border;

  return (
    <View style={style}>
      <View style={[styles.halo, focused && !error && styles.haloOn]}>
        <View
          style={[
            styles.caja,
            { borderColor: borde },
            money && styles.cajaMoney,
            abierto && styles.cajaConLista,
          ]}
        >
          {money ? (
            <View style={styles.prefijo}>
              <Txt variant="amount" color={COLORS.textMid} style={styles.prefijoTxt}>$</Txt>
            </View>
          ) : icon ? (
            <Ionicons
              name={icon}
              size={19}
              color={focused ? COLORS.primary : COLORS.textMid}
              style={styles.iconoIzq}
            />
          ) : null}

          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={COLORS.textLow}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={[styles.input, money && styles.inputMoney, inputStyle]}
            {...rest}
          />

          {error ? (
            <Ionicons name="alert-circle" size={19} color={COLORS.error} style={styles.iconoDer} />
          ) : onClear && value ? (
            <Pressable onPress={onClear} hitSlop={8} style={styles.clear}>
              <Ionicons name="close" size={13} color={COLORS.textMid} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {abierto ? (
        <View style={styles.lista}>
          {suggestions.map((s, i) => (
            <Pressable
              key={`${s}-${i}`}
              onPress={() => onSelectSuggestion && onSelectSuggestion(s)}
              style={({ pressed }) => [
                styles.sugerencia,
                i < suggestions.length - 1 && styles.sugerenciaBorde,
                pressed && { backgroundColor: COLORS.surfaceSunken },
              ]}
            >
              <Txt variant="caption" color={COLORS.textHigh} style={styles.sugerenciaTxt}>{s}</Txt>
            </Pressable>
          ))}
        </View>
      ) : null}

      {error ? (
        <Txt variant="caption" color={COLORS.expense} style={styles.error}>{error}</Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  halo: { borderRadius: RADIUS.m + 3, padding: 3, margin: -3 },
  haloOn: { backgroundColor: COLORS.focusHalo },
  caja: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1.5,
    borderRadius: RADIUS.m,
    paddingHorizontal: 16,
    minHeight: 50,
  },
  cajaMoney: { paddingLeft: 0 },
  cajaConLista: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomColor: COLORS.borderSubtle },
  prefijo: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: 15,
    backgroundColor: COLORS.surfaceSunken,
    borderTopLeftRadius: RADIUS.m - 1,
    borderBottomLeftRadius: RADIUS.m - 1,
    marginRight: 2,
  },
  prefijoTxt: { fontFamily: FONTS.amountBold, fontSize: 17 },
  iconoIzq: { marginRight: 10 },
  iconoDer: { marginLeft: 10 },
  input: {
    flex: 1,
    ...TYPE.body,
    color: COLORS.textHigh,
    paddingVertical: 14,
  },
  inputMoney: { ...TYPE.amount, fontSize: 17, paddingVertical: 15 },
  clear: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  lista: {
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderColor: COLORS.border,
    borderBottomLeftRadius: RADIUS.m,
    borderBottomRightRadius: RADIUS.m,
    overflow: 'hidden',
  },
  sugerencia: { paddingVertical: 12, paddingHorizontal: 16 },
  sugerenciaBorde: { borderBottomWidth: 1, borderBottomColor: COLORS.borderSubtle },
  sugerenciaTxt: { fontFamily: FONTS.medium, fontSize: 14 },
  error: { marginTop: 7, fontSize: 12.5 },
});
