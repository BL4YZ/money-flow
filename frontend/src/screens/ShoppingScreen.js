import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Linking, Image,
  KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../api/client';
import { usePlan } from '../context/PlanContext';
import { COLORS, SPACING, RADIUS, SHADOWS, GRADIENT } from '../theme';
import { useEntrance, useStaggerEntrance } from '../utils/animations';
import { useLanguage } from '../context/LanguageContext';
import { COMMON_PRODUCTS } from '../data/products';

// Loading messages are set dynamically from t() in the component

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const POLL_INTERVAL = 1500; // ms entre cada consulta de progreso

// "$45/L", "$139/kg", "$4,90/un" — el precio por unidad es lo único que
// permite comparar envases de distinto tamaño.
function formatUnitPrice(item) {
  if (!item || item.unitPrice == null) return null;
  const decimals = item.unitPrice < 10 ? 2 : 0;
  return `$${item.unitPrice.toLocaleString('es-UY', { maximumFractionDigits: decimals })}/${item.unitLabel}`;
}

// ─── Item chip en la lista ────────────────────────────────────────
function ItemChip({ item, index, onDelete }) {
  const anim = useStaggerEntrance(index, { baseDelay: 40, fromY: 10 });
  return (
    <Animated.View style={[styles.itemChip, anim.style]}>
      <Ionicons name="cart-outline" size={14} color={COLORS.primary} style={{ marginRight: 6 }} />
      <Text style={styles.itemChipText} numberOfLines={1}>{item.name}</Text>
      {item.quantity > 1 && (
        <Text style={styles.itemQty}>×{item.quantity}</Text>
      )}
      <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close-circle" size={16} color={COLORS.onSurfaceVariant + '80'} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Resultado por tienda ─────────────────────────────────────────
function StoreCard({ store, totalItems, rank, index }) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const anim = useStaggerEntrance(index, { baseDelay: 60, fromY: 16 });
  const isFull = store.found === totalItems;
  const isBest = rank === 0 && isFull;

  return (
    <Animated.View style={anim.style}>
      <TouchableOpacity
        style={[styles.storeCard, isBest && styles.storeCardBest]}
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.85}
      >
        <View style={styles.storeCardHeader}>
          <View style={[styles.storeColorDot, { backgroundColor: store.color }]} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.storeName}>{store.name}</Text>
              {isBest && (
                <View style={styles.bestBadge}>
                  <Text style={styles.bestBadgeText}>{t('shopping.bestStore')}</Text>
                </View>
              )}
              {!isFull && (
                <View style={styles.partialBadge}>
                  <Text style={styles.partialBadgeText}>{t('shopping.partialItems', { found: store.found, total: totalItems })}</Text>
                </View>
              )}
            </View>
            <Text style={styles.storeFoundText}>
              {isFull
                ? t(store.found === 1 ? 'shopping.foundItem' : 'shopping.foundItems', { n: store.found })
                : t('shopping.missing', { items: store.missing.join(', ') })}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.storeTotal, isBest && { color: COLORS.secondary }]}>
              ${store.total.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
            </Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={COLORS.onSurfaceVariant}
              style={{ marginTop: 4 }}
            />
          </View>
        </View>

        {expanded && (
          <View style={styles.storeItemsList}>
            {store.items.map((si, i) => (
              <View key={i} style={styles.storeItemRow}>
                <Text style={styles.storeItemName} numberOfLines={2}>{si.productName}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.storeItemPrice}>
                      ${si.price.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
                    </Text>
                    {si.currency === 'USD' && (
                      <Text style={styles.storeItemUsd}>US$ {si.originalPrice.toLocaleString('es-UY')}</Text>
                    )}
                    {si.unitPrice != null && (
                      <Text style={styles.storeItemUnit}>{formatUnitPrice(si)}</Text>
                    )}
                  </View>
                  {si.url ? (
                    <TouchableOpacity onPress={() => Linking.openURL(si.url)}>
                      <Ionicons name="open-outline" size={14} color={COLORS.primary} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Resultado por ítem ───────────────────────────────────────────
function ItemResult({ result, index }) {
  const anim = useStaggerEntrance(index, { baseDelay: 50, fromY: 12 });
  if (!result.cheapest) return null;

  return (
    <Animated.View style={[styles.itemResult, anim.style]}>
      <View style={styles.itemResultHeader}>
        <Text style={styles.itemResultName}>{result.item}</Text>
        <Text style={styles.itemResultPrice}>
          ${result.cheapest.price.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <View style={[styles.storeColorDot, { backgroundColor: result.cheapest.storeColor, width: 8, height: 8 }]} />
        <Text style={styles.itemResultStore}>{result.cheapest.store}</Text>
        <Text style={styles.itemResultProductName} numberOfLines={1}>· {result.cheapest.name}</Text>
        {result.cheapest.currency === 'USD' && (
          <Text style={styles.itemResultProductName}>· US$ {result.cheapest.originalPrice.toLocaleString('es-UY')}</Text>
        )}
        {result.cheapest.unitPrice != null && (
          <Text style={styles.itemResultUnit}>· {formatUnitPrice(result.cheapest)}</Text>
        )}
      </View>
      {result.options.length > 1 && (
        <View style={styles.itemResultOtherStores}>
          {result.options.slice(1, 3).map((opt, i) => (
            <View key={i} style={styles.itemResultOtherStore}>
              <View style={[styles.storeColorDot, { backgroundColor: opt.storeColor, width: 6, height: 6 }]} />
              <Text style={styles.itemResultOtherPrice}>
                {opt.store} ${opt.price.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Animated.View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────
export default function ShoppingScreen() {
  const { t } = useLanguage();
  const { canShopping, showUpgrade } = usePlan();
  const [items, setItems] = useState([]);
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [results, setResults] = useState(null);
  const loadingMsgs = [
    t('shopping.loadingMsg1'), t('shopping.loadingMsg2'), t('shopping.loadingMsg3'),
    t('shopping.loadingMsg4'), t('shopping.loadingMsg5'),
  ];
  const [loadingMsg, setLoadingMsg] = useState('');
  const [progress, setProgress] = useState(null); // { completed, total }
  const [suggestions, setSuggestions] = useState([]); // autocompletado
  const [category, setCategory] = useState(null); // filtro de categoría
  const loadingInterval = useRef(null);
  const pollRef = useRef(null); // jobId activo; sirve para cancelar el polling
  const suggestTimer = useRef(null); // debounce de sugerencias en vivo
  const suggestSeq = useRef(0);      // descarta respuestas viejas

  const headerAnim = useEntrance({ fromY: -20 });
  const inputAnim  = useEntrance({ delay: 80 });

  const loadItems = useCallback(async () => {
    try {
      const { data } = await api.get('/shopping');
      setItems(data.items);
    } catch (_) {}
  }, []);

  // Detiene el polling Y le avisa al backend que deje de scrapear (libera el proceso)
  const cancelActiveJob = useCallback(() => {
    const jobId = pollRef.current;
    pollRef.current = null;
    if (jobId) {
      api.post(`/shopping/compare/${jobId}/cancel`).catch(() => {});
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadItems();
    setResults(null);
    return () => {
      // Al salir de la pantalla, cancelamos el polling y el scraping en el backend
      cancelActiveJob();
    };
  }, [loadItems, cancelActiveJob]));

  // ─── Autocompletado: lista local al instante + tienda con debounce ──
  const norm = (s) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const localSuggestions = (q) => {
    const nq = norm(q);
    const matches = COMMON_PRODUCTS.filter((p) => norm(p).includes(nq));
    // primero los que empiezan con la query, luego el resto
    matches.sort((a, b) => norm(a).startsWith(nq) === norm(b).startsWith(nq) ? 0 : norm(a).startsWith(nq) ? -1 : 1);
    return matches.slice(0, 6);
  };

  const mergeSuggestions = (local, live) => {
    const seen = new Set(local.map(norm));
    const extra = live.filter((s) => !seen.has(norm(s)));
    return [...local, ...extra].slice(0, 8);
  };

  const onChangeInput = (text) => {
    setInput(text);
    const q = text.trim();
    if (q.length < 2) { setSuggestions([]); return; }

    // 1) local, instantáneo
    const local = localSuggestions(q);
    setSuggestions(local);

    // 2) en vivo desde la tienda, con debounce (300ms)
    clearTimeout(suggestTimer.current);
    const seq = ++suggestSeq.current;
    suggestTimer.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/shopping/suggest', { params: { q } });
        if (seq !== suggestSeq.current) return; // llegó una respuesta vieja
        setSuggestions(mergeSuggestions(local, data.suggestions || []));
      } catch (_) {}
    }, 300);
  };

  const addItem = async (nameArg) => {
    const name = (typeof nameArg === 'string' ? nameArg : input).trim();
    if (!name) return;
    setSuggestions([]);
    suggestSeq.current++; // invalida sugerencias en vuelo
    setAdding(true);
    try {
      const { data } = await api.post('/shopping/items', { name });
      setItems(prev => [...prev, data.item]);
      setInput('');
      setResults(null);
    } catch (_) {
      Toast.show({ type: 'error', text1: t('shopping.errorAdd') });
    } finally {
      setAdding(false);
    }
  };

  const deleteItem = async (id) => {
    setItems(prev => prev.filter(i => i.id !== id));
    setResults(null);
    try {
      await api.delete(`/shopping/items/${id}`);
    } catch (_) {}
  };

  const compare = async () => {
    if (!canShopping) { showUpgrade('shopping'); return; }
    if (items.length === 0) {
      Toast.show({ type: 'error', text1: t('shopping.errorEmpty') });
      return;
    }
    cancelActiveJob(); // por si quedó una comparación anterior corriendo
    setComparing(true);
    setResults(null);
    setProgress({ completed: 0, total: items.length });

    let msgIdx = 0;
    setLoadingMsg(loadingMsgs[0]);
    loadingInterval.current = setInterval(() => {
      msgIdx = (msgIdx + 1) % loadingMsgs.length;
      setLoadingMsg(loadingMsgs[msgIdx]);
    }, 3500);

    try {
      // 1) Arrancamos el job en el backend (responde al instante)
      const { data: start } = await api.post('/shopping/compare/start', { category: category || undefined });
      const jobId = start.jobId;
      pollRef.current = jobId;

      // 2) Consultamos el progreso cada POLL_INTERVAL y mostramos resultados parciales.
      //    Toleramos fallos transitorios (red, reinicio del backend): no abortamos
      //    al primer error, solo tras MAX_FAILS polls fallidos consecutivos.
      const MAX_FAILS = 5;
      let fails = 0;

      while (pollRef.current === jobId) {
        await sleep(POLL_INTERVAL);
        if (pollRef.current !== jobId) return; // cancelado (salió de la pantalla / nueva búsqueda)

        try {
          const resp = await api.get(`/shopping/compare/status/${jobId}`, {
            validateStatus: (s) => (s >= 200 && s < 300) || s === 304,
          });
          fails = 0;
          if (resp.status === 304) continue; // sin cambios desde el último poll

          const status = resp.data;
          setProgress({ completed: status.completed, total: status.total });
          setResults(status); // resultados parciales → la UI se va poblando

          if (status.status === 'done' || status.status === 'error' || status.status === 'cancelled') break;
        } catch (pollErr) {
          fails++;
          console.warn(`[compare] poll falló (${fails}/${MAX_FAILS}):`, pollErr.message);
          if (fails >= MAX_FAILS) throw pollErr; // demasiados fallos seguidos
        }
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: t('shopping.errorCompare'), text2: err.message });
    } finally {
      clearInterval(loadingInterval.current);
      pollRef.current = null;
      setComparing(false);
    }
  };

  const clearList = async () => {
    cancelActiveJob(); // cancelar comparación en curso (frontend + backend)
    for (const item of items) {
      try { await api.delete(`/shopping/items/${item.id}`); } catch (_) {}
    }
    setItems([]);
    setResults(null);
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
        <Animated.View style={[styles.header, headerAnim.style]}>
          <LinearGradient colors={GRADIENT.primary} style={styles.headerIcon}>
            <Ionicons name="cart" size={20} color={COLORS.onPrimary} />
          </LinearGradient>
          <View>
            <Text style={styles.headerTitle}>{t('shopping.title')}</Text>
            <Text style={styles.headerSub}>{t('shopping.subtitle')}</Text>
          </View>
        </Animated.View>

        {/* Input */}
        <Animated.View style={[styles.inputRow, inputAnim.style]}>
          <TextInput
            style={styles.input}
            placeholder={t('shopping.addPlaceholder')}
            placeholderTextColor={COLORS.onSurfaceVariant + '60'}
            value={input}
            onChangeText={onChangeInput}
            onSubmitEditing={() => addItem()}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[styles.addBtn, (!input.trim() || adding) && styles.addBtnDisabled]}
            onPress={() => addItem()}
            disabled={!input.trim() || adding}
          >
            {adding
              ? <ActivityIndicator size="small" color={COLORS.onPrimary} />
              : <Ionicons name="add" size={20} color={COLORS.onPrimary} />
            }
          </TouchableOpacity>
        </Animated.View>

        {/* Sugerencias de autocompletado */}
        {suggestions.length > 0 && (
          <View style={styles.suggestBox}>
            {suggestions.map((s, i) => (
              <TouchableOpacity
                key={s + i}
                style={[styles.suggestRow, i > 0 && styles.suggestRowBorder]}
                onPress={() => addItem(s)}
                activeOpacity={0.7}
              >
                <Ionicons name="search-outline" size={15} color={COLORS.onSurfaceVariant} />
                <Text style={styles.suggestText} numberOfLines={1}>{s}</Text>
                <Ionicons name="add-circle-outline" size={17} color={COLORS.primary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Items chips */}
        {items.length > 0 && (
          <View style={styles.chipsContainer}>
            <View style={styles.chipsRow}>
              {items.map((item, i) => (
                <ItemChip
                  key={item.id}
                  item={item}
                  index={i}
                  onDelete={() => deleteItem(item.id)}
                />
              ))}
            </View>
            <TouchableOpacity style={styles.clearBtn} onPress={clearList}>
              <Text style={styles.clearBtnText}>{t('shopping.clearList')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Filtro de categoría (solo cuando hay ítems en la lista) */}
        {items.length > 0 && !comparing && (
          <View style={styles.categoryRow}>
            {[
              { id: null,           label: 'Todo',     icon: 'globe-outline' },
              { id: 'supermercado', label: 'Super',    icon: 'cart-outline' },
              { id: 'farmacia',     label: 'Farmacia', icon: 'medical-outline' },
              { id: 'belleza',      label: 'Belleza',  icon: 'sparkles-outline' },
              { id: 'ropa',         label: 'Ropa',     icon: 'shirt-outline' },
              { id: 'hogar',        label: 'Hogar',    icon: 'tv-outline' },
            ].map((cat) => {
              const active = category === cat.id;
              return (
                <TouchableOpacity
                  key={String(cat.id)}
                  style={[styles.catChip, active && styles.catChipActive]}
                  onPress={() => setCategory(cat.id)}
                  activeOpacity={0.75}
                >
                  <Ionicons name={cat.icon} size={13} color={active ? COLORS.onPrimary : COLORS.onSurfaceVariant} />
                  <Text style={[styles.catChipLabel, active && styles.catChipLabelActive]}>{cat.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Compare button */}
        {items.length > 0 && !comparing && (
          <TouchableOpacity style={styles.compareBtn} onPress={compare} activeOpacity={0.85}>
            <LinearGradient colors={canShopping ? GRADIENT.primary : GRADIENT.locked} style={styles.compareBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name={canShopping ? 'search' : 'lock-closed-outline'} size={18} color={canShopping ? COLORS.onPrimary : COLORS.onPrimaryContainer} />
              <Text style={[styles.compareBtnText, !canShopping && { color: COLORS.onPrimaryContainer }]}>{canShopping ? t('shopping.compare') : t('premium.lockedShopping')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Progreso — SIEMPRE visible mientras busca (View plano, sin opacity animada) */}
        {comparing && (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>{loadingMsg}</Text>
            <Text style={styles.loadingSubtext}>
              {progress
                ? t('shopping.progress', { completed: progress.completed, total: progress.total })
                : t('shopping.loadingWait')}
            </Text>
            {progress && (
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.round((progress.completed / Math.max(progress.total, 1)) * 100)}%` },
                  ]}
                />
              </View>
            )}
          </View>
        )}

        {/* Results (parciales mientras busca, o finales) — View plano para evitar
            que la animación de entrada deje el contenedor invisible (opacity 0) */}
        {results && results.byStore.length > 0 && (
          <View>

            {/* Optimal cart summary */}
            <View style={styles.optimalCard}>
              <LinearGradient
                colors={['#1e1a2e', '#261d3a']}
                style={styles.optimalGradient}
              >
                <View style={styles.optimalHeader}>
                  <Ionicons name="trophy" size={18} color={COLORS.secondary} />
                  <Text style={styles.optimalTitle}>{t('shopping.optimalCart')}</Text>
                </View>
                <Text style={styles.optimalSubtext}>{t('shopping.optimalSub')}</Text>
                <Text style={styles.optimalTotal}>
                  ${results.optimalTotal.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
                </Text>
                {results.optimalSavings > 0 && (
                  <View style={styles.savingsRow}>
                    <Ionicons name="trending-down" size={14} color={COLORS.secondary} />
                    <Text style={styles.savingsText}>
                      {t('shopping.savings', { amount: results.optimalSavings.toLocaleString('es-UY', { maximumFractionDigits: 0 }) })}
                    </Text>
                  </View>
                )}
              </LinearGradient>
            </View>

            {/* Aviso: en Hogar/tecnología la variedad de modelos hace que el
                "más barato por tienda" no siempre sea el mismo producto. */}
            {category === 'hogar' && (
              <View style={styles.disclaimerBox}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.tertiary} />
                <Text style={styles.disclaimerText}>{t('shopping.hogarDisclaimer')}</Text>
              </View>
            )}

            {/* Per-item cheapest */}
            <Text style={styles.sectionLabel}>{t('shopping.bestPrice')}</Text>
            {results.results.map((r, i) => (
              <ItemResult key={r.itemId} result={r} index={i} />
            ))}

            {/* By store */}
            <Text style={[styles.sectionLabel, { marginTop: SPACING.lg }]}>{t('shopping.storesRanked')}</Text>
            {results.byStore.map((store, i) => (
              <StoreCard
                key={store.storeId}
                store={store}
                totalItems={results.totalItems}
                rank={i}
                index={i}
              />
            ))}

          </View>
        )}

        {/* Sin resultados — solo al terminar la búsqueda */}
        {!comparing && results && results.byStore.length === 0 && (
          <View style={styles.emptyResults}>
            <Ionicons name="alert-circle-outline" size={32} color={COLORS.onSurfaceVariant + '60'} />
            <Text style={styles.emptyResultsText}>{t('shopping.noResults')}</Text>
            <Text style={styles.emptyResultsSubtext}>{t('shopping.noResultsSub')}</Text>
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

  // Header
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.lg },
  headerIcon: { width: 44, height: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '700', color: COLORS.onSurface },
  headerSub: { fontSize: 13, color: COLORS.onSurfaceVariant, marginTop: 2 },

  // Input
  inputRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  input: {
    flex: 1,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    color: COLORS.onSurface,
    fontSize: 15,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  addBtn: {
    width: 50, height: 50,
    backgroundColor: COLORS.primaryContainer,
    borderRadius: RADIUS.lg,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtnDisabled: { opacity: 0.4 },

  // Chips de categoría (Shopping)
  categoryRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md, flexWrap: 'wrap' },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.full,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: COLORS.outlineVariant,
  },
  catChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catChipLabel: { fontSize: 12, fontWeight: '600', color: COLORS.onSurfaceVariant },
  catChipLabelActive: { color: COLORS.onPrimary },

  // Sugerencias (autocompletado)
  suggestBox: {
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    marginTop: -SPACING.xs,
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
  },
  suggestRowBorder: { borderTopWidth: 1, borderTopColor: COLORS.outlineVariant + '80' },
  suggestText: { flex: 1, color: COLORS.onSurface, fontSize: 14, textTransform: 'capitalize' },

  // Chips
  chipsContainer: { marginBottom: SPACING.md },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: SPACING.sm },
  itemChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.full,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: COLORS.outlineVariant,
    gap: 4,
    maxWidth: '60%',
  },
  itemChipText: { color: COLORS.onSurface, fontSize: 13, fontWeight: '500', flexShrink: 1 },
  itemQty: { color: COLORS.primary, fontSize: 12, fontWeight: '600', marginRight: 2 },
  clearBtn: { alignSelf: 'flex-end' },
  clearBtnText: { color: COLORS.onSurfaceVariant, fontSize: 12 },

  // Compare button
  compareBtn: { borderRadius: RADIUS.xl, overflow: 'hidden', marginBottom: SPACING.lg, ...SHADOWS.nebula },
  compareBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  compareBtnText: { color: COLORS.onPrimary, fontSize: 16, fontWeight: '700' },

  // Loading
  loadingCard: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  loadingText: { color: COLORS.onSurface, fontSize: 15, fontWeight: '600' },
  loadingSubtext: { color: COLORS.onSurfaceVariant, fontSize: 12 },

  // Barra de progreso (dentro de la tarjeta de carga)
  progressTrack: {
    width: '100%',
    height: 5, borderRadius: 3,
    backgroundColor: COLORS.outlineVariant,
    overflow: 'hidden',
    marginTop: SPACING.sm,
  },
  progressFill: { height: 5, borderRadius: 3, backgroundColor: COLORS.primary },

  // Optimal card
  optimalCard: { borderRadius: RADIUS.xl, overflow: 'hidden', marginBottom: SPACING.lg, ...SHADOWS.ambient },
  optimalGradient: { padding: SPACING.lg },
  optimalHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  optimalTitle: { color: COLORS.secondary, fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  optimalSubtext: { color: COLORS.onSurfaceVariant, fontSize: 12, marginBottom: SPACING.sm },
  optimalTotal: { fontSize: 36, fontWeight: '800', color: COLORS.onSurface, letterSpacing: -1 },
  savingsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm },
  savingsText: { color: COLORS.secondary, fontSize: 13 },

  // Section labels
  sectionLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.2,
    color: COLORS.onSurfaceVariant, marginBottom: SPACING.sm,
  },
  disclaimerBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: COLORS.tertiary + '14',
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
  },
  disclaimerText: {
    flex: 1, fontSize: 12, lineHeight: 17,
    color: COLORS.onSurfaceVariant,
  },

  // Item result
  itemResult: {
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  itemResultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  itemResultName: { fontSize: 15, fontWeight: '600', color: COLORS.onSurface, flex: 1 },
  itemResultPrice: { fontSize: 16, fontWeight: '700', color: COLORS.secondary },
  itemResultStore: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  itemResultProductName: { fontSize: 12, color: COLORS.onSurfaceVariant, flex: 1 },
  itemResultOtherStores: { flexDirection: 'row', gap: 12, marginTop: 6 },
  itemResultOtherStore: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  itemResultOtherPrice: { fontSize: 11, color: COLORS.onSurfaceVariant },
  itemResultUnit: { fontSize: 11, color: COLORS.secondary, fontWeight: '600' },

  // Store card
  storeCard: {
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  storeCardBest: {
    borderColor: COLORS.secondary + '60',
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  storeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  storeColorDot: { width: 12, height: 12, borderRadius: 6 },
  storeName: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface },
  storeFoundText: { fontSize: 11, color: COLORS.onSurfaceVariant, marginTop: 2 },
  storeTotal: { fontSize: 18, fontWeight: '800', color: COLORS.onSurface },
  bestBadge: {
    backgroundColor: COLORS.secondary + '25',
    borderRadius: RADIUS.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  bestBadgeText: { fontSize: 9, fontWeight: '700', color: COLORS.secondary, letterSpacing: 0.5 },
  partialBadge: {
    backgroundColor: COLORS.warning + '25',
    borderRadius: RADIUS.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  partialBadgeText: { fontSize: 9, fontWeight: '700', color: COLORS.warning, letterSpacing: 0.5 },
  storeItemsList: {
    marginTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
    paddingTop: SPACING.sm,
    gap: 8,
  },
  storeItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  storeItemName: { flex: 1, fontSize: 12, color: COLORS.onSurfaceVariant },
  storeItemPrice: { fontSize: 13, fontWeight: '600', color: COLORS.onSurface },
  storeItemUsd: { fontSize: 10, color: COLORS.onSurfaceVariant },
  storeItemUnit: { fontSize: 10, color: COLORS.secondary, fontWeight: '600' },

  // Empty
  emptyResults: { alignItems: 'center', padding: SPACING.xl, gap: SPACING.sm },
  emptyResultsText: { color: COLORS.onSurface, fontSize: 15, fontWeight: '600' },
  emptyResultsSubtext: { color: COLORS.onSurfaceVariant, fontSize: 13, textAlign: 'center' },
});
