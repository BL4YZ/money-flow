import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import Txt from './ui/Text';
import { COLORS, SPACING, RADIUS, SHADOWS, FONTS } from '../theme';
import { useLanguage } from '../context/LanguageContext';

/**
 * Píldora flotante mientras se recarga. Existe porque el `RefreshControl` de
 * RN se pinta con los colores del sistema y rompía la paleta; acá se anula
 * (tintColor transparente) y el aviso lo da esto.
 */
export default function RefreshBadge({ refreshing }) {
  const { t } = useLanguage();
  const translateY = useRef(new Animated.Value(-72)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const rotation = useRef(new Animated.Value(0)).current;
  const loopRef = useRef(null);

  useEffect(() => {
    if (refreshing) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, damping: 14, stiffness: 180, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();

      rotation.setValue(0);
      loopRef.current = Animated.loop(
        Animated.timing(rotation, { toValue: 1, duration: 800, useNativeDriver: true }),
      );
      loopRef.current.start();
    } else {
      loopRef.current?.stop();
      Animated.parallel([
        Animated.spring(translateY, { toValue: -72, damping: 16, stiffness: 220, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [refreshing]);

  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View
      style={[styles.wrapper, { transform: [{ translateY }], opacity }]}
      pointerEvents="none"
    >
      <View style={styles.badge}>
        <Animated.View style={[styles.ring, { transform: [{ rotate: spin }] }]} />
        <Txt style={styles.label}>{t('common.refreshing')}</Txt>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 64,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 9,
    backgroundColor: COLORS.surfaceSunken,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    ...SHADOWS.ambient,
  },
  ring: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderTopColor: COLORS.primary,
    borderRightColor: 'transparent',
    borderBottomColor: COLORS.borderStrong,
    borderLeftColor: COLORS.borderStrong,
    marginRight: SPACING.s,
  },
  label: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    lineHeight: 16,
    color: COLORS.textHigh,
    letterSpacing: 0.2,
  },
});
