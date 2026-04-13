import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, TextInput, Image, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../api/client';
import { COLORS, SPACING, RADIUS } from '../theme';

const PRIORITY_CONFIG = {
  high: { color: COLORS.danger, label: 'Alta', icon: 'alert-circle' },
  medium: { color: COLORS.warning, label: 'Media', icon: 'warning' },
  low: { color: COLORS.success, label: 'Baja', icon: 'information-circle' },
};

export default function SuggestionsScreen() {
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  const fetchSuggestions = async () => {
    setLoading(true);
    setSuggestions(null);
    try {
      const { data } = await api.post('/suggestions');
      setSuggestions(data);
    } catch (err) {
      const msg = err.response?.data?.error || 'Error al generar sugerencias';
      Toast.show({ type: 'error', text1: msg });
    } finally {
      setLoading(false);
    }
  };

  const searchPrices = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setSearchResults(null);
    try {
      const { data } = await api.get('/prices/search', { params: { q, limit: 15 } });
      setSearchResults(data);
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Error al buscar precios' });
    } finally {
      setSearching(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.title}>IA + Comparador</Text>
      </View>

      {/* ── Sección IA ─────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="bulb-outline" size={20} color={COLORS.primary} />
          <Text style={styles.sectionTitle}>Sugerencias de ahorro</Text>
        </View>
        <Text style={styles.sectionDesc}>
          Claude analiza tus últimos 3 meses de gastos y te dice exactamente dónde podés ahorrar.
        </Text>

        {!suggestions && !loading && (
          <TouchableOpacity style={styles.generateBtn} onPress={fetchSuggestions}>
            <Ionicons name="sparkles-outline" size={20} color="#fff" />
            <Text style={styles.generateBtnText}>Analizar mis gastos</Text>
          </TouchableOpacity>
        )}

        {loading && (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Claude está analizando tus gastos...</Text>
            <Text style={styles.loadingHint}>Esto tarda ~5 segundos</Text>
          </View>
        )}

        {suggestions && (
          <>
            {suggestions.insight && (
              <View style={styles.insightCard}>
                <Ionicons name="eye-outline" size={18} color={COLORS.primary} />
                <Text style={styles.insightText}>{suggestions.insight}</Text>
              </View>
            )}
            {suggestions.monthlySavingPotential > 0 && (
              <View style={styles.savingCard}>
                <Text style={styles.savingLabel}>Potencial de ahorro mensual</Text>
                <Text style={styles.savingAmount}>
                  ${suggestions.monthlySavingPotential.toLocaleString()}
                </Text>
                <Text style={styles.savingYear}>
                  ${(suggestions.monthlySavingPotential * 12).toLocaleString()} al año
                </Text>
              </View>
            )}
            {suggestions.suggestions?.map((s, i) => (
              <SuggestionCard key={i} suggestion={s} index={i} />
            ))}
            <TouchableOpacity style={styles.refreshBtn} onPress={fetchSuggestions}>
              <Ionicons name="refresh-outline" size={16} color={COLORS.primary} />
              <Text style={styles.refreshText}>Actualizar análisis</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── Sección Comparador ────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="search-outline" size={20} color={COLORS.secondary} />
          <Text style={[styles.sectionTitle, { color: COLORS.secondary }]}>Comparador de precios</Text>
        </View>
        <Text style={styles.sectionDesc}>
          Comparamos precios en supermercados de Uruguay al instante.
        </Text>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Ej: leche, arroz, aceite..."
            placeholderTextColor={COLORS.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={searchPrices}
            returnKeyType="search"
          />
          <TouchableOpacity style={styles.searchBtn} onPress={searchPrices} disabled={searching}>
            {searching
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="search" size={22} color="#fff" />
            }
          </TouchableOpacity>
        </View>

        {searchResults && (
          <>
            {searchResults.items.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="search-outline" size={32} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>Sin resultados para "{searchResults.query}"</Text>
              </View>
            ) : (
              <>
                {searchResults.stats && (
                  <View style={styles.statsCard}>
                    <StatBadge label="Más barato" value={searchResults.stats.min} color={COLORS.success} />
                    <StatBadge label="Promedio" value={searchResults.stats.avg} color={COLORS.warning} />
                    <StatBadge label="Más caro" value={searchResults.stats.max} color={COLORS.danger} />
                  </View>
                )}
                <Text style={styles.storesLabel}>
                  {searchResults.items.length} productos en {searchResults.stores?.join(', ')}
                </Text>
                {searchResults.items.map((item, i) => (
                  <ProductCard key={i} item={item} isFirst={i === 0} />
                ))}
              </>
            )}
          </>
        )}
      </View>

      <View style={{ height: SPACING.xxl }} />
    </ScrollView>
  );
}

function SuggestionCard({ suggestion, index }) {
  const prio = PRIORITY_CONFIG[suggestion.priority] || PRIORITY_CONFIG.medium;
  return (
    <View style={styles.suggCard}>
      <View style={styles.suggHeader}>
        <View style={[styles.suggIndex, { backgroundColor: prio.color + '22' }]}>
          <Text style={[styles.suggIndexText, { color: prio.color }]}>{index + 1}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.suggTitle}>{suggestion.title}</Text>
          <View style={styles.suggMeta}>
            <Ionicons name={prio.icon} size={12} color={prio.color} />
            <Text style={[styles.suggPriority, { color: prio.color }]}>{prio.label}</Text>
            {suggestion.category && <Text style={styles.suggCategory}> · {suggestion.category}</Text>}
          </View>
        </View>
        {suggestion.potentialSaving > 0 && (
          <Text style={styles.suggSaving}>-${suggestion.potentialSaving.toLocaleString()}/mes</Text>
        )}
      </View>
      <Text style={styles.suggDesc}>{suggestion.description}</Text>
    </View>
  );
}

function StatBadge({ label, value, color }) {
  return (
    <View style={styles.statBadge}>
      <Text style={[styles.statValue, { color }]}>${value?.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ProductCard({ item, isFirst }) {
  const discount = item.listPrice > item.price
    ? Math.round((1 - item.price / item.listPrice) * 100)
    : 0;

  return (
    <TouchableOpacity
      style={[styles.productCard, isFirst && styles.productCardBest]}
      onPress={() => item.url && Linking.openURL(item.url)}
      activeOpacity={0.7}
    >
      {isFirst && (
        <View style={styles.bestBadge}>
          <Ionicons name="trophy-outline" size={10} color={COLORS.success} />
          <Text style={styles.bestBadgeText}>Más barato</Text>
        </View>
      )}
      <View style={styles.productRow}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.productImage} resizeMode="contain" />
        ) : (
          <View style={[styles.productImage, styles.productImagePlaceholder]}>
            <Ionicons name="cube-outline" size={20} color={COLORS.textMuted} />
          </View>
        )}
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
          <View style={[styles.storeBadge, { backgroundColor: item.storeColor + '22' }]}>
            <Text style={[styles.storeText, { color: item.storeColor }]}>{item.store}</Text>
          </View>
        </View>
        <View style={styles.productPricing}>
          <Text style={styles.productPrice}>${item.price?.toLocaleString('es-UY', { minimumFractionDigits: 0 })}</Text>
          {discount > 0 && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>-{discount}%</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} style={{ marginTop: 4 }} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: SPACING.lg, paddingTop: 56 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  section: { marginHorizontal: SPACING.lg, marginBottom: SPACING.xl },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.primary },
  sectionDesc: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 20, marginBottom: SPACING.md },
  generateBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: SPACING.sm },
  generateBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  loadingCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  loadingText: { color: COLORS.text, fontSize: 15, marginTop: SPACING.md, fontWeight: '600' },
  loadingHint: { color: COLORS.textSecondary, fontSize: 13, marginTop: SPACING.xs },
  insightCard: { backgroundColor: COLORS.primary + '15', borderRadius: RADIUS.md, padding: SPACING.md, flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.primary + '44' },
  insightText: { color: COLORS.text, fontSize: 14, lineHeight: 20, flex: 1 },
  savingCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.success },
  savingLabel: { color: COLORS.textSecondary, fontSize: 13 },
  savingAmount: { color: COLORS.success, fontSize: 32, fontWeight: '700', marginVertical: 4 },
  savingYear: { color: COLORS.textMuted, fontSize: 13 },
  suggCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  suggHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginBottom: SPACING.sm },
  suggIndex: { width: 32, height: 32, borderRadius: RADIUS.full, justifyContent: 'center', alignItems: 'center' },
  suggIndexText: { fontWeight: '700', fontSize: 14 },
  suggTitle: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  suggMeta: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  suggPriority: { fontSize: 12, fontWeight: '600' },
  suggCategory: { color: COLORS.textMuted, fontSize: 12 },
  suggSaving: { color: COLORS.success, fontSize: 13, fontWeight: '700' },
  suggDesc: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 20 },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, paddingVertical: SPACING.sm },
  refreshText: { color: COLORS.primary, fontSize: 14 },
  searchRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  searchInput: { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 12, color: COLORS.text, fontSize: 16, borderWidth: 1, borderColor: COLORS.border },
  searchBtn: { backgroundColor: COLORS.secondary, borderRadius: RADIUS.md, width: 48, justifyContent: 'center', alignItems: 'center' },
  statsCard: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  statBadge: { alignItems: 'center' },
  statValue: { fontSize: 17, fontWeight: '700' },
  statLabel: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  storesLabel: { color: COLORS.textMuted, fontSize: 12, marginBottom: SPACING.sm },
  productCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  productCardBest: { borderColor: COLORS.success, borderWidth: 2 },
  bestBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: SPACING.xs },
  bestBadgeText: { color: COLORS.success, fontSize: 11, fontWeight: '700' },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  productImage: { width: 56, height: 56, borderRadius: RADIUS.sm, backgroundColor: COLORS.background },
  productImagePlaceholder: { justifyContent: 'center', alignItems: 'center' },
  productInfo: { flex: 1 },
  productName: { color: COLORS.text, fontSize: 13, lineHeight: 18, marginBottom: 4 },
  storeBadge: { alignSelf: 'flex-start', borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 2 },
  storeText: { fontSize: 11, fontWeight: '600' },
  productPricing: { alignItems: 'flex-end' },
  productPrice: { color: COLORS.text, fontSize: 17, fontWeight: '700' },
  discountBadge: { backgroundColor: COLORS.success + '22', borderRadius: RADIUS.sm, paddingHorizontal: 4, paddingVertical: 1, marginTop: 2 },
  discountText: { color: COLORS.success, fontSize: 11, fontWeight: '700' },
  emptyCard: { alignItems: 'center', padding: SPACING.xl, gap: SPACING.sm },
  emptyText: { color: COLORS.textSecondary, fontSize: 14 },
});
