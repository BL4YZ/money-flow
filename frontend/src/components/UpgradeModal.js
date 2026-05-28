import React, { useEffect, useRef } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Animated, Pressable,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, RADIUS, SHADOWS, GRADIENT } from '../theme';
import { usePlan } from '../context/PlanContext';
import { useLanguage } from '../context/LanguageContext';
import api from '../api/client';
import Toast from 'react-native-toast-message';

const FEATURES = [
  { icon: 'flash',              key: 'featureAI' },
  { icon: 'stats-chart',        key: 'featurePrices' },
  { icon: 'cart',               key: 'featureShopping' },
  { icon: 'cloud-upload',       key: 'featureUpload' },
  { icon: 'trophy',             key: 'featureGoals' },
  { icon: 'notifications',      key: 'featureBills' },
  { icon: 'infinite',           key: 'featureTransactions' },
];

export default function UpgradeModal() {
  const { upgradeVisible, upgradeContext, hideUpgrade, refreshPlan } = usePlan();
  const { t } = useLanguage();
  const navigation = useNavigation();

  const simulatePurchase = async () => {
    try {
      await api.post('/dev/simulate-premium');
      await refreshPlan(null);
      hideUpgrade();
      Toast.show({ type: 'success', text1: '[DEV] Premium activado ✓' });
    } catch (err) {
      Toast.show({ type: 'error', text1: '[DEV] ' + err.message });
    }
  };
  const slideY = useRef(new Animated.Value(600)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (upgradeVisible) {
      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, damping: 18, stiffness: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(slideY, { toValue: 600, damping: 20, stiffness: 260, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [upgradeVisible]);

  // Nudge subtitle based on which feature triggered the modal
  const nudgeKey = upgradeContext ? `premium.upgradeNudge${capitalize(upgradeContext)}` : null;

  return (
    <Modal visible={upgradeVisible} transparent animationType="none" onRequestClose={hideUpgrade}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={hideUpgrade} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideY }] }]}>
        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Header */}
        <LinearGradient
          colors={['#7c4dff22', '#7c4dff00']}
          style={styles.headerGradient}
        >
          <View style={styles.crownWrap}>
            <LinearGradient colors={GRADIENT.primary} style={styles.crownBg}>
              <Ionicons name="diamond" size={28} color={COLORS.onPrimary} />
            </LinearGradient>
          </View>
          <Text style={styles.title}>{t('premium.modalTitle')}</Text>
          <Text style={styles.subtitle}>
            {nudgeKey ? t(nudgeKey) : t('premium.modalSubtitle')}
          </Text>
        </LinearGradient>

        {/* Features list */}
        <ScrollView
          style={styles.featureScroll}
          contentContainerStyle={styles.featureList}
          showsVerticalScrollIndicator={false}
        >
          {FEATURES.map(({ icon, key }) => (
            <View key={key} style={styles.featureRow}>
              <View style={styles.featureIconWrap}>
                <Ionicons name={icon} size={18} color={COLORS.primary} />
              </View>
              <Text style={styles.featureText}>{t(`premium.${key}`)}</Text>
              <Ionicons name="checkmark-circle" size={18} color={COLORS.secondary} />
            </View>
          ))}
        </ScrollView>

        {/* Price + CTA */}
        <View style={styles.footer}>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{t('premium.price')}</Text>
            <Text style={styles.priceHint}>{t('premium.priceHint')}</Text>
          </View>

          <TouchableOpacity
            style={styles.ctaBtn}
            activeOpacity={0.85}
            onPress={() => {
              hideUpgrade();
              navigation.navigate('Paywall');
            }}
          >
            <LinearGradient colors={GRADIENT.primary} style={styles.ctaGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="diamond-outline" size={18} color={COLORS.onPrimary} />
              <Text style={styles.ctaText}>{t('premium.ctaBtn')}</Text>
            </LinearGradient>
          </TouchableOpacity>

          {__DEV__ && (
            <TouchableOpacity style={styles.devSimBtn} onPress={simulatePurchase}>
              <Ionicons name="flash" size={13} color="#7c4dff" />
              <Text style={styles.devSimText}>⚙ DEV — Simular compra exitosa</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={hideUpgrade} style={styles.dismissBtn}>
            <Text style={styles.dismissText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000BB',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surfaceContainer,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingBottom: 40,
    maxHeight: '85%',
    ...SHADOWS.nebula,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.outlineVariant,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  headerGradient: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  crownWrap: { marginBottom: SPACING.md },
  crownBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.nebula,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.onSurface,
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 20,
  },
  featureScroll: { maxHeight: 260 },
  featureList: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.md,
    gap: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary + '18',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.onSurface,
    fontWeight: '500',
  },
  footer: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant + '30',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  price: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.onSurface,
  },
  priceHint: {
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
  },
  ctaBtn: {
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
    ...SHADOWS.nebula,
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: 16,
    paddingHorizontal: SPACING.xl,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.onPrimary,
    letterSpacing: 0.2,
  },
  ctaHint: {
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  dismissBtn: { alignItems: 'center', paddingVertical: SPACING.sm },
  dismissText: { fontSize: 14, color: COLORS.onSurfaceVariant },
  devSimBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#7c4dff44',
    borderStyle: 'dashed',
    backgroundColor: '#7c4dff0e',
  },
  devSimText: { fontSize: 12, fontWeight: '700', color: '#7c4dff' },
});
