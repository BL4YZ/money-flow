import React, { useEffect, useRef } from 'react';
import {
  Modal, View, Pressable, Animated, ScrollView, KeyboardAvoidingView,
  Platform, Dimensions, StyleSheet,
} from 'react-native';
import Txt from './Text';
import Button from './Button';
import { COLORS, RADIUS, SPACING, FONTS, MOTION } from '../../theme';

/**
 * La hoja inferior. UNA sola: reemplaza los tres modalOverlay/modalCard/
 * modalHandle de Dashboard, Goals y Subscriptions más el backdrop/sheet/handle
 * de UpgradeModal.
 *
 * El scrim cierra al tocar. El contenido scrollea por dentro para que un
 * formulario largo no empuje las acciones fuera de la pantalla, y en iOS la
 * hoja sube con el teclado.
 */
export default function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  primaryLabel,
  onPrimary,
  primaryLoading,
  primaryDisabled,
  secondaryLabel = 'Cancelar',
  onSecondary,
  style,
}) {
  const alto = Dimensions.get('window').height;
  const y = useRef(new Animated.Value(alto)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(y, { toValue: 0, ...MOTION.sheet, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      y.setValue(alto);
      fade.setValue(0);
    }
  }, [visible]);

  const cerrar = () => {
    Animated.parallel([
      Animated.timing(y, { toValue: alto, duration: 200, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]).start(() => onClose && onClose());
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={cerrar}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: fade }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={cerrar} />
        </Animated.View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kav}
          pointerEvents="box-none"
        >
          <Animated.View style={[styles.hoja, { transform: [{ translateY: y }] }, style]}>
            <View style={styles.handle} />
            {title ? <Txt style={styles.titulo}>{title}</Txt> : null}
            {subtitle ? (
              <Txt variant="caption" color={COLORS.textLow} style={styles.sub}>{subtitle}</Txt>
            ) : null}

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>

            {primaryLabel ? (
              <View style={styles.acciones}>
                <Button
                  label={secondaryLabel}
                  variant="ghost"
                  onPress={onSecondary || cerrar}
                  style={styles.btnSecundario}
                />
                <Button
                  label={primaryLabel}
                  onPress={onPrimary}
                  loading={primaryLoading}
                  disabled={primaryDisabled}
                  style={styles.btnPrimario}
                />
              </View>
            ) : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: COLORS.scrim },
  kav: { justifyContent: 'flex-end' },
  hoja: {
    backgroundColor: COLORS.surfaceRaised,
    borderTopWidth: 1.5,
    borderTopColor: COLORS.border,
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 20,
    maxHeight: '88%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.borderStrong,
    alignSelf: 'center',
    marginBottom: 16,
  },
  titulo: { fontFamily: FONTS.extrabold, fontSize: 20, lineHeight: 24, letterSpacing: -0.4, color: COLORS.textHigh, marginBottom: 5 },
  sub: { fontSize: 13, lineHeight: 18, marginBottom: 18 },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: SPACING.xs },
  acciones: { flexDirection: 'row', marginTop: SPACING.l, gap: 10 },
  btnSecundario: { flex: 1 },
  btnPrimario: { flex: 1.4 },
});
