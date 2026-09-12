import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import api from '../api/client';
import { usePlan } from '../context/PlanContext';
import { useLanguage } from '../context/LanguageContext';
import { Txt, Button, Badge, BottomSheet } from './ui';
import { COLORS, SPACING, RADIUS, FONTS, estilos } from '../theme';

const FEATURES = [
  { icon: 'flash',         key: 'featureAI' },
  { icon: 'stats-chart',   key: 'featurePrices' },
  { icon: 'cart',          key: 'featureShopping' },
  { icon: 'cloud-upload',  key: 'featureUpload' },
  { icon: 'trophy',        key: 'featureGoals' },
  { icon: 'notifications', key: 'featureBills' },
  { icon: 'infinite',      key: 'featureTransactions' },
];

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

/**
 * Hoja de upsell. Comparte el BottomSheet con el resto de la app en vez de
 * traer su propio backdrop/sheet/handle, que era la cuarta copia del mismo
 * patrón.
 */
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

  // El subtítulo depende de qué función disparó la hoja: llegar acá desde el
  // comparador y desde las metas no es lo mismo.
  const nudgeKey = upgradeContext ? `premium.upgradeNudge${capitalize(upgradeContext)}` : null;

  return (
    <BottomSheet
      visible={upgradeVisible}
      onClose={hideUpgrade}
      title={t('premium.modalTitle')}
      subtitle={nudgeKey ? t(nudgeKey) : t('premium.modalSubtitle')}
      primaryLabel={t('premium.ctaBtn')}
      onPrimary={() => { hideUpgrade(); navigation.navigate('Paywall'); }}
      secondaryLabel={t('common.cancel')}
    >
      <View style={styles.badgeRow}>
        <Badge variant="premium" label={t('premium.badge')} />
      </View>

      {FEATURES.map(({ icon, key }) => (
        <View key={key} style={styles.featureRow}>
          <View style={styles.featureIcon}>
            <Ionicons name={icon} size={18} color={COLORS.premium} />
          </View>
          <Txt variant="body" style={styles.featureTxt}>{t(`premium.${key}`)}</Txt>
          <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
        </View>
      ))}

      <View style={styles.priceRow}>
        <Txt style={styles.price}>{t('premium.price')}</Txt>
        <Txt variant="caption" color={COLORS.textLow}>{t('premium.priceHint')}</Txt>
      </View>

      {__DEV__ ? (
        <Button
          label="⚙ DEV — Simular compra exitosa"
          variant="ghost"
          size="sm"
          icon="flash"
          onPress={simulatePurchase}
          style={{ alignSelf: 'center', marginTop: SPACING.s }}
        />
      ) : null}
    </BottomSheet>
  );
}

// Se declara con `estilos()` y no con `StyleSheet.create` suelto: create COPIA
// los colores al cargar el modulo, asi que un cambio de tema en caliente no
// repintaria nada. Ver theme.js.
const styles = estilos(() => StyleSheet.create({
  badgeRow: { alignItems: 'center', marginBottom: SPACING.m },
  featureRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  featureIcon: {
    width: 34, height: 34, borderRadius: RADIUS.s,
    backgroundColor: COLORS.premiumSoft,
    borderWidth: 1.5, borderColor: COLORS.premiumBorder,
    alignItems: 'center', justifyContent: 'center',
    marginRight: SPACING.s,
  },
  featureTxt: { flex: 1 },
  priceRow: {
    alignItems: 'center',
    marginTop: SPACING.m,
    paddingTop: SPACING.m,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSubtle,
  },
  price: { fontFamily: FONTS.amountBold, fontSize: 24, lineHeight: 29, color: COLORS.textHigh, marginBottom: 3 },
}));
