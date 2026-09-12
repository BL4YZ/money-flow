import React from 'react';
import { View, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Txt from './Text';
import Button from './Button';
import { COLORS, RADIUS, FONTS, estilos } from '../../theme';

/**
 * Estado vacío. Uno solo, no cinco: reemplaza emptyCard, empty y emptyResults,
 * que además usaban tres esquemas de nombres distintos.
 *
 * Siempre lleva una acción cuando hay una: un vacío que no dice qué hacer es
 * una pantalla muerta. Si de verdad no hay acción posible (una búsqueda sin
 * resultados reales), se omite `actionLabel` y queda el texto solo.
 */
export default function EmptyState({
  icon = 'file-tray-outline',
  title,
  text,
  actionLabel,
  onAction,
  actionIcon,
  style,
}) {
  return (
    <View style={[styles.caja, style]}>
      <View style={styles.iconoCaja}>
        <Ionicons name={icon} size={26} color={COLORS.textLow} />
      </View>
      <Txt style={styles.titulo} center>{title}</Txt>
      {text ? (
        <Txt variant="body" color={COLORS.textMid} center style={styles.texto}>{text}</Txt>
      ) : null}
      {actionLabel ? (
        <Button label={actionLabel} onPress={onAction} icon={actionIcon} size="sm" />
      ) : null}
    </View>
  );
}

// Se declara con `estilos()` y no con `StyleSheet.create` suelto: create COPIA
// los colores al cargar el modulo, asi que un cambio de tema en caliente no
// repintaria nada. Ver theme.js.
const styles = estilos(() => StyleSheet.create({
  caja: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.l,
    paddingVertical: 30,
    paddingHorizontal: 22,
  },
  iconoCaja: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  titulo: { fontFamily: FONTS.bold, fontSize: 17, lineHeight: 22, color: COLORS.textHigh, marginBottom: 7 },
  texto: { fontSize: 14, lineHeight: 21.5, maxWidth: 300, marginBottom: 18 },
}));
