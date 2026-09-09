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

// Cuántos ítems se listan antes de colapsar el resto en "+N más".
const CHIPS_VISIBLES = 6;

const CATEGORIES = [
  { id: null,           label: 'Todo',     icon: 'globe-outline' },
  { id: 'supermercado', label: 'Super',    icon: 'cart-outline' },
  { id: 'farmacia',     label: 'Farmacia', icon: 'medical-outline' },
  { id: 'belleza',      label: 'Belleza',  icon: 'sparkles-outline' },
  { id: 'ropa',         label: 'Ropa',     icon: 'shirt-outline' },
  { id: 'hogar',        label: 'Hogar',    icon: 'tv-outline' },
];

/**
 * Totales por tienda, en UNA card. El diseño las lista como filas compactas y
 * no como una card por cadena: con seis tiendas, seis cards ocupaban toda la
 * pantalla y la comparación —que es el punto— quedaba repartida en scroll.
 *
 * La fila se expande al tocarla para ver el desglose, que es lo que se perdería
 * al compactar.
 */
function StoresCard({ byStore, totalItems, mejorTotal, aviso }) {
  const { t } = useLanguage();
  const [abierta, setAbierta] = useState(null);

  // Una tienda incompleta tiene un total MENOR y eso no es un ahorro. Se dice
  // acá, dentro de la misma card, no al pie en letra chica.
  const incompleta = byStore.find((s) => s.found !== totalItems);

  return (
    <Card style={styles.storesCard}>
      {byStore.map((store, i) => {
        const completa = store.found === totalItems;
        const esMejor = i === 0 && completa;
        const extra = completa && mejorTotal != null ? Math.round(store.total - mejorTotal) : 0;
        const open = abierta === store.storeId;

        return (
          <View key={store.storeId}>
            <Pressable
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'opacity'));
                setAbierta(open ? null : store.storeId);
              }}
              style={({ pressed }) => [
                styles.storeRow,
                i > 0 && styles.storeRowBorde,
                pressed && { opacity: 0.7 },
              ]}
            >
              <StoreDot storeId={store.storeId} size={8} />
              <Txt style={styles.storeNombre} numberOfLines={1}>{store.name}</Txt>
              <Txt
                style={[
                  styles.storeEstado,
                  { color: completa ? COLORS.success : COLORS.warning },
                ]}
              >
                {completa
                  ? `${store.found}/${totalItems}`
                  : t('shopping.partialItems', { found: store.found, total: totalItems })}
              </Txt>
              <Txt
                style={[
                  styles.storeTotal,
                  { color: esMejor ? COLORS.income : completa ? COLORS.textHigh : COLORS.textMid },
                ]}
              >
                {formatUYU(store.total)}
              </Txt>
            </Pressable>

            {extra > 0 && !open ? (
              <Txt style={styles.storeExtra}>+{formatUYU(extra)} que la más barata</Txt>
            ) : null}

            {open ? (
              <View style={styles.storeItems}>
                {store.items.map((si, k) => (
                  <View key={k} style={styles.storeItemRow}>
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
                {!completa ? (
                  <Txt variant="caption" color={COLORS.warning} style={{ marginTop: 6 }}>
                    {t('shopping.missing', { items: store.missing.join(', ') })}
                  </Txt>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}

      {incompleta ? (
        <View style={styles.storeAviso}>
          <Ionicons name="alert-circle" size={15} color={COLORS.warning} />
          <Txt variant="caption" color={COLORS.warning} style={styles.storeAvisoTxt}>
            {incompleta.name} sale menos porque le
            {totalItems - incompleta.found === 1
              ? ' falta 1 ítem'
              : ` faltan ${totalItems - incompleta.found} ítems`}. No es un ahorro.
          </Txt>
        </View>
      ) : null}

      {/* Los totales sólo se comparan entre tiendas con la lista completa Y
          envases parecidos: buscando "arroz" una puede aportar un 5 kg y otra un
          1 kg, y el total más bajo sería el de la que vende menos producto. */}
      {aviso ? (
        <View style={styles.storeAviso}>
          <Ionicons name="information-circle-outline" size={15} color={COLORS.textLow} />
          <Txt variant="caption" color={COLORS.textLow} style={styles.storeAvisoTxt}>{aviso}</Txt>
        </View>
      ) : null}
    </Card>
  );
}

/**
 * Mejor precio por producto, en UNA card y una fila por ítem.
 *
 * Antes cada producto era una card de cuatro o cinco líneas —nombre, precio,
 * tienda, nombre real del producto, precio por unidad y dos alternativas— y con
 * una lista de ocho eso son más de mil píxeles de scroll para responder una
 * pregunta que cabe en un renglón: cuánto sale y dónde.
 *
 * El detalle no se pierde, se pide: la fila se abre y ahí aparecen el producto
 * que la tienda realmente ofrece, el precio por unidad y las otras opciones.
 */
function ItemsCard({ results }) {
  const [abierto, setAbierto] = useState(null);
  const conPrecio = results.filter((r) => r.cheapest);
  if (conPrecio.length === 0) return null;

  return (
    <Card style={styles.itemsCard}>
      {conPrecio.map((r, i) => {
        const c = r.cheapest;
        const open = abierto === r.itemId;

        return (
          <View key={r.itemId}>
            <Pressable
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'opacity'));
                setAbierto(open ? null : r.itemId);
              }}
              style={({ pressed }) => [
                styles.itemRow,
                i > 0 && styles.itemRowBorde,
                pressed && { opacity: 0.7 },
              ]}
            >
              <StoreDot storeId={c.storeId} size={8} />
              <View style={styles.itemRowInfo}>
                <Txt style={styles.itemRowNombre} numberOfLines={1}>{r.item}</Txt>
                <Txt variant="caption" color={COLORS.textLow} numberOfLines={1}>{c.store}</Txt>
              </View>
              <Txt style={styles.itemRowPrecio}>{formatUYU(c.price)}</Txt>
              <Ionicons
                name={open ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={COLORS.textLow}
                style={{ marginLeft: 6 }}
              />
            </Pressable>

            {open ? (
              <View style={styles.itemDetalle}>
                <Txt variant="caption" color={COLORS.textMid} style={{ marginBottom: 3 }}>
                  {c.name}
                </Txt>
                {c.unitPrice != null ? (
                  <Txt variant="caption" color={COLORS.textLow}>{formatUnitPrice(c)}</Txt>
                ) : null}
                {c.currency === 'USD' && c.originalPrice != null ? (
                  <Txt variant="caption" color={COLORS.textLow}>
                    US$ {c.originalPrice.toLocaleString('es-UY')}
                  </Txt>
                ) : null}

                {r.options.length > 1 ? (
                  <View style={styles.otras}>
                    {r.options.slice(1, 4).map((opt, k) => {
                      // El delta sólo se muestra si el envase es equivalente:
                      // comparar un 5 kg contra un 1 kg como si fuera "más caro"
                      // es la trampa que el precio por unidad existe para evitar.
                      const comparable = opt.unitLabel && opt.unitLabel === c.unitLabel;
                      const dif = Math.round(opt.price - c.price);
                      return (
                        <View key={k} style={styles.otraRow}>
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
              </View>
            ) : null}
          </View>
        );
      })}
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
  const [chipsAbiertos, setChipsAbiertos] = useState(false);

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

  // Alternativa de UNA sola tienda. El carrito óptimo puede pedir recorrer
  // cuatro locales para ahorrar $159, y nadie hace eso: al lado de la cifra
  // teórica va la que se resuelve en un viaje.
  //
  // Sólo aparece cuando AMBOS lados están completos. Comparar un carrito de 8
  // ítems contra una tienda que tiene 7 haría ver barata a la que vende menos
  // — el mismo error que la card `partial` existe para evitar — así que si el
  // óptimo no cubre la lista entera, o ninguna tienda la tiene, no se dice nada.
  const unaTienda = (() => {
    if (!results || !(results.storesNeeded > 1)) return null;
    const cubiertos = results.results.filter((r) => r.cheapest).length;
    if (cubiertos !== results.totalItems) return null;
    const completas = results.byStore.filter((st) => st.found === results.totalItems);
    // Ninguna cadena tiene la lista entera. Eso EXPLICA el "recorriendo N
    // tiendas" de arriba, así que se dice en vez de callar: el número deja de
    // parecer un capricho del cálculo.
    if (completas.length === 0) return { ninguna: true };
    const mejor = completas.reduce((a, b) => (a.total <= b.total ? a : b));
    // OJO: el diferencial puede dar NEGATIVO. El carrito óptimo se arma por
    // mejor valor POR UNIDAD, no por precio absoluto, así que una sola tienda
    // puede terminar costando menos. Cuando pasa hay que decirlo — esa tienda
    // es mejor en las dos dimensiones y esconderlo sería vender lo contrario.
    return { ...mejor, extra: Math.round(mejor.total - results.optimalTotal) };
  })();

  // Reparto del carrito óptimo por cadena, ordenado por cantidad de ítems.
  const reparto = (() => {
    if (!results) return [];
    const cuenta = {};
    results.results.forEach((r) => {
      if (!r.cheapest) return;
      const k = r.cheapest.storeId;
      if (!cuenta[k]) cuenta[k] = { storeId: k, store: r.cheapest.store, n: 0 };
      cuenta[k].n += 1;
    });
    return Object.values(cuenta).sort((a, b) => b.n - a.n);
  })();

  const op = insight && insight.oportunidad;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Glow size={280} opacity={0.16} top={-70} right={-60} />
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
          card={false}
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
              {(chipsAbiertos ? items : items.slice(0, CHIPS_VISIBLES)).map((item) => (
                <ListItemChip
                  key={item.id}
                  label={item.name}
                  qty={item.quantity || 1}
                  onRemove={() => deleteItem(item.id)}
                />
              ))}
              {items.length > CHIPS_VISIBLES ? (
                <Pressable
                  onPress={() => setChipsAbiertos((v) => !v)}
                  style={({ pressed }) => [styles.masChip, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons
                    name={chipsAbiertos ? 'remove' : 'add'}
                    size={13}
                    color={COLORS.textLow}
                  />
                  <Txt variant="caption" color={COLORS.textLow} style={styles.masChipTxt}>
                    {chipsAbiertos ? 'ver menos' : `${items.length - CHIPS_VISIBLES} más`}
                  </Txt>
                </Pressable>
              ) : null}
            </View>

            {!comparing ? (
              <>
                {/* Una fila con scroll en vez de dos fijas: seis filtros
                    apilados comían el alto que necesita el botón de comparar. */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.catRow}
                  style={styles.catScroll}
                >
                  {CATEGORIES.map((cat) => (
                    <Chip
                      key={String(cat.id)}
                      label={cat.label}
                      icon={cat.icon}
                      active={category === cat.id}
                      onPress={() => setCategory(cat.id)}
                    />
                  ))}
                </ScrollView>

                <Button
                  label={canShopping
                    ? `${t('shopping.compare')} · ${items.length} ítem${items.length === 1 ? '' : 's'}`
                    : t('premium.lockedShopping')}
                  icon={canShopping ? 'git-compare-outline' : 'lock-closed'}
                  variant={canShopping ? 'action' : 'premiumLocked'}
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
            {/* Carrito óptimo. El ahorro va a la derecha del total y no
                debajo: son las dos cifras que se comparan y leerlas en la misma
                línea es lo que hace la card. */}
            <Card variant="best" label={t('shopping.optimalCart')} style={styles.bloque}>
              {/* La frase larga es el subtítulo de la card, no el pie de una
                  cifra: puesta a la derecha del total le comía el ancho a la
                  columna del monto y "$1.169" se partía en dos renglones. */}
              <Txt variant="caption" color={COLORS.textMid} style={{ marginBottom: 6 }}>
                {t('shopping.optimalSub')}
              </Txt>

              <View style={styles.optimalRow}>
                <View style={styles.optimalIzq}>
                  <Txt style={styles.optimalTotal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                    {formatUYU(results.optimalTotal)}
                  </Txt>
                  <Txt variant="caption" color={COLORS.textMid} style={{ marginTop: 4 }} numberOfLines={2}>
                    {results.results.filter((r) => r.cheapest).length} de {results.totalItems} ítems
                    {/* Un total que exige ir a cuatro lugares es aspiracional; el
                        usuario decide con este dato. */}
                    {results.storesNeeded > 0
                      ? `, ${results.storesNeeded === 1
                          ? t('shopping.storesNeeded_one')
                          : t('shopping.storesNeeded_other', { n: results.storesNeeded })}`
                      : ''}
                  </Txt>
                </View>

                {/* `itemSavings` reemplaza a `optimalSavings`, que sólo existía
                    si alguna tienda tenía la lista completa — y con listas
                    largas eso casi nunca pasa, así que el ahorro desaparecía
                    sin explicación. */}
                {(results.itemSavings > 0 || results.optimalSavings > 0) ? (
                  <View style={styles.optimalAhorro}>
                    <Txt style={styles.ahorroMonto} numberOfLines={1}>
                      −{formatUYU(results.itemSavings || results.optimalSavings)}
                    </Txt>
                    <Txt variant="caption" color={COLORS.textLow} style={{ marginTop: 4 }} numberOfLines={1}>
                      {t('shopping.optimalSavingsLabel')}
                    </Txt>
                  </View>
                ) : null}
              </View>

              {/* Reparto: qué cadenas hay que recorrer y cuántos ítems en cada
                  una. Los puntos se superponen para leerse como un grupo. */}
              {reparto.length > 0 ? (
                <View style={styles.reparto}>
                  <View style={styles.repartoDots}>
                    {reparto.map((r, i) => (
                      <StoreDot
                        key={r.storeId}
                        storeId={r.storeId}
                        size={8}
                        style={i > 0 ? { marginLeft: -4 } : null}
                      />
                    ))}
                  </View>
                  <Txt variant="caption" color={COLORS.textMid} style={styles.repartoTxt} numberOfLines={1}>
                    {reparto.slice(0, 3).map((r) => `${r.n} en ${r.store}`).join(' · ')}
                    {reparto.length > 3 ? ` · y ${reparto.length - 3} más` : ''}
                  </Txt>
                </View>
              ) : null}

              {unaTienda && unaTienda.ninguna ? (
                <View style={[styles.reparto, { marginTop: 6 }]}>
                  <Ionicons name="information-circle-outline" size={14} color={COLORS.textLow} />
                  <Txt variant="caption" color={COLORS.textLow} style={styles.repartoUno} numberOfLines={2}>
                    Ninguna cadena tiene la lista completa; por eso hay que recorrer varias.
                  </Txt>
                </View>
              ) : unaTienda ? (
                <View style={[styles.reparto, { marginTop: 6 }]}>
                  <StoreDot storeId={unaTienda.storeId} size={8} style={{ marginRight: SPACING.s }} />
                  <Txt variant="caption" color={COLORS.textMid} style={styles.repartoTxt} numberOfLines={1}>
                    {unaTienda.extra < 0 ? 'Más barato aún: todo en ' : 'O todo en '}
                    {unaTienda.name} por {formatUYU(unaTienda.total)}
                  </Txt>
                  {unaTienda.extra !== 0 ? (
                    <Txt style={[
                      styles.unaTiendaExtra,
                      unaTienda.extra < 0 && { color: COLORS.income },
                    ]}>
                      {unaTienda.extra > 0 ? '+' : '−'}{formatUYU(Math.abs(unaTienda.extra))}
                    </Txt>
                  ) : null}
                </View>
              ) : null}
            </Card>

            {/* Cruce con el banco: lo único que un comparador puro no puede
                mostrar, porque necesita el resumen bancario. */}
            {insight && insight.perfil ? (
              <Card variant="raised" style={styles.insightCard}>
                <View style={styles.insightHead}>
                  <Ionicons name="analytics-outline" size={17} color={COLORS.accent} />
                  <Txt variant="overline" color={COLORS.accent} style={styles.insightTitle}>
                    {t('shopping.insightTitle')}
                  </Txt>
                  <View style={{ flex: 1 }} />
                  {/* El badge es componente y no letra chica: es lo que sostiene
                      que la proyección mensual es una estimación. */}
                  <Badge variant="estimate" label="Estimación" />
                </View>

                {/* Una frase, con los valores resaltados en línea: el dato es la
                    oración entera, no tres métricas sueltas. */}
                <Txt variant="body" style={styles.insightFrase}>
                  {t('shopping.insightSpend', {
                    amount: insight.perfil.promedioMensual.toLocaleString('es-UY'),
                  })}
                  {insight.perfil.habitual
                    ? ` ${t('shopping.insightHabitual', { store: insight.perfil.habitual.store })}`
                    : ''}
                </Txt>

                {op && !op.yaCompraEnLaMejor ? (
                  <>
                    <Txt variant="body" style={styles.insightFrase}>
                      {t('shopping.insightSaving', {
                        store: op.mejor.store,
                        amount: op.ahorroMensual.toLocaleString('es-UY'),
                      })}
                    </Txt>
                    <View style={styles.insightCajas}>
                      <View style={styles.insightCaja}>
                        <Txt variant="caption" color={COLORS.textLow}>Al mes</Txt>
                        <Txt style={styles.insightMonto}>−{formatUYU(op.ahorroMensual)}</Txt>
                      </View>
                      <View style={styles.insightCaja}>
                        <Txt variant="caption" color={COLORS.textLow}>Al año</Txt>
                        <Txt style={styles.insightMonto}>−{formatUYU(op.ahorroMensual * 12)}</Txt>
                      </View>
                    </View>
                    <Txt variant="caption" color={COLORS.textLow} style={styles.insightPie}>
                      {t('shopping.insightSavingList', {
                        amount: op.ahorroLista.toLocaleString('es-UY'),
                        pct: op.ahorroPct,
                      })}
                      {' · '}
                      {/* El promedio se calcula sobre los meses que REALMENTE
                          tienen movimientos, y el número se dice acá. */}
                      Proyección sobre {insight.perfil.mesesConDatos}
                      {insight.perfil.mesesConDatos === 1 ? ' mes' : ' meses'} con datos;
                      puede variar por promos y faltantes.
                    </Txt>
                  </>
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
            <ItemsCard results={results.results} />

            <Txt variant="overline" color={COLORS.textLow} style={styles.seccion}>
              {t('shopping.storesRanked')}
            </Txt>
            <StoresCard
              byStore={results.byStore}
              totalItems={results.totalItems}
              mejorTotal={mejorTotalCompleto}
              aviso={results.byStore.length > 1 && results.comparableStores < results.byStore.length
                ? t('shopping.notComparable')
                : null}
            />
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
  masChip: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: COLORS.borderStrong,
    borderRadius: RADIUS.full, paddingVertical: 7, paddingHorizontal: 12,
  },
  masChipTxt: { fontFamily: FONTS.semibold, fontSize: 12.5, marginLeft: 5 },
  catScroll: { marginTop: SPACING.m, marginHorizontal: -SPACING.m },
  catRow: { flexDirection: 'row', gap: SPACING.s, paddingHorizontal: SPACING.m },

  optimalRow: { flexDirection: 'row', alignItems: 'flex-end' },
  // minWidth:0 es lo que deja que la columna izquierda se encoja de verdad; sin
  // eso flex:1 no impide que el contenido la empuje más ancha que el espacio.
  optimalIzq: { flex: 1, minWidth: 0 },
  optimalTotal: { fontFamily: FONTS.amountBold, fontSize: 32, lineHeight: 34, letterSpacing: -0.6, color: COLORS.textHigh },
  optimalAhorro: { alignItems: 'flex-end', marginLeft: SPACING.m, flexShrink: 0 },
  ahorroMonto: { fontFamily: FONTS.amountBold, fontSize: 18, lineHeight: 21, color: COLORS.income },
  reparto: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.bg,
    borderWidth: 1.5, borderColor: COLORS.borderSubtle,
    borderRadius: RADIUS.m, paddingVertical: 10, paddingHorizontal: 12,
    marginTop: SPACING.s,
  },
  repartoDots: { flexDirection: 'row', alignItems: 'center', marginRight: SPACING.s },
  repartoTxt: { flex: 1 },
  repartoUno: { flex: 1, marginLeft: 7, lineHeight: 16 },
  unaTiendaExtra: { fontFamily: FONTS.amountBold, fontSize: 12, lineHeight: 15, color: COLORS.textLow, marginLeft: SPACING.s },
  optimalMeta: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 },
  ahorroRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.s },
  ahorroTxt: { marginLeft: 6, flex: 1 },

  insightCard: { marginTop: SPACING.m, borderRadius: RADIUS.xl },
  insightHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  insightFrase: { fontSize: 13.5, lineHeight: 20, marginBottom: 11 },
  insightCajas: { flexDirection: 'row', gap: 9, marginBottom: 11 },
  insightCaja: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5, borderColor: COLORS.borderSubtle,
    borderRadius: RADIUS.m, padding: 11,
  },
  insightMonto: { fontFamily: FONTS.amountBold, fontSize: 15, lineHeight: 19, color: COLORS.income, marginTop: 6 },
  insightPie: { fontSize: 11.5, lineHeight: 16 },
  insightTitle: { marginLeft: 7 },
  insightRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.s },
  insightBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: COLORS.successSoft,
    borderRadius: RADIUS.m, padding: 12, marginTop: 4,
  },
  insightSaving: { fontFamily: FONTS.semibold },

  itemsCard: { paddingVertical: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  itemRowBorde: { borderTopWidth: 1, borderTopColor: COLORS.borderSubtle },
  itemRowInfo: { flex: 1, minWidth: 0, marginLeft: SPACING.s },
  itemRowNombre: { fontFamily: FONTS.semibold, fontSize: 13.5, lineHeight: 17, color: COLORS.textHigh },
  itemRowPrecio: { fontFamily: FONTS.amountBold, fontSize: 14, lineHeight: 17, color: COLORS.income, marginLeft: SPACING.s },
  itemDetalle: { paddingLeft: 16, paddingBottom: SPACING.s },
  otras: { marginTop: SPACING.s },
  otraRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  otraTxt: { fontSize: 12 },

  storesCard: { paddingVertical: 4 },
  storeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
  storeRowBorde: { borderTopWidth: 1, borderTopColor: COLORS.borderSubtle },
  storeNombre: { fontFamily: FONTS.bold, fontSize: 12.5, lineHeight: 16, color: COLORS.textHigh, flex: 1, marginLeft: SPACING.s },
  storeEstado: { fontFamily: FONTS.bold, fontSize: 10, lineHeight: 13, letterSpacing: 0.6, textTransform: 'uppercase' },
  storeTotal: { fontFamily: FONTS.amountBold, fontSize: 14, lineHeight: 17, minWidth: 62, textAlign: 'right', marginLeft: SPACING.s },
  storeExtra: { fontFamily: FONTS.semibold, fontSize: 11.5, lineHeight: 15, color: COLORS.expense, marginBottom: 8, marginLeft: 16 },
  storeAviso: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 9, marginTop: 3, borderTopWidth: 1, borderTopColor: COLORS.borderSubtle },
  storeAvisoTxt: { flex: 1, marginLeft: 7, fontSize: 11.5, lineHeight: 16 },
  storeItems: { paddingBottom: SPACING.s, paddingLeft: 16 },
  storeItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  storeItemName: { flex: 1, marginRight: SPACING.s, fontFamily: FONTS.medium },
  storeItemRight: { flexDirection: 'row', alignItems: 'center' },
  storeItemPrice: { fontFamily: FONTS.amount, fontSize: 13, lineHeight: 16, color: COLORS.textHigh },
  storeItemMeta: { fontFamily: FONTS.amount, fontSize: 11, lineHeight: 14, color: COLORS.textLow },
});
