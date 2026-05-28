import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../theme';
import { useLanguage } from '../context/LanguageContext';

export default function RefreshBadge({ refreshing }) {
  const { t } = useLanguage();
  const translateY = useRef(new Animated.Value(-72)).current;
  const opacity    = useRef(new Animated.Value(0)).current;
  const rotation   = useRef(new Animated.Value(0)).current;
  const loopRef    = useRef(null);

  useEffect(() => {
    if (refreshing) {
      // Slide in + fade in
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          damping: 14,
          stiffness: 180,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();

      // Spinning loop
      rotation.setValue(0);
      loopRef.current = Animated.loop(
        Animated.timing(rotation, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        })
      );
      loopRef.current.start();
    } else {
      loopRef.current?.stop();
      // Slide out + fade out
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: -72,
          damping: 16,
          stiffness: 220,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [refreshing]);

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={[styles.wrapper, { transform: [{ translateY }], opacity }]}
      pointerEvents="none"
    >
      <View style={styles.badge}>
        {/* Spinning ring */}
        <Animated.View style={[styles.ring, { transform: [{ rotate: spin }] }]} />
        <Text style={styles.label}>{t('common.refreshing')}</Text>
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
    gap: SPACING.sm,
    paddingHorizontal: 18,
    paddingVertical: 9,
    backgroundColor: COLORS.surfaceContainerHigh,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant + '40',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 12,
  },
  ring: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderTopColor: COLORS.primary,
    borderRightColor: 'transparent',
    borderBottomColor: COLORS.primary + '40',
    borderLeftColor: COLORS.primary + '40',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.onSurface,
    letterSpacing: 0.2,
  },
});
