import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable, Linking } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import api from '../api/client';
import { usePlan } from '../context/PlanContext';
import { useLanguage } from '../context/LanguageContext';
import {
  Txt, Card, Input, Button, Badge, OfferRow, EmptyState,
  OfferRowSkeleton, ScreenHeader, formatUYU,
} from '../components/ui';
import { COLORS, SPACING, RADIUS, FONTS } from '../theme';

// Prioridad = feedback del sistema sobre la sugerencia, no un dato de dinero.
// Por eso usa success/warning/error y no income/expense.
const PRIORIDAD = {
  high:   { tono: COLORS.error,   badge: 'discount',    tag: 'ALTO IMPACTO' },
  medium: { tono: COLORS.warning, badge: 'streak',      tag: 'MEDIO' },
  low:    { tono: COLORS.success, badge: 'best',        tag: 'BAJO' },
};

function SuggestionCard({ suggestion, index }) {
  const p = PRIORIDAD[suggestion.priority] || PRIORIDAD.medium;

  return (
    <Card style={styles.sugg}>
      <View style={styles.suggHead}>
        <View style={[styles.suggIndex, { borderColor: p.tono }]}>
          <Txt style={[styles.suggIndexTxt, { color: p.tono }]}>{index + 1}</Txt>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="h2" style={styles.suggTitle}>{suggestion.title}</Txt>
          <View style={styles.suggMeta}>
            <Badge variant={p.badge} icon={null} label={p.tag} />
            {suggestion.category ? (
              <Txt variant="caption" color={COLORS.textLow} style={{ marginLeft: SPACING.s }}>
                {suggestion.category}
              </Txt>
            ) : null}
          </View>
        </View>
        {suggestion.potentialSaving > 0 ? (
          <Txt style={styles.suggSaving}>−{formatUYU(suggestion.potentialSaving)}</Txt>
        ) : null}
      </View>
      <Txt variant="body" color={COLORS.textMid} style={styles.suggDesc}>
        {suggestion.description}
      </Txt>
    </Card>
  );
}

function Stat({ label, value, color }) {
  return (
    <View style={styles.stat}>
      <Txt style={[styles.statValue, { color }]}>{formatUYU(value)}</Txt>
      <Txt variant="caption" color={COLORS.textLow}>{label}</Txt>
    </View>
  );
}

export default function SuggestionsScreen() {
  const { t } = useLanguage();
  const { canUseAI, canComparePrices, showUpgrade } = usePlan();

  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  const fetchSuggestions = async () => {
    if (!canUseAI) { showUpgrade('AI'); return; }
    setLoading(true);
    setSuggestions(null);
    try {
      const { data } = await api.post('/suggestions');
      setSuggestions(data);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || t('common.error') });
    } finally {
      setLoading(false);
    }
  };

  const searchPrices = async () => {
    if (!canComparePrices) { showUpgrade('prices'); return; }
    const q = searchQuery.trim();
    if (!q) return;

    setSearching(true);
    setSearchResults({ items: [], stats: null, stores: [] });

    const tiendas = ['disco', 'geant', 'devoto', 'eldorado', 'eltunel', 'sanroque', 'natal', 'farmashop', 'cosmeshop'];
    let acumulados = [];
    const tiendasOk = [];

    const recalc = (items) => {
      if (!items.length) return null;
      const precios = items.map((i) => i.price);
      return {
        min: Math.min(...precios),
        max: Math.max(...precios),
        avg: Math.round(precios.reduce((a, b) => a + b, 0) / precios.length),
      };
    };

    // Se pega a cada tienda por separado y se va poblando la lista a medida que
    // responden, en vez de esperar a la más lenta.
    const requests = tiendas.map((storeId) =>
      api.get('/prices/search', { params: { q, limit: 15, store: storeId }, timeout: 25000 })
        .then(({ data }) => {
          const nuevos = Array.isArray(data) ? data : data.items || [];
          if (nuevos.length === 0) return;
          acumulados = [...acumulados, ...nuevos].sort((a, b) => a.price - b.price);
          tiendasOk.push(nuevos[0].store);
          setSearchResults({ items: acumulados, stats: recalc(acumulados), stores: [...tiendasOk] });
        })
        .catch((err) => console.log(`Error buscando en ${storeId}:`, err.message)),
    );

    await Promise.allSettled(requests);
    if (acumulados.length === 0) setSearchResults({ items: [], stats: null, stores: [], query: q });
    setSearching(false);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title={t('suggestions.heroTitle')} subtitle={t('suggestions.heroSubtitle')} />

        {/* ── Sugerencias de IA ─────────────────────── */}
        <Card variant="raised" style={styles.bloque}>
          <View style={styles.secHead}>
            <View style={styles.secIcon}>
              <Ionicons name="sparkles" size={16} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="h2">{t('suggestions.aiAdvisor')}</Txt>
              <Txt variant="caption" color={COLORS.textLow}>{t('suggestions.poweredBy')}</Txt>
            </View>
          </View>

          {!suggestions && !loading ? (
            <Button
              label={canUseAI ? t('suggestions.analyze') : t('premium.lockedAI')}
              icon={canUseAI ? 'sparkles-outline' : 'lock-closed'}
              variant={canUseAI ? 'primary' : 'premiumLocked'}
              onPress={fetchSuggestions}
              fullWidth
            />
          ) : null}

          {loading ? (
            <View>
              <Txt variant="h2" style={{ marginBottom: 4 }}>{t('suggestions.analyzing')}</Txt>
              <Txt variant="caption" color={COLORS.textMid} style={{ marginBottom: SPACING.m }}>
                {t('suggestions.analyzingHint')}
              </Txt>
              <OfferRowSkeleton />
            </View>
          ) : null}

          {suggestions ? (
            <>
              {suggestions.insight ? (
                <View style={styles.insight}>
                  <Ionicons name="eye-outline" size={18} color={COLORS.accent} />
                  <Txt variant="body" color={COLORS.textMid} style={styles.insightTxt}>
                    {suggestions.insight}
                  </Txt>
                </View>
              ) : null}

              {suggestions.monthlySavingPotential > 0 ? (
                <Card variant="best" label={t('suggestions.savingPotential')} style={styles.bloque}>
                  <Txt style={styles.ahorro}>{formatUYU(suggestions.monthlySavingPotential)}</Txt>
                  <Txt variant="caption" color={COLORS.textMid}>
                    {formatUYU(suggestions.monthlySavingPotential * 12)} al año
                  </Txt>
                </Card>
              ) : null}

              {suggestions.suggestions?.map((s, i) => (
                <SuggestionCard key={i} suggestion={s} index={i} />
              ))}

              <Button
                label={t('suggestions.refresh')}
                variant="ghost"
                size="sm"
                icon="refresh-outline"
                onPress={fetchSuggestions}
                style={{ alignSelf: 'center', marginTop: SPACING.s }}
              />
            </>
          ) : null}
        </Card>

        {/* ── Comparador rápido ─────────────────────── */}
        <Card variant="raised" style={styles.bloque}>
          <View style={styles.secHead}>
            <View style={[styles.secIcon, { borderColor: COLORS.accent }]}>
              <Ionicons name="storefront-outline" size={16} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="h2">{t('suggestions.priceComparator')}</Txt>
              <Txt variant="caption" color={COLORS.textLow}>{t('suggestions.subTitle9')}</Txt>
            </View>
          </View>

          <View style={styles.searchRow}>
            <Input
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t('suggestions.searchPlaceholder')}
              icon="search-outline"
              onClear={() => setSearchQuery('')}
              onSubmitEditing={searchPrices}
              returnKeyType="search"
              style={{ flex: 1 }}
            />
            <Pressable
              onPress={searchPrices}
              disabled={searching}
              style={({ pressed }) => [styles.searchBtn, searching && styles.searchBtnOff, pressed && styles.pressed]}
            >
              <Ionicons
                name={canComparePrices ? 'search' : 'lock-closed'}
                size={20}
                color={COLORS.onPrimary}
              />
            </Pressable>
          </View>

          {searching && searchResults?.items?.length > 0 ? (
            <Txt variant="caption" color={COLORS.accent} style={styles.live}>
              {t('suggestions.liveResults', { n: searchResults.items.length })}
            </Txt>
          ) : null}

          {searchResults ? (
            searchResults.items.length === 0 && !searching ? (
              <EmptyState
                icon="search-outline"
                title={t('suggestions.noResults', { query: searchQuery })}
                text={t('suggestions.noResultsHint')}
                style={styles.bloque}
              />
            ) : (
              <>
                {searchResults.stats ? (
                  <View style={styles.stats}>
                    <Stat label={t('suggestions.statCheapest')} value={searchResults.stats.min} color={COLORS.income} />
                    <Stat label={t('suggestions.statAvg')} value={searchResults.stats.avg} color={COLORS.textHigh} />
                    <Stat label={t('suggestions.statMostExpensive')} value={searchResults.stats.max} color={COLORS.expense} />
                  </View>
                ) : null}

                {searchResults.stores?.length > 0 ? (
                  <Txt variant="caption" color={COLORS.textLow} style={styles.storesLabel}>
                    {searchResults.items.length} productos · {searchResults.stores.join(', ')}
                  </Txt>
                ) : null}

                {searchResults.items.map((item, i) => (
                  <OfferRow
                    key={item.url || i}
                    name={item.name}
                    price={item.price}
                    listPrice={item.listPrice}
                    storeId={item.storeId}
                    storeName={item.store}
                    image={item.image}
                    isBest={i === 0}
                    onPress={() => item.url && Linking.openURL(item.url)}
                    style={{ marginTop: SPACING.s }}
                  />
                ))}
              </>
            )
          ) : null}
        </Card>

        {/* Aire para la tab bar flotante. */}
        <View style={{ height: 110 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: SPACING.m, paddingTop: 60 },
  bloque: { marginTop: SPACING.m },
  pressed: { opacity: 0.75 },

  secHead: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.m },
  secIcon: {
    width: 34, height: 34, borderRadius: RADIUS.s,
    backgroundColor: COLORS.surfaceSunken,
    borderWidth: 1.5, borderColor: COLORS.primaryBorderSoft,
    alignItems: 'center', justifyContent: 'center',
    marginRight: SPACING.s,
  },

  insight: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: COLORS.accentSoft,
    borderRadius: RADIUS.m, padding: 12,
  },
  insightTxt: { flex: 1, marginLeft: SPACING.s },
  ahorro: { fontFamily: FONTS.amountBold, fontSize: 28, lineHeight: 34, color: COLORS.income },

  sugg: { marginTop: SPACING.s },
  suggHead: { flexDirection: 'row', alignItems: 'flex-start' },
  suggIndex: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: COLORS.surfaceSunken,
    alignItems: 'center', justifyContent: 'center',
    marginRight: SPACING.s,
  },
  suggIndexTxt: { fontFamily: FONTS.amountBold, fontSize: 13, lineHeight: 16 },
  suggTitle: { marginBottom: 6 },
  suggMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  suggSaving: { fontFamily: FONTS.amountBold, fontSize: 14, lineHeight: 17, color: COLORS.income, marginLeft: SPACING.s },
  suggDesc: { marginTop: SPACING.s },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s },
  searchBtn: {
    width: 48, height: 48, borderRadius: RADIUS.m,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  searchBtnOff: { backgroundColor: COLORS.surfaceSunken },
  live: { marginTop: SPACING.s },

  stats: { flexDirection: 'row', gap: SPACING.s, marginTop: SPACING.m },
  stat: {
    flex: 1, alignItems: 'center',
    backgroundColor: COLORS.surfaceSunken,
    borderRadius: RADIUS.m, paddingVertical: 12,
  },
  statValue: { fontFamily: FONTS.amountBold, fontSize: 15, lineHeight: 19, marginBottom: 2 },
  storesLabel: { marginTop: SPACING.s },
});
