import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Txt from './Text';
import { COLORS, RADIUS, FONTS } from '../../theme';

/**
 * Cabecera de pantalla. Reemplaza los 5 topBar y los 6 bloques hero que estaban
 * redibujados pantalla por pantalla.
 *
 * `card` la envuelve en una superficie; sin eso queda al ras del fondo, que es
 * lo que quieren las pantallas de comparador donde el contenido empieza
 * enseguida.
 */
export default function ScreenHeader({
  title,
  subtitle,
  initials,          // muestra el avatar si viene
  onAvatarPress,
  actionIcon,
  onActionPress,
  card = true,
  style,
}) {
  return (
    <View style={[card ? styles.card : styles.plano, style]}>
      <View style={styles.fila}>
        {initials ? (
          <Pressable
            onPress={onAvatarPress}
            disabled={!onAvatarPress}
            style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
          >
            <Txt style={styles.avatarTxt}>{initials}</Txt>
          </Pressable>
        ) : null}

        <View style={styles.medio}>
          <Txt style={styles.titulo} numberOfLines={1}>{title}</Txt>
          {subtitle ? (
            <Txt variant="caption" color={COLORS.textLow} style={styles.sub} numberOfLines={2}>
              {subtitle}
            </Txt>
          ) : null}
        </View>

        {actionIcon ? (
          <Pressable
            onPress={onActionPress}
            style={({ pressed }) => [styles.accion, pressed && styles.pressed]}
          >
            <Ionicons name={actionIcon} size={19} color={COLORS.textMid} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.l,
    padding: 16,
  },
  plano: { paddingVertical: 4 },
  fila: { flexDirection: 'row', alignItems: 'center' },
  pressed: { opacity: 0.7 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1.5,
    borderColor: COLORS.primaryBorderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarTxt: { fontFamily: FONTS.extrabold, fontSize: 14, lineHeight: 17, color: COLORS.textHigh },
  medio: { flex: 1, minWidth: 0 },
  titulo: { fontFamily: FONTS.extrabold, fontSize: 20, lineHeight: 23, letterSpacing: -0.4, color: COLORS.textHigh },
  sub: { fontSize: 12.5, lineHeight: 16 },
  accion: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
});
