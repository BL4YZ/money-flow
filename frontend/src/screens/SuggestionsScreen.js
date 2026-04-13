import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, TextInput,
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

  // Búsqueda de precios MercadoLibre
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
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults(null);
    try {
      const q = searchQuery.trim();
      const response = await fetch(
        `https://api.mercadolibre.com/sites/MLU/search?q=${encodeURIComponent(q)}&limit=10&sort=price_asc`,
        { headers: { 'Accept': 'application/json' } }
      );
      const json = await response.json();
      if (!response.ok) throw new Error(json.message || `Error ${response.status}`);

      const items = (json.results || []).map(item => ({
        id: item.id,
        title: item.title,
        price: item.price,
        currency: item.currency_id,
        condition: item.condition,
        thumbnail: item.thumbnail,
        url: item.permalink,
        seller: item.seller?.nickname,
        freeShipping: item.shipping?.free_shipping || false,
      }));

      const prices = items.map(i => i.price);
      const stats = prices.length > 0 ? {
        min: Math.min(...prices),
        max: Math.max(...prices),
        avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
      } : null;

      setSearchResults({ query: q, items, stats, total: json.paging?.total || 0 });
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Error al buscar precios', text2: err.message });
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
            {/* Insight principal */}
            {suggestions.insight && (
              <View style={styles.insightCard}>
                <Ionicons name="eye-outline" size={18} color={COLORS.primary} />
                <Text style={styles.insightText}>{suggestions.insight}</Text>
              </View>
            )}

            {/* Potencial de ahorro */}
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

            {/* Lista de sugerencias */}
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
          Buscá cualquier producto y compará precios en MercadoLibre Uruguay.
        </Text>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Ej: notebook, zapatillas, arroz..."
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
          <View style={styles.resultsCard}>
            <Text style={styles.resultsTitle}>
              {searchResults.total.toLocaleString()} resultados para "{searchResults.query}"
            </Text>

            {searchResults.stats && (
              <View style={styles.statsRow}>
                <PriceStat label="Mínimo" value={searchResults.stats.min} color={COLORS.success} />
                <PriceStat label="Promedio" value={searchResults.stats.avg} color={COLORS.warning} />
                <PriceStat label="Máximo" value={searchResults.stats.max} color={COLORS.danger} />
              </View>
            )}

            {searchResults.items.map((item, i) => (
              <PriceRow key={item.id} item={item} isFirst={i === 0} />
            ))}
          </View>
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

function PriceStat({ label, value, color }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={[styles.priceStatValue, { color }]}>${value?.toLocaleString()}</Text>
      <Text style={styles.priceStatLabel}>{label}</Text>
    </View>
  );
}

function PriceRow({ item, isFirst }) {
  return (
    <View style={[styles.priceRow, isFirst && { borderColor: COLORS.success }]}>
      {isFirst && (
        <View style={styles.bestBadge}><Text style={styles.bestBadgeText}>Más barato</Text></View>
      )}
      <Text style={styles.priceItemTitle} numberOfLines={2}>{item.title}</Text>
      <View style={styles.priceRowBottom}>
        <Text style={styles.priceAmount}>${item.price?.toLocaleString()}</Text>
        <View style={{ flexDirection: 'row', gap: SPACING.xs, alignItems: 'center' }}>
          {item.freeShipping && (
            <View style={styles.freeBadge}><Text style={styles.freeBadgeText}>Envío gratis</Text></View>
          )}
          <Text style={styles.conditionText}>{item.condition === 'new' ? 'Nuevo' : 'Usado'}</Text>
        </View>
      </View>
    </View>
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
  resultsCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  resultsTitle: { color: COLORS.textSecondary, fontSize: 12, marginBottom: SPACING.md },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: SPACING.sm, marginBottom: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  priceStatValue: { fontSize: 18, fontWeight: '700' },
  priceStatLabel: { color: COLORS.textSecondary, fontSize: 12 },
  priceRow: { paddingVertical: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border, borderLeftWidth: 0, borderRightWidth: 0, borderBottomWidth: 0, borderColor: COLORS.border },
  bestBadge: { backgroundColor: COLORS.success + '22', borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 4 },
  bestBadgeText: { color: COLORS.success, fontSize: 11, fontWeight: '600' },
  priceItemTitle: { color: COLORS.text, fontSize: 13, lineHeight: 18, marginBottom: 4 },
  priceRowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceAmount: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  freeBadge: { backgroundColor: COLORS.success + '22', borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 2 },
  freeBadgeText: { color: COLORS.success, fontSize: 11 },
  conditionText: { color: COLORS.textMuted, fontSize: 12 },
});
