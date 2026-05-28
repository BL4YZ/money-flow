import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Image,
  Linking,
  Animated,
} from "react-native";
import { useEntrance, useStaggerEntrance, usePressScale } from "../utils/animations";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import api from "../api/client";
import { usePlan } from "../context/PlanContext";
import { COLORS, SPACING, RADIUS, GRADIENT, SHADOWS } from "../theme";
import { useLanguage } from "../context/LanguageContext";

const PRIORITY_CONFIG = {
  high:   { color: COLORS.danger,  label: "High",   icon: "alert-circle",       tag: "HIGH IMPACT" },
  medium: { color: COLORS.warning, label: "Medium", icon: "warning",            tag: "MEDIUM" },
  low:    { color: COLORS.success, label: "Low",    icon: "information-circle", tag: "LOW" },
};

export default function SuggestionsScreen() {
  const { t } = useLanguage();
  const { canUseAI, canComparePrices, showUpgrade } = usePlan();
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  const heroAnim      = useEntrance({ delay: 0,   fromY: 24 });
  const aiCardAnim    = useEntrance({ delay: 100, fromY: 28 });
  const priceCardAnim = useEntrance({ delay: 200, fromY: 28 });
  const generateBtn   = usePressScale(0.97);

  const fetchSuggestions = async () => {
    if (!canUseAI) { showUpgrade('AI'); return; }
    setLoading(true);
    setSuggestions(null);
    try {
      const { data } = await api.post("/suggestions");
      setSuggestions(data);
    } catch (err) {
      const msg = err.response?.data?.error || t('common.error');
      Toast.show({ type: "error", text1: msg });
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

    const storesToSearch = ["disco", "geant", "devoto", "eldorado", "eltunel", "sanroque", "natal", "farmashop", "cosmeshop"];

    let accumulatedItems = [];
    let successfulStores = [];

    const recalcStats = (items) => {
      if (!items.length) return null;
      const prices = items.map((i) => i.price);
      return {
        min: Math.min(...prices),
        max: Math.max(...prices),
        avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
      };
    };

    const requests = storesToSearch.map((storeId) =>
      api
        .get("/prices/search", { params: { q, limit: 15, store: storeId }, timeout: 25000 })
        .then(({ data }) => {
          const newItems = Array.isArray(data) ? data : data.items || [];
          if (newItems.length > 0) {
            accumulatedItems = [...accumulatedItems, ...newItems];
            accumulatedItems.sort((a, b) => a.price - b.price);
            successfulStores.push(newItems[0].store);
            setSearchResults({
              items: accumulatedItems,
              stats: recalcStats(accumulatedItems),
              stores: [...successfulStores],
            });
          }
        })
        .catch((err) => {
          console.log(`Error buscando en ${storeId}:`, err.message);
        })
    );

    await Promise.allSettled(requests);

    if (accumulatedItems.length === 0) {
      setSearchResults({ items: [], stats: null, stores: [], query: q });
    }

    setSearching(false);
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={18} color={COLORS.primary} />
          </View>
          <Text style={styles.topBarTitle}>MoneyFlow</Text>
        </View>
        <Ionicons name="notifications-outline" size={22} color={COLORS.onSurfaceVariant} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <Animated.View style={[styles.hero, heroAnim.style]}>
          <Text style={styles.heroTitle}>{t('suggestions.heroTitle')}</Text>
          <Text style={styles.heroSubtitle}>{t('suggestions.heroSubtitle')}</Text>
        </Animated.View>

        {/* ── AI Suggestions ─────────────────────────── */}
        <Animated.View style={[styles.sectionCard, aiCardAnim.style]}>
          <View style={styles.sectionCardHeader}>
            <LinearGradient
              colors={GRADIENT.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sectionIconBg}
            >
              <Ionicons name="sparkles" size={16} color={COLORS.onPrimary} />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionCardTitle}>{t('suggestions.aiAdvisor')}</Text>
              <Text style={styles.sectionCardSub}>{t('suggestions.poweredBy')}</Text>
            </View>
          </View>

          {!suggestions && !loading && (
            <TouchableOpacity
              onPress={fetchSuggestions}
              activeOpacity={1}
              onPressIn={generateBtn.onPressIn}
              onPressOut={generateBtn.onPressOut}
            >
              <Animated.View style={generateBtn.style}>
                <LinearGradient
                  colors={canUseAI ? GRADIENT.primary : ['#444', '#333']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.generateBtn}
                >
                  <Ionicons name={canUseAI ? 'sparkles-outline' : 'lock-closed-outline'} size={18} color={COLORS.onPrimary} />
                  <Text style={styles.generateBtnText}>
                    {canUseAI ? t('suggestions.analyze') : t('premium.lockedAI')}
                  </Text>
                </LinearGradient>
              </Animated.View>
            </TouchableOpacity>
          )}

          {loading && (
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>{t('suggestions.analyzing')}</Text>
              <Text style={styles.loadingHint}>{t('suggestions.analyzingHint')}</Text>
            </View>
          )}

          {suggestions && (
            <>
              {/* Insight banner */}
              {suggestions.insight && (
                <View style={styles.insightCard}>
                  <Ionicons name="eye-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.insightText}>{suggestions.insight}</Text>
                </View>
              )}

              {/* Saving potential */}
              {suggestions.monthlySavingPotential > 0 && (
                <View style={styles.savingCard}>
                  <View>
                    <Text style={styles.savingLabel}>{t('suggestions.savingPotential')}</Text>
                    <Text style={styles.savingAmount}>
                      ${suggestions.monthlySavingPotential.toLocaleString()}
                    </Text>
                    <Text style={styles.savingYear}>
                      ${(suggestions.monthlySavingPotential * 12).toLocaleString()} per year
                    </Text>
                  </View>
                  <View style={styles.savingIconBg}>
                    <Ionicons name="trending-down" size={24} color={COLORS.secondary} />
                  </View>
                </View>
              )}

              {/* Suggestion cards */}
              {suggestions.suggestions?.map((s, i) => (
                <SuggestionCard key={i} suggestion={s} index={i} />
              ))}

              <TouchableOpacity style={styles.refreshBtn} onPress={fetchSuggestions}>
                <Ionicons name="refresh-outline" size={15} color={COLORS.primary} />
                <Text style={styles.refreshText}>{t('suggestions.refresh')}</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>

        {/* ── Price Comparator ───────────────────────── */}
        <Animated.View style={[styles.sectionCard, priceCardAnim.style]}>
          <View style={styles.sectionCardHeader}>
            <View style={[styles.sectionIconBg, { backgroundColor: COLORS.secondary + '25' }]}>
              <Ionicons name="storefront-outline" size={16} color={COLORS.secondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionCardTitle, { color: COLORS.secondary }]}>{t('suggestions.priceComparator')}</Text>
              <Text style={styles.sectionCardSub}>{t('suggestions.subTitle9')}</Text>
            </View>
          </View>

          {/* Search bar */}
          <View style={styles.searchRow}>
            <View style={styles.searchInputWrapper}>
              <Ionicons name="search-outline" size={18} color={COLORS.onSurfaceVariant} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('suggestions.searchPlaceholder')}
                placeholderTextColor={COLORS.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={searchPrices}
                returnKeyType="search"
              />
            </View>
            <TouchableOpacity
              onPress={searchPrices}
              disabled={searching}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={canComparePrices ? ['#44ddc1', '#00b89c'] : ['#444', '#333']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.searchBtn}
              >
                {searching
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name={canComparePrices ? 'search' : 'lock-closed'} size={20} color="#fff" />
                }
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Live loading indicator while searching */}
          {searching && searchResults?.items?.length > 0 && (
            <View style={styles.liveRow}>
              <ActivityIndicator size="small" color={COLORS.secondary} />
              <Text style={styles.liveText}>
                {t('suggestions.liveResults', { n: searchResults.items.length })}
              </Text>
            </View>
          )}

          {searchResults && (
            <>
              {searchResults.items.length === 0 && !searching ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="search-outline" size={32} color={COLORS.onSurfaceVariant} />
                  <Text style={styles.emptyTitle}>{t('suggestions.noResults', { query: searchQuery })}</Text>
                  <Text style={styles.emptyHint}>{t('suggestions.noResultsHint')}</Text>
                </View>
              ) : (
                <>
                  {searchResults.stats && (
                    <View style={styles.statsCard}>
                      <StatBadge label={t('suggestions.statCheapest')} value={searchResults.stats.min} color={COLORS.secondary} />
                      <View style={styles.statsDivider} />
                      <StatBadge label={t('suggestions.statAvg')} value={searchResults.stats.avg} color={COLORS.warning} />
                      <View style={styles.statsDivider} />
                      <StatBadge label={t('suggestions.statMostExpensive')} value={searchResults.stats.max} color={COLORS.danger} />
                    </View>
                  )}
                  {searchResults.stores?.length > 0 && (
                    <Text style={styles.storesLabel}>
                      {searchResults.items.length} products · {searchResults.stores.join(", ")}
                    </Text>
                  )}
                  {searchResults.items.map((item, i) => (
                    <ProductCard key={i} item={item} isFirst={i === 0} />
                  ))}
                </>
              )}
            </>
          )}
        </Animated.View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

function SuggestionCard({ suggestion, index }) {
  const prio = PRIORITY_CONFIG[suggestion.priority] || PRIORITY_CONFIG.medium;
  const stagger = useStaggerEntrance(index, { baseDelay: 80, fromY: 16 });

  return (
    <Animated.View style={[styles.suggCard, stagger.style]}>
      <View style={styles.suggHeader}>
        <View style={[styles.suggIndex, { backgroundColor: prio.color + "18" }]}>
          <Text style={[styles.suggIndexText, { color: prio.color }]}>{index + 1}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.suggTitle}>{suggestion.title}</Text>
          <View style={styles.suggMeta}>
            <View style={[styles.suggTagBadge, { backgroundColor: prio.color + '18' }]}>
              <Text style={[styles.suggTagText, { color: prio.color }]}>{prio.tag}</Text>
            </View>
            {suggestion.category && (
              <Text style={styles.suggCategory}>{suggestion.category}</Text>
            )}
          </View>
        </View>
        {suggestion.potentialSaving > 0 && (
          <Text style={styles.suggSaving}>
            -${suggestion.potentialSaving.toLocaleString()}/mo
          </Text>
        )}
      </View>
      <Text style={styles.suggDesc}>{suggestion.description}</Text>
    </Animated.View>
  );
}

function StatBadge({ label, value, color }) {
  return (
    <View style={styles.statBadge}>
      <Text style={[styles.statValue, { color }]}>
        ${value?.toLocaleString("es-UY", { maximumFractionDigits: 0 })}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ProductCard({ item, isFirst }) {
  const { t } = useLanguage();
  const discount =
    item.listPrice > item.price
      ? Math.round((1 - item.price / item.listPrice) * 100)
      : 0;

  return (
    <TouchableOpacity
      style={[styles.productCard, isFirst && styles.productCardBest]}
      onPress={() => item.url && Linking.openURL(item.url)}
      activeOpacity={0.75}
    >
      {isFirst && (
        <View style={styles.bestBadge}>
          <Ionicons name="trophy" size={10} color={COLORS.secondary} />
          <Text style={styles.bestBadgeText}>{t('suggestions.bestPrice')}</Text>
        </View>
      )}
      <View style={styles.productRow}>
        {item.image ? (
          <Image
            source={{ uri: item.image }}
            style={styles.productImage}
            resizeMode="contain"
          />
        ) : (
          <View style={[styles.productImage, styles.productImagePlaceholder]}>
            <Ionicons name="cube-outline" size={20} color={COLORS.onSurfaceVariant} />
          </View>
        )}
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
          <View style={[styles.storeBadge, { backgroundColor: item.storeColor + "22" }]}>
            <Text style={[styles.storeText, { color: item.storeColor }]}>{item.store}</Text>
          </View>
        </View>
        <View style={styles.productPricing}>
          <Text style={styles.productPrice}>
            ${item.price?.toLocaleString("es-UY", { minimumFractionDigits: 0 })}
          </Text>
          {discount > 0 && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>-{discount}%</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={14} color={COLORS.onSurfaceVariant} style={{ marginTop: 4 }} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: SPACING.lg },

  // Top bar
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingTop: 56,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.background + "CC",
  },
  topBarLeft: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  topBarTitle: { fontSize: 18, fontWeight: "800", color: COLORS.onSurface, letterSpacing: -0.3 },

  // Hero
  hero: { marginBottom: SPACING.xl },
  heroTitle: { fontSize: 36, fontWeight: "800", color: COLORS.onSurface, letterSpacing: -0.5, marginBottom: SPACING.sm },
  heroSubtitle: { fontSize: 15, color: COLORS.onSurfaceVariant, lineHeight: 22 },

  // Section card container
  sectionCard: {
    backgroundColor: COLORS.surfaceContainerLow,
    borderRadius: RADIUS.xxl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant + "20",
    gap: SPACING.md,
  },
  sectionCardHeader: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  sectionIconBg: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionCardTitle: { fontSize: 16, fontWeight: "800", color: COLORS.primary },
  sectionCardSub: { fontSize: 11, color: COLORS.onSurfaceVariant, marginTop: 1 },

  // Generate button
  generateBtn: {
    borderRadius: RADIUS.xxl,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: SPACING.sm,
    ...SHADOWS.nebula,
  },
  generateBtnText: { color: COLORS.onPrimary, fontWeight: "700", fontSize: 16 },

  // Loading
  loadingCard: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    alignItems: "center",
    gap: SPACING.sm,
  },
  loadingText: { color: COLORS.onSurface, fontSize: 14, fontWeight: "600" },
  loadingHint: { color: COLORS.onSurfaceVariant, fontSize: 12 },

  // Insight
  insightCard: {
    backgroundColor: COLORS.primary + "12",
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    flexDirection: "row",
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
  },
  insightText: { color: COLORS.onSurface, fontSize: 14, lineHeight: 20, flex: 1 },

  // Saving card
  savingCard: {
    backgroundColor: COLORS.secondary + "12",
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.secondary + "30",
  },
  savingLabel: { fontSize: 9, fontWeight: "700", color: COLORS.secondary, letterSpacing: 2, marginBottom: 4 },
  savingAmount: { color: COLORS.secondary, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  savingYear: { color: COLORS.onSurfaceVariant, fontSize: 12, marginTop: 2 },
  savingIconBg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.secondary + "20",
    justifyContent: "center",
    alignItems: "center",
  },

  // Suggestion card
  suggCard: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant + "25",
  },
  suggHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  suggIndex: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.full,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  suggIndexText: { fontWeight: "800", fontSize: 13 },
  suggTitle: { color: COLORS.onSurface, fontSize: 14, fontWeight: "700", marginBottom: 4 },
  suggMeta: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, flexWrap: "wrap" },
  suggTagBadge: { borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 },
  suggTagText: { fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  suggCategory: { color: COLORS.onSurfaceVariant, fontSize: 11 },
  suggSaving: { color: COLORS.secondary, fontSize: 12, fontWeight: "800", flexShrink: 0 },
  suggDesc: { color: COLORS.onSurfaceVariant, fontSize: 13, lineHeight: 19 },

  // Refresh
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
  },
  refreshText: { color: COLORS.primary, fontSize: 13, fontWeight: "600" },

  // Search
  searchRow: { flexDirection: "row", gap: SPACING.sm },
  searchInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant + "30",
  },
  searchIcon: { marginRight: SPACING.sm },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    color: COLORS.onSurface,
    fontSize: 15,
  },
  searchBtn: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.xl,
    justifyContent: "center",
    alignItems: "center",
  },

  // Live loading
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  liveText: { color: COLORS.secondary, fontSize: 12, fontWeight: "600" },

  // Stats
  statsCard: {
    flexDirection: "row",
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant + "20",
  },
  statBadge: { flex: 1, alignItems: "center" },
  statsDivider: { width: 1, backgroundColor: COLORS.outlineVariant + "30" },
  statValue: { fontSize: 16, fontWeight: "800" },
  statLabel: { color: COLORS.onSurfaceVariant, fontSize: 10, marginTop: 2 },
  storesLabel: { color: COLORS.onSurfaceVariant, fontSize: 11 },

  // Product card
  productCard: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant + "20",
  },
  productCardBest: {
    borderColor: COLORS.secondary + "50",
    borderWidth: 1.5,
  },
  bestBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: SPACING.sm,
  },
  bestBadgeText: { color: COLORS.secondary, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  productRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  productImage: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  productImagePlaceholder: { justifyContent: "center", alignItems: "center" },
  productInfo: { flex: 1 },
  productName: { color: COLORS.onSurface, fontSize: 13, lineHeight: 18, marginBottom: 5 },
  storeBadge: {
    alignSelf: "flex-start",
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  storeText: { fontSize: 10, fontWeight: "700" },
  productPricing: { alignItems: "flex-end" },
  productPrice: { color: COLORS.onSurface, fontSize: 16, fontWeight: "800" },
  discountBadge: {
    backgroundColor: COLORS.secondary + "20",
    borderRadius: RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 3,
  },
  discountText: { color: COLORS.secondary, fontSize: 10, fontWeight: "700" },

  // Empty
  emptyCard: { alignItems: "center", paddingVertical: SPACING.xl, gap: SPACING.sm },
  emptyTitle: { color: COLORS.onSurface, fontSize: 15, fontWeight: "600" },
  emptyHint: { color: COLORS.onSurfaceVariant, fontSize: 13 },
});
