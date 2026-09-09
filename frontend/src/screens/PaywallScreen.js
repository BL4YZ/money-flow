import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import api from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { usePlan } from '../context/PlanContext';
import { getOfferings, purchasePackage, restorePurchases } from '../services/purchases';
import { Txt, Card, Button, Badge } from '../components/ui';
import { COLORS, SPACING, RADIUS, GRADIENTS, FONTS, SHADOWS } from '../theme';

const FEATURES = [
  { icon: 'flash',         label: 'featureAI' },
  { icon: 'stats-chart',   label: 'featurePrices' },
  { icon: 'cart',          label: 'featureShopping' },
  { icon: 'cloud-upload',  label: 'featureUpload' },
  { icon: 'trophy',        label: 'featureGoals' },
  { icon: 'notifications', label: 'featureBills' },
  { icon: 'infinite',      label: 'featureTransactions' },
];

export default function PaywallScreen({ navigation }) {
  const { t } = useLanguage();
  const { refreshPlan } = usePlan();

  const [offering, setOffering] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => { loadOffering(); }, []);

  const loadOffering = async () => {
    setLoading(true);
    try {
      setOffering(await getOfferings());
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
      const { customerInfo, isCancelled } = await purchasePackage(pkg);
      if (isCancelled) return;
      await refreshPlan(customerInfo);
      Toast.show({ type: 'success', text1: '¡Bienvenido a Premium! 🎉' });
      navigation?.goBack();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.message ?? 'Error al procesar el pago' });
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      await refreshPlan(await restorePurchases());
      Toast.show({ type: 'success', text1: 'Compras restauradas' });
      navigation?.goBack();
    } catch (err) {
      Toast.show({ type: 'error', text1: 'No se encontraron compras anteriores' });
    } finally {
      setRestoring(false);
    }
  };

  // ── Sólo DEV: gatea con __DEV__ y pega contra routes/dev.js, que a su vez
  // sólo se monta cuando NODE_ENV === 'development'. ──────────────
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

  const pkg = offering?.availablePackages?.[0];
  const priceString = pkg?.product?.priceString ?? t('premium.price');
  const trialDuration = pkg?.product?.introPrice?.periodNumberOfUnits
    ? `${pkg.product.introPrice.periodNumberOfUnits} ${t('paywall.days')}`
    : '30 ' + t('paywall.days');

  return (
    <View style={styles.root}>
      {navigation ? (
        <Pressable
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="close" size={22} color={COLORS.textMid} />
        </Pressable>
      ) : null}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} bounces={false}>
        <View style={styles.hero}>
          <LinearGradient
            colors={GRADIENTS.premium}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.diamante}
          >
            <Ionicons name="diamond" size={34} color={COLORS.onPremium} />
          </LinearGradient>
          <Txt variant="h1" center style={styles.heroTitle}>{t('premium.modalTitle')}</Txt>
          <Txt variant="h2" color={COLORS.premium} center style={styles.heroTrial}>
            {t('paywall.trialHeadline', { days: trialDuration })}
          </Txt>
          <Txt variant="body" color={COLORS.textMid} center>{t('paywall.trialSub')}</Txt>
        </View>

        <Card variant="raised" style={styles.bloque}>
          {FEATURES.map(({ icon, label }) => (
            <View key={label} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Ionicons name={icon} size={18} color={COLORS.premium} />
              </View>
              <Txt variant="body" style={{ flex: 1 }}>{t(`premium.${label}`)}</Txt>
              <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
            </View>
          ))}
        </Card>

        <Card variant="locked" style={styles.bloque} contentStyle={{ alignItems: 'center' }}>
          <Badge
            variant="streak"
            icon="timer-outline"
            label={t('paywall.trialBadge', { days: trialDuration })}
            style={{ marginBottom: SPACING.s }}
          />
          <Txt style={styles.precio} center>{t('paywall.thenPrice', { price: priceString })}</Txt>
          <Txt variant="caption" color={COLORS.textLow} center>{t('premium.priceHint')}</Txt>
        </Card>

        <Button
          label={t('paywall.startTrial')}
          variant="premiumLocked"
          icon="diamond-outline"
          size="lg"
          fullWidth
          loading={purchasing}
          disabled={loading}
          onPress={handlePurchase}
          style={styles.bloque}
        />

        <Txt variant="caption" color={COLORS.textLow} center style={styles.legal}>
          {t('paywall.legal', { price: priceString })}
        </Txt>

        <Button
          label={t('paywall.restore')}
          variant="ghost"
          size="sm"
          loading={restoring}
          onPress={handleRestore}
          style={{ alignSelf: 'center' }}
        />

        {__DEV__ ? (
          <Card style={styles.bloque}>
            <Txt variant="overline" color={COLORS.textLow} style={{ marginBottom: SPACING.s }}>
              ⚙ DEV — Simulación
            </Txt>
            <View style={styles.devRow}>
              <Button
                label="Compra exitosa"
                variant="secondary"
                size="sm"
                icon="checkmark-circle"
                onPress={simulatePurchase}
                style={{ flex: 1 }}
              />
              <Button
                label="Volver a free"
                variant="destructive"
                size="sm"
                icon="close-circle"
                onPress={simulateFree}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        ) : null}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingHorizontal: SPACING.m, paddingTop: 76, paddingBottom: SPACING.l },
  pressed: { opacity: 0.7 },
  bloque: { marginTop: SPACING.m },

  close: {
    position: 'absolute', top: 52, right: SPACING.m, zIndex: 10,
    width: 40, height: 40, borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },

  hero: { alignItems: 'center' },
  diamante: {
    width: 72, height: 72, borderRadius: RADIUS.xl,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.m,
    ...SHADOWS.gold,
  },
  heroTitle: { marginBottom: 6 },
  heroTrial: { marginBottom: 6 },

  featureRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  featureIcon: {
    width: 34, height: 34, borderRadius: RADIUS.s,
    backgroundColor: COLORS.premiumSoft,
    borderWidth: 1.5, borderColor: COLORS.premiumBorder,
    alignItems: 'center', justifyContent: 'center',
    marginRight: SPACING.s,
  },

  precio: { fontFamily: FONTS.amountBold, fontSize: 20, lineHeight: 25, color: COLORS.textHigh, marginBottom: 3 },
  legal: { marginTop: SPACING.m, marginBottom: SPACING.s, fontSize: 11, lineHeight: 16 },
  devRow: { flexDirection: 'row', gap: SPACING.s },
});
