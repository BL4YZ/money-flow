import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Image, Linking, KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { usePlan } from '../context/PlanContext';
import { COLORS, SPACING, RADIUS, SHADOWS, GRADIENT } from '../theme';
import { useEntrance } from '../utils/animations';

// Categorías — deben coincidir con las del backend (CATEGORIES en scraper.js)
const CATEGORIES = [
  { id: null,           label: 'Todo',         icon: 'globe-outline' },
  { id: 'supermercado', label: 'Super',         icon: 'cart-outline' },
  { id: 'farmacia',     label: 'Farmacia',      icon: 'medical-outline' },
  { id: 'belleza',      label: 'Belleza',       icon: 'sparkles-outline' },
  { id: 'ropa',         label: 'Ropa',          icon: 'shirt-outline' },
  { id: 'hogar',        label: 'Hogar',         icon: 'tv-outline' },
];

function ResultCard({ item, index }) {
  const pct = item.listPrice && item.listPrice > item.price
    ? Math.round((1 - item.price / item.listPrice) * 100)
    : null;

  return (
    <TouchableOpacity
      style={styles.resultCard}
      onPress={() => item.url && Linking.openURL(item.url)}
      activeOpacity={0.82}
    >
      {item.image ? (
        <Image source={{ uri: item.image }} style={styles.resultImg} resizeMode="contain" />
      ) : (
        <View style={[styles.resultImg, styles.resultImgPlaceholder]}>
          <Ionicons name="image-outline" size={22} color={COLORS.onSurfaceVariant + '50'} />
        </View>
      )}
      <View style={styles.resultInfo}>
        <Text style={styles.resultName} numberOfLines={2}>{item.name}</Text>
        <View style={styles.resultStorRow}>
          <View style={[styles.storeDot, { backgroundColor: item.storeColor || COLORS.primary }]} />
          <Text style={styles.resultStore}>{item.store}</Text>
          {pct && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>-{pct}%</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.resultPriceCol}>
        <Text style={styles.resultPrice}>
          ${item.price.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
        </Text>
        {item.listPrice && item.listPrice > item.price && (
          <Text style={styles.resultListPrice}>
            ${item.listPrice.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
          </Text>
        )}
        {item.currency === 'USD' && (
          <Text style={styles.resultListPrice}>US$ {item.originalPrice.toLocaleString('es-UY')}</Text>
        )}
        {item.url && (
          <Ionicons name="open-outline" size={13} color={COLORS.primary} style={{ marginTop: 4 }} />
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function SearchScreen() {
  const { t } = useLanguage();
  const { canComparePrices, showUpgrade } = usePlan();
  const [query, setQuery]         = useState('');
  const [category, setCategory]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [results, setResults]     = useState(null); // null = no buscado aún
  const [stats, setStats]         = useState(null);
  const searchRef = useRef(null);

  const headerAnim = useEntrance({ fromY: -20 });

  const search = useCallback(async (q = query, cat = category) => {
    if (!canComparePrices) { showUpgrade('prices'); return; }
    const term = (q || '').trim();
    if (term.length < 2) return;
    setLoading(true);
    setResults(null);
    try {
      const params = { q: term, limit: 24 };
      if (cat) params.category = cat;
      const { data } = await api.get('/prices/search', { params, timeout: 60000 });
      setResults(data.items || []);
      setStats(data.stats);
    } catch (err) {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, category, canComparePrices, showUpgrade]);

  const onCategoryChange = (catId) => {
    setCategory(catId);
    if (query.trim().length >= 2) search(query, catId);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <LinearGradient colors={canComparePrices ? GRADIENT.primary : ['#555', '#333']} style={styles.headerIcon}>
            <Ionicons name={canComparePrices ? 'search' : 'lock-closed'} size={20} color={COLORS.onPrimary} />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitle}>Buscar precios</Text>
              {!canComparePrices && (
                <View style={styles.proBadge}>
                  <Ionicons name="diamond" size={10} color={COLORS.primary} />
                  <Text style={styles.proBadgeText}>PRO</Text>
                </View>
              )}
            </View>
            <Text style={styles.headerSub}>Compará en 17 tiendas</Text>
          </View>
        </View>

        {/* Chips de categoría */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {CATEGORIES.map((cat) => {
            const active = category === cat.id;
            return (
              <TouchableOpacity
                key={String(cat.id)}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => onCategoryChange(cat.id)}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={cat.icon}
                  size={14}
                  color={active ? COLORS.onPrimary : COLORS.onSurfaceVariant}
                />
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Input de búsqueda */}
        <View style={styles.searchRow}>
          <TextInput
            ref={searchRef}
            style={styles.input}
            placeholder="ej: leche, shampoo, auriculares..."
            placeholderTextColor={COLORS.onSurfaceVariant + '60'}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => search()}
            returnKeyType="search"
          />
          <TouchableOpacity
            style={[styles.searchBtnWrap, (loading || (canComparePrices && query.trim().length < 2)) && styles.searchBtnDisabled]}
            onPress={() => search()}
            disabled={loading || (canComparePrices && query.trim().length < 2)}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={canComparePrices ? GRADIENT.primary : ['#555', '#333']}
              style={styles.searchBtn}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {loading
                ? <ActivityIndicator size="small" color={COLORS.onPrimary} />
                : <Ionicons name={canComparePrices ? 'search' : 'lock-closed'} size={20} color={COLORS.onPrimary} />
              }
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        {stats && !loading && (
          <View style={styles.statsRow}>
            <Text style={styles.statsText}>
              {results?.length ?? 0} resultados · min ${stats.min?.toLocaleString('es-UY', { maximumFractionDigits: 0 })} · max ${stats.max?.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
            </Text>
          </View>
        )}

        {/* Resultados */}
        {results && !loading && results.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={36} color={COLORS.onSurfaceVariant + '50'} />
            <Text style={styles.emptyText}>Sin resultados</Text>
            <Text style={styles.emptySub}>Probá con términos más genéricos</Text>
          </View>
        )}

        {results && !loading && results.map((item, i) => (
          <ResultCard key={item.url || i} item={item} index={i} />
        ))}

        {/* Estado inicial */}
        {results === null && !loading && canComparePrices && (
          <View style={styles.hint}>
            <Ionicons name="pricetag-outline" size={40} color={COLORS.primary + '40'} />
            <Text style={styles.hintText}>
              Elegí una categoría y buscá cualquier producto para comparar precios entre tiendas.
            </Text>
          </View>
        )}

        {/* Teaser premium para usuarios free */}
        {results === null && !loading && !canComparePrices && (
          <View style={styles.lockedTeaser}>
            <LinearGradient colors={GRADIENT.primary} style={styles.lockedIconWrap}>
              <Ionicons name="diamond" size={26} color={COLORS.onPrimary} />
            </LinearGradient>
            <Text style={styles.lockedTitle}>{t('premium.lockedPrices')}</Text>
            <Text style={styles.lockedSub}>{t('premium.upgradeNudgePrices')}</Text>
            <TouchableOpacity
              style={styles.lockedCta}
              activeOpacity={0.85}
              onPress={() => showUpgrade('prices')}
            >
              <LinearGradient colors={GRADIENT.primary} style={styles.lockedCtaGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Ionicons name="diamond-outline" size={16} color={COLORS.onPrimary} />
                <Text style={styles.lockedCtaText}>{t('premium.ctaBtn')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: SPACING.md, paddingTop: 60 },

  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.lg },
  headerIcon: { width: 44, height: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: COLORS.onSurface },
  headerSub: { fontSize: 13, color: COLORS.onSurfaceVariant, marginTop: 2 },
  proBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.primary + '22',
    borderRadius: RADIUS.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  proBadgeText: { fontSize: 10, fontWeight: '800', color: COLORS.primary, letterSpacing: 0.5 },

  // Chips
  chipsRow: { flexDirection: 'row', gap: SPACING.sm, paddingBottom: SPACING.md },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.full,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: COLORS.outlineVariant,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipLabel: { fontSize: 13, fontWeight: '600', color: COLORS.onSurfaceVariant },
  chipLabelActive: { color: COLORS.onPrimary },

  // Search
  searchRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  input: {
    flex: 1,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    color: COLORS.onSurface,
    fontSize: 15,
    borderWidth: 1, borderColor: COLORS.outlineVariant,
  },
  searchBtnWrap: { borderRadius: RADIUS.lg, ...SHADOWS.nebula },
  searchBtn: {
    width: 50, height: 50,
    borderRadius: RADIUS.lg,
    alignItems: 'center', justifyContent: 'center',
  },
  searchBtnDisabled: { opacity: 0.4 },

  // Stats
  statsRow: { marginBottom: SPACING.md },
  statsText: { fontSize: 12, color: COLORS.onSurfaceVariant },

  // Result card
  resultCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.lg,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.outlineVariant,
  },
  resultImg: { width: 60, height: 60, borderRadius: RADIUS.sm },
  resultImgPlaceholder: { backgroundColor: COLORS.outlineVariant + '30', alignItems: 'center', justifyContent: 'center' },
  resultInfo: { flex: 1 },
  resultName: { fontSize: 13, fontWeight: '600', color: COLORS.onSurface, marginBottom: 4 },
  resultStorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  storeDot: { width: 8, height: 8, borderRadius: 4 },
  resultStore: { fontSize: 11, color: COLORS.onSurfaceVariant, fontWeight: '500' },
  discountBadge: { backgroundColor: COLORS.secondary + '25', borderRadius: RADIUS.full, paddingHorizontal: 6, paddingVertical: 2 },
  discountText: { fontSize: 10, fontWeight: '700', color: COLORS.secondary },
  resultPriceCol: { alignItems: 'flex-end', minWidth: 64 },
  resultPrice: { fontSize: 15, fontWeight: '800', color: COLORS.onSurface },
  resultListPrice: { fontSize: 11, color: COLORS.onSurfaceVariant, textDecorationLine: 'line-through' },

  // Empty / hint
  empty: { alignItems: 'center', padding: SPACING.xl, gap: SPACING.sm },
  emptyText: { fontSize: 15, fontWeight: '600', color: COLORS.onSurface },
  emptySub: { fontSize: 13, color: COLORS.onSurfaceVariant, textAlign: 'center' },
  hint: { alignItems: 'center', padding: SPACING.xl, gap: SPACING.md, marginTop: SPACING.xl },
  hintText: { fontSize: 14, color: COLORS.onSurfaceVariant, textAlign: 'center', lineHeight: 22 },

  // Teaser premium (usuarios free)
  lockedTeaser: {
    alignItems: 'center',
    padding: SPACING.xl,
    marginTop: SPACING.lg,
    gap: SPACING.sm,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderStyle: 'dashed',
  },
  lockedIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.xs,
    ...SHADOWS.nebula,
  },
  lockedTitle: { fontSize: 17, fontWeight: '800', color: COLORS.onSurface },
  lockedSub: { fontSize: 13, color: COLORS.onSurfaceVariant, textAlign: 'center', lineHeight: 19, marginBottom: SPACING.sm },
  lockedCta: { borderRadius: RADIUS.full, overflow: 'hidden', ...SHADOWS.nebula },
  lockedCtaGradient: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: SPACING.lg, paddingVertical: 12,
  },
  lockedCtaText: { fontSize: 14, fontWeight: '700', color: COLORS.onPrimary },
});
