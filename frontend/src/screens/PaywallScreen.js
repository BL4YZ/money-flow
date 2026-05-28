import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { COLORS, SPACING, RADIUS, GRADIENT, SHADOWS } from '../theme';
import { useLanguage } from '../context/LanguageContext';
import { usePlan } from '../context/PlanContext';
import { getOfferings, purchasePackage, restorePurchases } from '../services/purchases';
import api from '../api/client';

const FEATURES = [
  { icon: 'flash',          label: 'featureAI' },
  { icon: 'stats-chart',    label: 'featurePrices' },
  { icon: 'cart',           label: 'featureShopping' },
  { icon: 'cloud-upload',   label: 'featureUpload' },
  { icon: 'trophy',         label: 'featureGoals' },
  { icon: 'notifications',  label: 'featureBills' },
  { icon: 'infinite',       label: 'featureTransactions' },
];

export default function PaywallScreen({ navigation }) {
  const { t } = useLanguage();
  const { refreshPlan } = usePlan();

  const [offering, setOffering]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring]   = useState(false);

  // Entrance animations
  const headerY  = useRef(new Animated.Value(30)).current;
  const headerOp = useRef(new Animated.Value(0)).current;
  const cardY    = useRef(new Animated.Value(40)).current;
  const cardOp   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(headerY, { toValue: 0, damping: 18, stiffness: 180, useNativeDriver: true }),
      Animated.timing(headerOp, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
    setTimeout(() => {
      Animated.parallel([
        Animated.spring(cardY, { toValue: 0, damping: 18, stiffness: 160, useNativeDriver: true }),
        Animated.timing(cardOp, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    }, 120);

    loadOffering();
  }, []);

  const loadOffering = async () => {
    setLoading(true);
    try {
      const o = await getOfferings();
      setOffering(o);
    } catch (_) {}
    setLoading(false);
  };

  const handlePurchase = async () => {
    const pkg = offering?.availablePackages?.[0];
    if (!pkg) {
      Toast.show({ type: 'error', text1: 'No hay paquetes disponibles aún' });
      return;
    }
    setPurchasing(true);
    try {
      const { customerInfo, isCancelled, isMock } = await purchasePackage(pkg);
      if (isCancelled) return;
      // Update plan state from RevenueCat customer info (or mock)
      await refreshPlan(customerInfo);
      Toast.show({ type: 'success', text1: '¡Bienvenido a Premium! 🎉' });
      navigation?.goBack();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.message ?? 'Error al procesar el pago' });
    } finally {
      setPurchasing(false);
    }
  };

  // ── DEV ONLY ────────────────────────────────────────────────────
  const simulatePurchase = async () => {
    try {
      await api.post('/dev/simulate-premium');
      await refreshPlan(null);
      Toast.show({ type: 'success', text1: '[DEV] Premium activado ✓' });
      navigation?.goBack();
    } catch (err) {
      Toast.show({ type: 'error', text1: '[DEV] Error: ' + err.message });
    }
  };

  const simulateFree = async () => {
    try {
      await api.post('/dev/simulate-free');
      await refreshPlan(null);
      Toast.show({ type: 'success', text1: '[DEV] Plan revertido a free ✓' });
    } catch (err) {
      Toast.show({ type: 'error', text1: '[DEV] Error: ' + err.message });
    }
  };
  // ────────────────────────────────────────────────────────────────

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const customerInfo = await restorePurchases();
      await refreshPlan(customerInfo);
      Toast.show({ type: 'success', text1: 'Compras restauradas' });
      navigation?.goBack();
    } catch (err) {
      Toast.show({ type: 'error', text1: 'No se encontraron compras anteriores' });
    } finally {
      setRestoring(false);
    }
  };

  // Extract price & trial info from the first package
  const pkg            = offering?.availablePackages?.[0];
  const priceString    = pkg?.product?.priceString ?? t('premium.price');
  const trialDuration  = pkg?.product?.introPrice?.periodNumberOfUnits
    ? `${pkg.product.introPrice.periodNumberOfUnits} ${t('paywall.days')}`
    : '30 ' + t('paywall.days');

  return (
    <View style={styles.root}>
      {/* Close button */}
      {navigation && (
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={22} color={COLORS.onSurfaceVariant} />
        </TouchableOpacity>
      )}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Hero */}
        <Animated.View style={[styles.hero, { opacity: headerOp, transform: [{ translateY: headerY }] }]}>
          <LinearGradient colors={['#7c4dff33', '#7c4dff00']} style={styles.heroBg}>
            <LinearGradient colors={GRADIENT.primary} style={styles.diamondBg}>
              <Ionicons name="diamond" size={36} color={COLORS.onPrimary} />
            </LinearGradient>
            <Text style={styles.heroTitle}>{t('premium.modalTitle')}</Text>
            <Text style={styles.heroTrial}>
              {t('paywall.trialHeadline', { days: trialDuration })}
            </Text>
            <Text style={styles.heroSub}>{t('paywall.trialSub')}</Text>
          </LinearGradient>
        </Animated.View>

        {/* Features */}
        <Animated.View style={[styles.featuresCard, { opacity: cardOp, transform: [{ translateY: cardY }] }]}>
          {FEATURES.map(({ icon, label }) => (
            <View key={label} style={styles.featureRow}>
              <View style={styles.featureIconWrap}>
                <Ionicons name={icon} size={18} color={COLORS.primary} />
              </View>
              <Text style={styles.featureText}>{t(`premium.${label}`)}</Text>
              <Ionicons name="checkmark-circle" size={18} color={COLORS.secondary} />
            </View>
          ))}
        </Animated.View>

        {/* Pricing */}
        <Animated.View style={[styles.pricingCard, { opacity: cardOp }]}>
          <View style={styles.trialBadgeRow}>
            <View style={styles.trialBadge}>
              <Ionicons name="timer-outline" size={14} color={COLORS.warning} />
              <Text style={styles.trialBadgeText}>{t('paywall.trialBadge', { days: trialDuration })}</Text>
            </View>
          </View>
          <Text style={styles.priceLine}>
            {t('paywall.thenPrice', { price: priceString })}
          </Text>
          <Text style={styles.priceHint}>{t('premium.priceHint')}</Text>
        </Animated.View>

        {/* CTA */}
        <Animated.View style={{ opacity: cardOp }}>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={handlePurchase}
            disabled={purchasing || loading}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={GRADIENT.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaGradient}
            >
              {purchasing
                ? <ActivityIndicator color={COLORS.onPrimary} />
                : <>
                    <Ionicons name="diamond-outline" size={20} color={COLORS.onPrimary} />
                    <Text style={styles.ctaText}>{t('paywall.startTrial')}</Text>
                  </>
              }
            </LinearGradient>
          </TouchableOpacity>

          {/* Legal */}
          <Text style={styles.legal}>{t('paywall.legal', { price: priceString })}</Text>

          {/* Restore */}
          <TouchableOpacity onPress={handleRestore} disabled={restoring} style={styles.restoreBtn}>
            {restoring
              ? <ActivityIndicator size="small" color={COLORS.onSurfaceVariant} />
              : <Text style={styles.restoreText}>{t('paywall.restore')}</Text>
            }
          </TouchableOpacity>
        </Animated.View>

        {/* ── DEV panel — invisible in production builds ── */}
        {__DEV__ && (
          <View style={styles.devPanel}>
            <Text style={styles.devLabel}>⚙ DEV — Simulación</Text>
            <View style={styles.devRow}>
              <TouchableOpacity style={styles.devBtn} onPress={simulatePurchase}>
                <Ionicons name="checkmark-circle" size={14} color="#4ade80" />
                <Text style={styles.devBtnText}>Compra exitosa</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.devBtn, styles.devBtnRed]} onPress={simulateFree}>
                <Ionicons name="close-circle" size={14} color="#f87171" />
                <Text style={[styles.devBtnText, { color: '#f87171' }]}>Volver a free</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  closeBtn: {
    position: 'absolute',
    top: 56,
    right: SPACING.lg,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    paddingHorizontal: SPACING.lg,
    paddingTop: 56,
    paddingBottom: SPACING.xxl,
  },

  // Hero
  hero: { marginBottom: SPACING.lg },
  heroBg: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.xxl,
  },
  diamondBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    ...SHADOWS.nebula,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.onSurface,
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  heroTrial: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 6,
  },
  heroSub: {
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Features card
  featuresCard: {
    backgroundColor: COLORS.surfaceContainerLow,
    borderRadius: RADIUS.xxl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    gap: 14,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant + '30',
  },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary + '18',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: { flex: 1, fontSize: 14, color: COLORS.onSurface, fontWeight: '500' },

  // Pricing card
  pricingCard: {
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.xxl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant + '25',
    alignItems: 'center',
  },
  trialBadgeRow: { marginBottom: SPACING.sm },
  trialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: COLORS.warning + '18',
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.warning + '40',
  },
  trialBadgeText: { fontSize: 13, fontWeight: '700', color: COLORS.warning },
  priceLine: { fontSize: 16, color: COLORS.onSurface, fontWeight: '600', marginBottom: 4 },
  priceHint: { fontSize: 12, color: COLORS.onSurfaceVariant },

  // CTA
  ctaBtn: {
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginBottom: SPACING.md,
    ...SHADOWS.nebula,
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: 18,
    paddingHorizontal: SPACING.xl,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.onPrimary,
    letterSpacing: 0.2,
  },
  legal: {
    fontSize: 11,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },
  restoreBtn: { alignItems: 'center', paddingVertical: SPACING.sm },
  restoreText: { fontSize: 13, color: COLORS.onSurfaceVariant, textDecorationLine: 'underline' },

  // DEV panel
  devPanel: {
    marginTop: SPACING.xl,
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#7c4dff44',
    borderStyle: 'dashed',
  },
  devLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7c4dff',
    letterSpacing: 1.5,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  devRow: { flexDirection: 'row', gap: SPACING.sm },
  devBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.lg,
    backgroundColor: '#4ade8018',
    borderWidth: 1,
    borderColor: '#4ade8040',
  },
  devBtnRed: {
    backgroundColor: '#f8717118',
    borderColor: '#f8717140',
  },
  devBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4ade80',
  },
});
