import React, { useState, useCallback, useRef } from 'react';
import {
  View, ScrollView, StyleSheet, Pressable, Linking,
  KeyboardAvoidingView, Platform, LayoutAnimation, UIManager,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import api from '../api/client';
import { usePlan } from '../context/PlanContext';
import { useLanguage } from '../context/LanguageContext';
import { COMMON_PRODUCTS } from '../data/products';
import {
  Txt, Card, Input, Chip, ListItemChip, Badge, StoreDot, Button,
  Glow, EmptyState, ProgressBar, ScreenHeader, formatUYU, formatUnitPrice,
} from '../components/ui';
import { COLORS, SPACING, RADIUS, FONTS } from '../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const POLL_INTERVAL = 1500;

const CATEGORIES = [
  { id: null,           label: 'Todo',     icon: 'globe-outline' },
  { id: 'supermercado', label: 'Super',    icon: 'cart-outline' },
  { id: 'farmacia',     label: 'Farmacia', icon: 'medical-outline' },
  { id: 'belleza',      label: 'Belleza',  icon: 'sparkles-outline' },
  { id: 'ropa',         label: 'Ropa',     icon: 'shirt-outline' },
  { id: 'hogar',        label: 'Hogar',    icon: 'tv-outline' },
];

/**
 * Total de una tienda. `partial` no es cosmético: una tienda a la que le
 * faltan ítems tiene un total MENOR y eso no es un ahorro. La card lo dice con
 * su propia variante y con la aclaración adentro, no al pie en letra chica.
 */
function StoreCard({ store, totalItems, rank, mejorTotal }) {
  const { t } = useLanguage();
  const [abierto, setAbierto] = useState(false);
  const completa = store.found === totalItems;
  const esMejor = rank === 0 && completa;

  // Cuánto MÁS cuesta esta tienda que la mejor. Sólo tiene sentido entre
  // tiendas con la lista completa.
  const extra = completa && mejorTotal != null ? Math.round(store.total - mejorTotal) : 0;

  const alternar = () => {
    LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'opacity'));
    setAbierto((v) => !v);
  };

  return (
    <Card
      variant={esMejor ? 'best' : completa ? 'base' : 'partial'}
      onPress={alternar}
      style={styles.storeCard}
    >
      <View style={styles.storeHead}>
        <StoreDot storeId={store.storeId} size={10} style={{ marginTop: 5 }} />
        <View style={styles.storeInfo}>
          <View style={styles.storeTitleRow}>
            <Txt variant="h2" style={styles.storeName}>{store.name}</Txt>
            {esMejor ? <Badge variant="best" label={t('shopping.bestStore')} /> : null}
            {!completa ? (
              <Badge
                variant="statusMuted"
                icon="alert-circle"
                label={t('shopping.partialItems', { found: store.found, total: totalItems })}
              />
            ) : null}
          </View>
          <Txt variant="caption" color={completa ? COLORS.textMid : COLORS.warning} style={styles.storeSub}>
            {completa
              ? t(store.found === 1 ? 'shopping.foundItem' : 'shopping.foundItems', { n: store.found })
              : t('shopping.missing', { items: store.missing.join(', ') })}
          </Txt>
        </View>
        <View style={styles.storeTotalCol}>
          <Txt style={[styles.storeTotal, esMejor && { color: COLORS.income }]}>
            {formatUYU(store.total)}
          </Txt>
          {extra > 0 ? <Txt style={styles.storeExtra}>+{formatUYU(extra)}</Txt> : null}
          <Ionicons
            name={abierto ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={COLORS.textLow}
            style={{ marginTop: 4 }}
          />
        </View>
      </View>

      {/* La aclaración va DENTRO de la card de la tienda incompleta: si vive
          suelta al pie, se lee como nota general y no como "este número". */}
      {!completa ? (
        <Txt variant="caption" color={COLORS.warning} style={styles.storeAviso}>
          {store.name} sale menos porque le faltan {totalItems - store.found} ítems. No es un ahorro.
        </Txt>
      ) : null}

      {abierto ? (
        <View style={styles.storeItems}>
          {store.items.map((si, i) => (
            <View key={i} style={styles.storeItemRow}>
              <Txt variant="caption" color={COLORS.textHigh} style={styles.storeItemName} numberOfLines={2}>
                {si.productName}
              </Txt>
              <View style={styles.storeItemRight}>
                <View style={{ alignItems: 'flex-end' }}>
                  <Txt style={styles.storeItemPrice}>{formatUYU(si.price)}</Txt>
                  {si.currency === 'USD' && si.originalPrice != null ? (
                    <Txt style={styles.storeItemMeta}>US$ {si.originalPrice.toLocaleString('es-UY')}</Txt>
                  ) : null}
                  {si.unitPrice != null ? (
                    <Txt style={styles.storeItemMeta}>{formatUnitPrice(si)}</Txt>
                  ) : null}
                </View>
                {si.url ? (
                  <Pressable onPress={() => Linking.openURL(si.url)} hitSlop={8} style={{ marginLeft: 8 }}>
                    <Ionicons name="open-outline" size={14} color={COLORS.textMid} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

/** Mejor precio de un ítem, con las otras dos opciones debajo. */
function ItemResult({ result }) {
  if (!result.cheapest) return null;
  const c = result.cheapest;

  return (
    <Card style={styles.itemResult}>
      <View style={styles.itemHead}>
        <Txt variant="h2" style={styles.itemName} numberOfLines={1}>{result.item}</Txt>
        <Txt style={styles.itemPrice}>{formatUYU(c.price)}</Txt>
      </View>

      <View style={styles.itemMetaRow}>
        <StoreDot storeId={c.storeId} size={8} style={{ marginRight: 6 }} />
        <Txt variant="caption" color={COLORS.textMid} style={styles.itemMeta}>{c.store}</Txt>
        <Txt variant="caption" color={COLORS.textLow} style={styles.itemMeta} numberOfLines={1}>
          {' · '}{c.name}
        </Txt>
      </View>
      {c.unitPrice != null ? (
        <Txt variant="caption" color={COLORS.textLow} style={styles.itemUnit}>{formatUnitPrice(c)}</Txt>
      ) : null}

      {result.options.length > 1 ? (
        <View style={styles.otras}>
          {result.options.slice(1, 3).map((opt, i) => {
            // El delta sólo se muestra si el envase es equivalente: comparar un
            // 5 kg contra un 1 kg como si fuera "más caro" es exactamente la
            // trampa que el precio por unidad existe para evitar.
            const comparable = opt.unitLabel && opt.unitLabel === c.unitLabel;
            const dif = Math.round(opt.price - c.price);
            return (
              <View key={i} style={styles.otraRow}>
                <StoreDot storeId={opt.storeId} size={6} style={{ marginRight: 6 }} />
                <Txt variant="caption" color={COLORS.textLow} style={styles.otraTxt}>
                  {opt.store} {formatUYU(opt.price)}
                  {comparable && dif > 0 ? ` (+${formatUYU(dif)})` : ''}
                </Txt>
              </View>
            );
          })}
        </View>
      ) : null}
    </Card>
  );
}

export default function ShoppingScreen() {
  const { t } = useLanguage();
  const { canShopping, showUpgrade } = usePlan();

  const [items, setItems] = useState([]);
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [results, setResults] = useState(null);
  const [insight, setInsight] = useState(null);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [progress, setProgress] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [category, setCategory] = useState(null);

  const loadingInterval = useRef(null);
  const pollRef = useRef(null);      // jobId activo; sirve para cancelar el polling
  const suggestTimer = useRef(null); // debounce de sugerencias en vivo
  const suggestSeq = useRef(0);      // descarta respuestas viejas

  const loadingMsgs = [
    t('shopping.loadingMsg1'), t('shopping.loadingMsg2'), t('shopping.loadingMsg3'),
    t('shopping.loadingMsg4'), t('shopping.loadingMsg5'),
  ];

  const loadItems = useCallback(async () => {
    try {
      const { data } = await api.get('/shopping');
      setItems(data.items);
    } catch (_) {}
  }, []);

  // Detiene el polling Y le avisa al backend que deje de scrapear.
  const cancelActiveJob = useCallback(() => {
    const jobId = pollRef.current;
    pollRef.current = null;
    if (jobId) api.post(`/shopping/compare/${jobId}/cancel`).catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => {
    loadItems();
    setResults(null);
    return () => { cancelActiveJob(); };
  }, [loadItems, cancelActiveJob]));

  // ─── Autocompletado: lista local al instante + tienda con debounce ──
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const localSuggestions = (q) => {
    const nq = norm(q);
    const matches = COMMON_PRODUCTS.filter((p) => norm(p).includes(nq));
    matches.sort((a, b) =>
      norm(a).startsWith(nq) === norm(b).startsWith(nq) ? 0 : norm(a).startsWith(nq) ? -1 : 1);
    return matches.slice(0, 6);
  };

  const mergeSuggestions = (local, live) => {
    const seen = new Set(local.map(norm));
    return [...local, ...live.filter((s) => !seen.has(norm(s)))].slice(0, 8);
  };

  const onChangeInput = (text) => {
    setInput(text);
    const q = text.trim();
    if (q.length < 2) { setSuggestions([]); return; }

    const local = localSuggestions(q);
    setSuggestions(local);

    clearTimeout(suggestTimer.current);
    const seq = ++suggestSeq.current;
    suggestTimer.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/shopping/suggest', { params: { q } });
        if (seq !== suggestSeq.current) return;  // llegó una respuesta vieja
        setSuggestions(mergeSuggestions(local, data.suggestions || []));
      } catch (_) {}
    }, 300);
  };

  const addItem = async (nameArg) => {
    const name = (typeof nameArg === 'string' ? nameArg : input).trim();
    if (!name) return;
    setSuggestions([]);
    suggestSeq.current++;   // invalida sugerencias en vuelo
    setAdding(true);
    try {
      const { data } = await api.post('/shopping/items', { name });
      setItems((prev) => [...prev, data.item]);
      setInput('');
      setResults(null);
    } catch (_) {
      Toast.show({ type: 'error', text1: t('shopping.errorAdd') });
    } finally {
      setAdding(false);
    }
  };

  const deleteItem = async (id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setResults(null);
    try { await api.delete(`/shopping/items/${id}`); } catch (_) {}
  };

  const compare = async () => {
    if (!canShopping) { showUpgrade('shopping'); return; }
    if (items.length === 0) {
      Toast.show({ type: 'error', text1: t('shopping.errorEmpty') });
      return;
    }
    cancelActiveJob();   // por si quedó una comparación anterior corriendo
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
      const { data: start } = await api.post('/shopping/compare/start', { category: category || undefined });
      const jobId = start.jobId;
      pollRef.current = jobId;

      // Se tolera fallo transitorio (red, reinicio del backend): no se aborta
      // al primer error, sólo tras MAX_FAILS polls fallidos consecutivos.
      const MAX_FAILS = 5;
      let fails = 0;

      while (pollRef.current === jobId) {
        await sleep(POLL_INTERVAL);
        if (pollRef.current !== jobId) return;   // cancelado

        try {
          const resp = await api.get(`/shopping/compare/status/${jobId}`, {
            validateStatus: (s) => (s >= 200 && s < 300) || s === 304,
          });
          fails = 0;
          if (resp.status === 304) continue;     // sin cambios desde el último poll

          const status = resp.data;
          setProgress({ completed: status.completed, total: status.total });
          setResults(status);                    // parciales → la UI se va poblando

          if (status.status === 'done' || status.status === 'error' || status.status === 'cancelled') break;
        } catch (pollErr) {
          fails++;
          console.warn(`[compare] poll falló (${fails}/${MAX_FAILS}):`, pollErr.message);
          if (fails >= MAX_FAILS) throw pollErr;
        }
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: t('shopping.errorCompare'), text2: err.message });
    } finally {
      clearInterval(loadingInterval.current);
      pollRef.current = null;
      setComparing(false);
      // El cruce con el gasto bancario se pide DESPUÉS y aparte: vuelve a
      // scrapear del lado del servidor y no debe demorar la pantalla. Si falla,
      // la comparación se muestra igual sin la tarjeta.
      api.get('/shopping/insight')
        .then(({ data }) => setInsight(data))
        .catch(() => setInsight(null));
    }
  };

  const clearList = async () => {
    cancelActiveJob();
    for (const item of items) {
      try { await api.delete(`/shopping/items/${item.id}`); } catch (_) {}
    }
    setItems([]);
    setResults(null);
  };

  // Referencia para el "+$X" de cada tienda: la más barata que tenga TODA la
  // lista. Si ninguna la tiene queda undefined y el delta no se muestra, en vez
  // de compararse contra una base incompleta que lo haría mentir.
  const mejorTotalCompleto = results
    ? (results.byStore.find((s) => s.found === results.totalItems) || {}).total
    : undefined;

  const op = insight && insight.oportunidad;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Glow />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          title={t('shopping.title')}
          subtitle={items.length
            ? `${items.length} ítem${items.length === 1 ? '' : 's'} · ${t('shopping.subtitle')}`
            : t('shopping.subtitle')}
        />

        <Input
          value={input}
          onChangeText={onChangeInput}
          placeholder={t('shopping.addPlaceholder')}
          icon="add-circle-outline"
          onSubmitEditing={() => addItem()}
          returnKeyType="done"
          suggestions={suggestions}
          onSelectSuggestion={(s) => addItem(s)}
          style={styles.bloque}
        />

        {items.length > 0 ? (
          <Card style={styles.bloque}>
            <View style={styles.chipsRow}>
              {items.map((item) => (
                <ListItemChip
                  key={item.id}
                  label={item.name}
                  qty={item.quantity || 1}
                  onRemove={() => deleteItem(item.id)}
                />
              ))}
            </View>

            {!comparing ? (
              <>
                <View style={styles.catRow}>
                  {CATEGORIES.map((cat) => (
                    <Chip
                      key={String(cat.id)}
                      label={cat.label}
                      icon={cat.icon}
                      active={category === cat.id}
                      onPress={() => setCategory(cat.id)}
                    />
                  ))}
                </View>

                <Button
                  label={canShopping
                    ? `${t('shopping.compare')} · ${items.length} ítem${items.length === 1 ? '' : 's'}`
                    : t('premium.lockedShopping')}
                  icon={canShopping ? 'search' : 'lock-closed'}
                  variant={canShopping ? 'primary' : 'premiumLocked'}
                  onPress={compare}
                  fullWidth
                  style={{ marginTop: SPACING.m }}
                />
                <Button
                  label={t('shopping.clearList')}
                  variant="ghost"
                  size="sm"
                  onPress={clearList}
                  style={{ alignSelf: 'center', marginTop: SPACING.s }}
                />
              </>
            ) : null}
          </Card>
        ) : null}

        {/* El scrape tarda 5-12s: se muestra el paso y el progreso real, no un
            spinner que se lee como "se colgó". */}
        {comparing ? (
          <Card variant="raised" style={styles.bloque}>
            <Txt variant="h2" style={{ marginBottom: 4 }}>{loadingMsg}</Txt>
            <Txt variant="caption" color={COLORS.textMid} style={{ marginBottom: 14 }}>
              {progress
                ? t('shopping.progress', { completed: progress.completed, total: progress.total })
                : t('shopping.loadingWait')}
            </Txt>
            {progress ? <ProgressBar value={progress.completed} max={progress.total} /> : null}
          </Card>
        ) : null}

        {results && results.byStore.length > 0 ? (
          <>
            {/* Carrito óptimo. */}
            <Card variant="best" label={t('shopping.optimalCart')} style={styles.bloque}>
              <Txt variant="caption" color={COLORS.textMid}>{t('shopping.optimalSub')}</Txt>
              <Txt style={styles.optimalTotal}>{formatUYU(results.optimalTotal)}</Txt>

              <View style={styles.optimalMeta}>
                <Txt variant="caption" color={COLORS.textMid}>
                  {results.results.filter((r) => r.cheapest).length} de {results.totalItems} ítems
                </Txt>
                {/* Un total que exige ir a cuatro lugares es aspiracional; el
                    usuario decide con este dato. */}
                {results.storesNeeded > 0 ? (
                  <Txt variant="caption" color={COLORS.textMid}>
                    {' · '}{results.storesNeeded === 1
                      ? t('shopping.storesNeeded_one')
                      : t('shopping.storesNeeded_other', { n: results.storesNeeded })}
                  </Txt>
                ) : null}
              </View>

              {/* `itemSavings` reemplaza a `optimalSavings`, que sólo existía si
                  alguna tienda tenía la lista completa — y con listas largas eso
                  casi nunca pasa, así que el ahorro desaparecía sin explicación. */}
              {(results.itemSavings > 0 || results.optimalSavings > 0) ? (
                <View style={styles.ahorroRow}>
                  <Ionicons name="trending-down" size={15} color={COLORS.income} />
                  <Txt variant="caption" color={COLORS.income} style={styles.ahorroTxt}>
                    {t('shopping.savings', {
                      amount: (results.itemSavings || results.optimalSavings)
                        .toLocaleString('es-UY', { maximumFractionDigits: 0 }),
                    })}
                  </Txt>
                </View>
              ) : null}
            </Card>

            {/* Cruce con el banco: lo único que un comparador puro no puede
                mostrar, porque necesita el resumen bancario. */}
            {insight && insight.perfil ? (
              <Card variant="raised" style={styles.bloque}>
                <View style={styles.insightHead}>
                  <Ionicons name="wallet-outline" size={16} color={COLORS.accent} />
                  <Txt variant="overline" color={COLORS.accent} style={styles.insightTitle}>
                    {t('shopping.insightTitle')}
                  </Txt>
                  <View style={{ flex: 1 }} />
                  <Badge variant="estimate" label="Estimación" />
                </View>

                <Txt variant="body" style={{ marginBottom: 4 }}>
                  {t('shopping.insightSpend', {
                    amount: insight.perfil.promedioMensual.toLocaleString('es-UY'),
                  })}
                </Txt>

                {insight.perfil.habitual ? (
                  <View style={styles.insightRow}>
                    <StoreDot storeId={insight.perfil.habitual.storeId} size={8} style={{ marginRight: 7 }} />
                    <Txt variant="caption" color={COLORS.textMid}>
                      {t('shopping.insightHabitual', { store: insight.perfil.habitual.store })}
                    </Txt>
                  </View>
                ) : null}

                {op && !op.yaCompraEnLaMejor ? (
                  <View style={styles.insightBox}>
                    <Ionicons name="trending-down" size={15} color={COLORS.income} />
                    <View style={{ flex: 1, marginLeft: SPACING.s }}>
                      <Txt variant="caption" color={COLORS.income} style={styles.insightSaving}>
                        {t('shopping.insightSaving', {
                          store: op.mejor.store,
                          amount: op.ahorroMensual.toLocaleString('es-UY'),
                        })}
                      </Txt>
                      <Txt variant="caption" color={COLORS.textLow} style={{ marginTop: 3 }}>
                        {t('shopping.insightSavingList', {
                          amount: op.ahorroLista.toLocaleString('es-UY'),
                          pct: op.ahorroPct,
                        })}
                        {' · '}{t('shopping.insightEstimate')}
                      </Txt>
                    </View>
                  </View>
                ) : null}

                {op && op.yaCompraEnLaMejor ? (
                  <View style={styles.insightBox}>
                    <Ionicons name="checkmark-circle-outline" size={15} color={COLORS.income} />
                    <Txt variant="caption" color={COLORS.income} style={{ marginLeft: SPACING.s, flex: 1 }}>
                      {t('shopping.insightBest')}
                    </Txt>
                  </View>
                ) : null}

                {insight.estado === 'sin_lista' ? (
                  <Txt variant="caption" color={COLORS.textLow}>{t('shopping.insightNoList')}</Txt>
                ) : null}
              </Card>
            ) : null}

            {/* En Hogar la variedad de modelos hace que el "más barato por
                tienda" no siempre sea el mismo producto. */}
            {category === 'hogar' ? (
              <Card variant="partial" label="Ojo" style={styles.bloque}>
                <Txt variant="caption" color={COLORS.textMid}>{t('shopping.hogarDisclaimer')}</Txt>
              </Card>
            ) : null}

            <Txt variant="overline" color={COLORS.textLow} style={styles.seccion}>
              {t('shopping.bestPrice')}
            </Txt>
            {results.results.map((r) => <ItemResult key={r.itemId} result={r} />)}

            <Txt variant="overline" color={COLORS.textLow} style={styles.seccion}>
              {t('shopping.storesRanked')}
            </Txt>
            {/* Los totales sólo se comparan entre tiendas con la lista completa
                Y envases parecidos: buscando "arroz" una puede aportar un 5 kg y
                otra un 1 kg, y el total más bajo sería el de la que vende menos. */}
            {results.byStore.length > 1 && results.comparableStores < results.byStore.length ? (
              <Card variant="partial" label="Ojo" style={styles.bloque}>
                <Txt variant="caption" color={COLORS.textMid}>{t('shopping.notComparable')}</Txt>
              </Card>
            ) : null}
            {results.byStore.map((store, i) => (
              <StoreCard
                key={store.storeId}
                store={store}
                totalItems={results.totalItems}
                rank={i}
                mejorTotal={mejorTotalCompleto}
              />
            ))}
          </>
        ) : null}

        {!comparing && results && results.byStore.length === 0 ? (
          <EmptyState
            icon="alert-circle-outline"
            title={t('shopping.noResults')}
            text={t('shopping.noResultsSub')}
            style={styles.bloque}
          />
        ) : null}

        {items.length === 0 && !comparing ? (
          <EmptyState
            icon="cart-outline"
            title="Tu lista está vacía"
            text="Agregá lo que vas a comprar y te decimos en qué cadena sale más barato."
            style={styles.bloque}
          />
        ) : null}

        {/* Aire para la tab bar flotante. */}
        <View style={{ height: 110 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: SPACING.m, paddingTop: 60 },
  bloque: { marginTop: SPACING.m },
  seccion: { marginTop: SPACING.l, marginBottom: SPACING.s },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.s },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.s, marginTop: SPACING.m },

  optimalTotal: { fontFamily: FONTS.amountBold, fontSize: 32, lineHeight: 38, color: COLORS.textHigh, marginTop: 2 },
  optimalMeta: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 },
  ahorroRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.s },
  ahorroTxt: { marginLeft: 6, flex: 1 },

  insightHead: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.s },
  insightTitle: { marginLeft: 7 },
  insightRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.s },
  insightBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: COLORS.successSoft,
    borderRadius: RADIUS.m, padding: 12, marginTop: 4,
  },
  insightSaving: { fontFamily: FONTS.semibold },

  itemResult: { marginTop: SPACING.s },
  itemHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemName: { flex: 1, marginRight: SPACING.s },
  itemPrice: { fontFamily: FONTS.amountBold, fontSize: 16, lineHeight: 19, color: COLORS.income },
  itemMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  itemMeta: { fontFamily: FONTS.medium, fontSize: 12.5, flexShrink: 1 },
  itemUnit: { marginTop: 3, fontSize: 12 },
  otras: { marginTop: SPACING.s, borderTopWidth: 1, borderTopColor: COLORS.borderSubtle, paddingTop: SPACING.s },
  otraRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  otraTxt: { fontSize: 12 },

  storeCard: { marginTop: SPACING.s },
  storeHead: { flexDirection: 'row', alignItems: 'flex-start' },
  storeInfo: { flex: 1, minWidth: 0, marginLeft: SPACING.s },
  storeTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  storeName: { fontSize: 16 },
  storeSub: { marginTop: 3 },
  storeTotalCol: { alignItems: 'flex-end', marginLeft: SPACING.s },
  storeTotal: { fontFamily: FONTS.amountBold, fontSize: 17, lineHeight: 20, color: COLORS.textHigh },
  storeExtra: { fontFamily: FONTS.semibold, fontSize: 12, lineHeight: 16, color: COLORS.expense },
  storeAviso: { marginTop: SPACING.s },
  storeItems: { marginTop: SPACING.s, borderTopWidth: 1, borderTopColor: COLORS.borderSubtle, paddingTop: 4 },
  storeItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  storeItemName: { flex: 1, marginRight: SPACING.s, fontFamily: FONTS.medium },
  storeItemRight: { flexDirection: 'row', alignItems: 'center' },
  storeItemPrice: { fontFamily: FONTS.amount, fontSize: 13, lineHeight: 16, color: COLORS.textHigh },
  storeItemMeta: { fontFamily: FONTS.amount, fontSize: 11, lineHeight: 14, color: COLORS.textLow },
});
