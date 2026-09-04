import React, { useState, useRef, useCallback, useEffect } from 'react';
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

// "$45/L", "$139/kg", "$4,90/un" — permite comparar envases de distinto
// tamaño, que es la única forma de saber cuál conviene de verdad.
export function formatUnitPrice(item) {
  if (item.unitPrice == null) return null;
  const decimals = item.unitPrice < 10 ? 2 : 0;
  return `$${item.unitPrice.toLocaleString('es-UY', { maximumFractionDigits: decimals })}/${item.unitLabel}`;
}

// Una fila por tienda dentro de la tarjeta expandida. Es lo que convierte
// esto en un comparador: sin esto la app calculaba el precio de cada tienda y
// después mostraba sólo el más barato, tirando la comparación.
function OfferRow({ offer, esMejor, ahorro, hayDiferencia }) {
  return (
    <TouchableOpacity
      style={styles.offerRow}
      onPress={() => offer.url && Linking.openURL(offer.url)}
      activeOpacity={0.7}
    >
      <View style={[styles.storeDot, { backgroundColor: offer.storeColor || COLORS.primary }]} />
      <Text style={[styles.offerStore, esMejor && styles.offerStoreBest]} numberOfLines={1}>
        {offer.store}
      </Text>
      {esMejor && hayDiferencia && (
        <View style={styles.bestBadge}>
          <Text style={styles.bestBadgeText}>MEJOR</Text>
        </View>
      )}
      <View style={{ flex: 1 }} />
      {ahorro > 0 && <Text style={styles.offerDelta}>+${ahorro.toLocaleString('es-UY', { maximumFractionDigits: 0 })}</Text>}
      <Text style={[styles.offerPrice, esMejor && hayDiferencia && styles.offerPriceBest]}>
        ${offer.price.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
      </Text>
      <Ionicons name="open-outline" size={13} color={COLORS.onSurfaceVariant} />
    </TouchableOpacity>
  );
}

function ResultCard({ item, index }) {
  // `item` es un producto agrupado: una fila = un producto real, con la oferta
  // de cada tienda adentro.
  const [abierto, setAbierto] = useState(false);
  const offers = (item.offers && item.offers.length ? item.offers : [item])
    .slice()
    .sort((a, b) => a.price - b.price);
  const best = offers[0];
  const peor = offers[offers.length - 1];
  const enVarias = offers.length > 1;
  const precio = item.minPrice != null ? item.minPrice : best.price;
  // El ahorro es el producto que vende un comparador: cuánto te llevás por
  // comprar en la tienda correcta, no un rango pasivo de precios.
  const ahorro = enVarias ? Math.round(peor.price - best.price) : 0;
  const ahorroPct = ahorro > 0 && peor.price > 0 ? Math.round((ahorro / peor.price) * 100) : 0;
  const pct = best.listPrice && best.listPrice > best.price
    ? Math.round((1 - best.price / best.listPrice) * 100)
    : null;

  return (
    <View style={styles.resultCard}>
      <TouchableOpacity
        style={styles.resultMain}
        onPress={() => (enVarias ? setAbierto((v) => !v) : best.url && Linking.openURL(best.url))}
        activeOpacity={0.82}
      >
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.resultImg} resizeMode="contain" />
        ) : (
          <View style={[styles.resultImg, styles.resultImgPlaceholder]}>
            <Ionicons name="pricetag-outline" size={22} color={COLORS.onSurfaceVariant + '70'} />
          </View>
        )}

        <View style={styles.resultInfo}>
          <Text style={styles.resultName} numberOfLines={2}>{item.name}</Text>
          <View style={styles.resultStorRow}>
            <View style={[styles.storeDot, { backgroundColor: best.storeColor || COLORS.primary }]} />
            <Text style={styles.resultStore}>{best.store}</Text>
            {enVarias && (
              <View style={styles.storesBadge}>
                <Ionicons name="storefront-outline" size={9} color={COLORS.secondary} />
                <Text style={styles.storesBadgeText}>{offers.length} tiendas</Text>
              </View>
            )}
            {pct && (
              <View style={styles.discountBadge}>
                <Text style={styles.discountText}>-{pct}%</Text>
              </View>
            )}
          </View>
          {ahorro > 0 && (
            <View style={styles.savingRow}>
              <Ionicons name="trending-down" size={12} color={COLORS.secondary} />
              <Text style={styles.savingText}>
                Ahorrás ${ahorro.toLocaleString('es-UY')}{ahorroPct >= 3 ? ` (${ahorroPct}%)` : ''} en {best.store}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.resultPriceCol}>
          <Text style={styles.resultPrice}>
            ${precio.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
          </Text>
          {pct && (
            <Text style={styles.resultListPrice}>
              ${best.listPrice.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
            </Text>
          )}
          {item.currency === 'USD' && item.originalPrice != null && (
            <Text style={styles.resultListPrice}>US$ {item.originalPrice.toLocaleString('es-UY')}</Text>
          )}
          {formatUnitPrice(item) && (
            <Text style={styles.resultUnitPrice}>{formatUnitPrice(item)}</Text>
          )}
          {enVarias && (
            <Ionicons
              name={abierto ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={COLORS.onSurfaceVariant}
              style={{ marginTop: 2 }}
            />
          )}
        </View>
      </TouchableOpacity>

      {abierto && enVarias && (
        <View style={styles.offersBox}>
          {ahorro === 0 && (
            <Text style={styles.mismoPrecio}>Mismo precio en las {offers.length} tiendas</Text>
          )}
          {offers.map((o, i) => (
            <OfferRow
              key={o.url || `${o.store}-${i}`}
              offer={o}
              esMejor={i === 0}
              hayDiferencia={ahorro > 0}
              ahorro={i === 0 ? 0 : Math.round(o.price - best.price)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// Placeholders mientras se scrapean las tiendas. Un scrape en frío tarda
// 5-12s y un spinner solo en el botón se lee como "se colgó".
function SkeletonCard() {
  return (
    <View style={[styles.resultCard, styles.resultMain, { opacity: 0.5 }]}>
      <View style={[styles.resultImg, styles.skelBlock]} />
      <View style={styles.resultInfo}>
        <View style={[styles.skelBlock, { height: 11, width: '85%', marginBottom: 6 }]} />
        <View style={[styles.skelBlock, { height: 9, width: '45%' }]} />
      </View>
      <View style={[styles.skelBlock, { height: 15, width: 52 }]} />
    </View>
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
  const [meta, setMeta]           = useState(null);  // substitutes, storesSearched
  const [orden, setOrden]         = useState('relevancia'); // relevancia | precio | unitario
  const [ultimaBusqueda, setUltima] = useState('');
  // Cuántas tiendas cubre cada categoría. Se pide una vez a /prices/categories
  // en vez de hardcodearlo: el backend agrega tiendas y un número escrito a
  // mano acá quedaría mintiendo en la pantalla de carga.
  const [storesPorCat, setStoresPorCat] = useState({});

  useEffect(() => {
    let vivo = true;
    api.get('/prices/categories')
      .then(({ data }) => {
        if (!vivo) return;
        const mapa = {};
        let total = 0;
        (data.categories || []).forEach((c) => {
          mapa[c.id] = (c.stores || []).length;
          total += (c.stores || []).length;
        });
        mapa.__todas = total;
        setStoresPorCat(mapa);
      })
      .catch(() => {});  // sin esto la pantalla igual funciona, sólo sin el número
    return () => { vivo = false; };
  }, []);
  const searchRef = useRef(null);

  const headerAnim = useEntrance({ fromY: -20 });

  const search = useCallback(async (q = query, cat = category) => {
    if (!canComparePrices) { showUpgrade('prices'); return; }
    const term = (q || '').trim();
    if (term.length < 2) return;
    setLoading(true);
    setResults(null);
    setMeta(null);   // si no, el aviso de sustitutos y el conteo quedan del anterior
    try {
      const params = { q: term, limit: 24 };
      if (cat) params.category = cat;
      const { data } = await api.get('/prices/search', { params, timeout: 60000 });
      // `groups` viene agrupado por producto real (mismo producto en varias
      // tiendas = una sola fila). Si el backend no lo manda, se cae a la
      // lista plana de siempre.
      setResults(data.groups || (data.items || []).map((i) => ({
        ...i, minPrice: i.price, maxPrice: i.price, storeCount: 1,
        offers: [{ ...i }],
      })));
      setStats(data.stats);
      setMeta({ substitutes: !!data.substitutes, storesSearched: data.storesSearched || 0 });
      setUltima(term);
    } catch (err) {
      setResults([]);
      setMeta(null);
      setUltima(term);
    } finally {
      setLoading(false);
    }
  }, [query, category, canComparePrices, showUpgrade]);

  // El orden se aplica sobre lo que ya trajimos: reordenar no vuelve a pegarle
  // a las tiendas. "relevancia" respeta el ranking del backend; las otras dos
  // exponen trabajo que hoy era invisible — sobre todo el precio por unidad,
  // que es la única forma honesta de comparar envases de distinto tamaño.
  const resultadosOrdenados = React.useMemo(() => {
    if (!results) return results;
    if (orden === 'relevancia') return results;
    const lista = results.slice();
    if (orden === 'precio') {
      return lista.sort((a, b) => (a.minPrice ?? a.price) - (b.minPrice ?? b.price));
    }
    // Por unidad: los que no tienen precio unitario van al final en vez de
    // desaparecer — una TV no tiene precio por litro y no es un error.
    return lista.sort((a, b) => {
      if (a.unitPrice == null && b.unitPrice == null) return 0;
      if (a.unitPrice == null) return 1;
      if (b.unitPrice == null) return -1;
      return a.unitPrice - b.unitPrice;
    });
  }, [results, orden]);

  const conUnitario = (results || []).filter((r) => r.unitPrice != null).length;
  const tiendasDeCategoria = category ? storesPorCat[category] : storesPorCat.__todas;

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
          <LinearGradient colors={canComparePrices ? GRADIENT.primary : GRADIENT.locked} style={styles.headerIcon}>
            <Ionicons name={canComparePrices ? 'search' : 'lock-closed'} size={20} color={canComparePrices ? COLORS.onPrimary : COLORS.onPrimaryContainer} />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitle}>Buscar precios</Text>
              {!canComparePrices && (
                <View style={styles.proBadge}>
                  <Ionicons name="diamond" size={10} color={COLORS.tertiary} />
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
              colors={canComparePrices ? GRADIENT.primary : GRADIENT.locked}
              style={styles.searchBtn}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {loading
                ? <ActivityIndicator size="small" color={COLORS.onPrimary} />
                : <Ionicons name={canComparePrices ? 'search' : 'lock-closed'} size={20} color={canComparePrices ? COLORS.onPrimary : COLORS.onPrimaryContainer} />
              }
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Buscando: esqueletos + en cuántas tiendas */}
        {loading && (
          <>
            <View style={styles.statsRow}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.statsText}>
                Buscando{tiendasDeCategoria ? ` en ${tiendasDeCategoria} tiendas` : ''}…
              </Text>
            </View>
            {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </>
        )}

        {/* Stats + orden */}
        {stats && !loading && results && results.length > 0 && (
          <>
            <View style={styles.statsRow}>
              <Text style={styles.statsText}>
                {results.length} producto{results.length === 1 ? '' : 's'} · desde $
                {stats.min?.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sortRow}
            >
              {[
                { id: 'relevancia', label: 'Relevancia', icon: 'sparkles-outline' },
                { id: 'precio', label: 'Precio', icon: 'pricetag-outline' },
                // Sólo se ofrece si hay algo que ordenar: en hogar o ropa casi
                // ningún producto tiene precio por unidad y el botón sería falso.
                ...(conUnitario >= 2 ? [{ id: 'unitario', label: 'Precio x unidad', icon: 'analytics-outline' }] : []),
              ].map((o) => {
                const on = orden === o.id;
                return (
                  <TouchableOpacity
                    key={o.id}
                    style={[styles.sortChip, on && styles.sortChipActive]}
                    onPress={() => setOrden(o.id)}
                    activeOpacity={0.75}
                  >
                    <Ionicons name={o.icon} size={12} color={on ? COLORS.onPrimary : COLORS.onSurfaceVariant} />
                    <Text style={[styles.sortChipText, on && styles.sortChipTextActive]}>{o.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* Sustitutos: por qué los nombres no coinciden con lo que buscaste */}
        {meta?.substitutes && !loading && results && results.length > 0 && (
          <View style={styles.noticeBox}>
            <Ionicons name="information-circle-outline" size={16} color={COLORS.secondary} />
            <Text style={styles.noticeText}>
              No hay productos que se llamen “{ultimaBusqueda}”. Te mostramos las marcas
              con las que se vende.
            </Text>
          </View>
        )}

        {/* Sin resultados — distingue el hueco de stock del error de tipeo */}
        {results && !loading && results.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={36} color={COLORS.onSurfaceVariant + '50'} />
            <Text style={styles.emptyText}>Nada para “{ultimaBusqueda}”</Text>
            <Text style={styles.emptySub}>
              {category
                ? `Buscamos en ${tiendasDeCategoria || 'las'} tiendas de esta categoría y ninguna lo tiene.`
                : 'Revisá cómo está escrito o probá con un término más general.'}
            </Text>
            {category && (
              <TouchableOpacity
                style={styles.emptyCta}
                activeOpacity={0.8}
                onPress={() => { setCategory(null); search(ultimaBusqueda, null); }}
              >
                <Ionicons name="globe-outline" size={14} color={COLORS.primary} />
                <Text style={styles.emptyCtaText}>Buscar en todas las categorías</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {resultadosOrdenados && !loading && resultadosOrdenados.map((item, i) => (
          <ResultCard key={(item.offers && item.offers[0] && item.offers[0].url) || item.name || i} item={item} index={i} />
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
            <LinearGradient colors={GRADIENT.locked} style={styles.lockedIconWrap}>
              <Ionicons name="diamond" size={26} color={COLORS.onPrimaryContainer} />
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
    backgroundColor: COLORS.tertiary + '22',
    borderRadius: RADIUS.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  proBadgeText: { fontSize: 10, fontWeight: '800', color: COLORS.tertiary, letterSpacing: 0.5 },

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
  statsRow: { marginBottom: SPACING.md, flexDirection: 'row', alignItems: 'center', gap: 8 },
  statsText: { fontSize: 12, color: COLORS.onSurfaceVariant },

  // Result card
  // La tarjeta ahora es contenedor (fila principal + ofertas desplegadas),
  // así que el layout horizontal se mudó a resultMain.
  resultMain: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  // ─── Orden ───────────────────────────────────────────────
  sortRow: { gap: 8, paddingBottom: SPACING.md },
  sortChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceContainer,
    borderWidth: 1, borderColor: COLORS.outlineVariant + '50',
  },
  sortChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  sortChipText: { fontSize: 11, fontWeight: '600', color: COLORS.onSurfaceVariant },
  sortChipTextActive: { color: COLORS.onPrimary },

  // ─── Aviso de sustitutos ─────────────────────────────────
  noticeBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: COLORS.secondary + '12',
    borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md,
    borderLeftWidth: 3, borderLeftColor: COLORS.secondary,
  },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 17, color: COLORS.onSurfaceVariant },

  // ─── Ahorro y ofertas por tienda ─────────────────────────
  savingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  savingText: { fontSize: 11, fontWeight: '700', color: COLORS.secondary },

  offersBox: {
    marginTop: SPACING.md, paddingTop: SPACING.sm,
    borderTopWidth: 1, borderTopColor: COLORS.outlineVariant + '40',
    gap: 2,
  },
  offerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingVertical: 7, paddingHorizontal: 4, borderRadius: RADIUS.sm,
  },
  offerStore: { fontSize: 12, color: COLORS.onSurfaceVariant, fontWeight: '500', maxWidth: 110 },
  offerStoreBest: { color: COLORS.onSurface, fontWeight: '700' },
  offerPrice: { fontSize: 13, fontWeight: '700', color: COLORS.onSurfaceVariant },
  offerPriceBest: { fontSize: 14, fontWeight: '800', color: COLORS.secondary },
  offerDelta: { fontSize: 10, color: COLORS.error || COLORS.onSurfaceVariant, fontWeight: '600' },
  bestBadge: {
    backgroundColor: COLORS.secondary + '22', borderRadius: RADIUS.full,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  bestBadgeText: { fontSize: 8, fontWeight: '800', color: COLORS.secondary, letterSpacing: 0.4 },

  // ─── Esqueleto de carga ──────────────────────────────────
  mismoPrecio: { fontSize: 11, color: COLORS.onSurfaceVariant, fontStyle: 'italic', paddingHorizontal: 4, paddingBottom: 4 },
  skelBlock: { backgroundColor: COLORS.outlineVariant + '35', borderRadius: RADIUS.sm },

  // ─── CTA del estado vacío ────────────────────────────────
  emptyCta: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.md,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.primary + '60',
  },
  emptyCtaText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  resultCard: {
    gap: SPACING.sm,
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
  resultUnitPrice: { fontSize: 11, color: COLORS.secondary, fontWeight: '600', marginTop: 2 },
  resultRange: { fontSize: 10, color: COLORS.onSurfaceVariant },
  storesBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.secondary + '1E',
    borderRadius: RADIUS.full, paddingHorizontal: 6, paddingVertical: 1,
  },
  storesBadgeText: { fontSize: 9, fontWeight: '700', color: COLORS.secondary },

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
    ...SHADOWS.gold,
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
