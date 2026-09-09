import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View, ScrollView, StyleSheet, Pressable, Linking,
  KeyboardAvoidingView, Platform, Image, LayoutAnimation, UIManager,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { usePlan } from '../context/PlanContext';
import {
  Txt, Card, Input, Chip, SortChip, Badge, StoreDot, Button,
  EmptyState, OfferRowSkeleton, ScreenHeader, formatUYU, formatUnitPrice,
} from '../components/ui';
import { COLORS, SPACING, RADIUS, GRADIENTS, FONTS } from '../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Deben coincidir con CATEGORIES en backend/services/scraper.js.
const CATEGORIES = [
  { id: null,           label: 'Todo',     icon: 'globe-outline' },
  { id: 'supermercado', label: 'Super',    icon: 'cart-outline' },
  { id: 'farmacia',     label: 'Farmacia', icon: 'medical-outline' },
  { id: 'belleza',      label: 'Belleza',  icon: 'sparkles-outline' },
  { id: 'ropa',         label: 'Ropa',     icon: 'shirt-outline' },
  { id: 'hogar',        label: 'Hogar',    icon: 'tv-outline' },
];

/**
 * Avisa al backend qué resultado se abrió. Es telemetría para entrenar el
 * ranking más adelante (services/searchLog.js): sin historial de lo que la
 * gente elige no hay nada que aprender, y ese dato no se recupera después.
 * No se espera ni se muestra error — abrir la tienda no puede depender de esto.
 */
function registrarClick({ searchId, position, offer }) {
  api.post('/prices/click', {
    searchId,
    position,
    storeId: offer.storeId || null,
    productName: offer.name,
    price: offer.price,
  }).catch(() => {});
}

/**
 * Fila de una tienda dentro del grupo expandido. Esto es lo que convierte la
 * pantalla en un comparador: sin esto se calculaba el precio de cada tienda y
 * se mostraba sólo el más barato, tirando la comparación.
 */
function TiendaRow({ offer, esMejor, hayDiferencia, delta, onAbrir }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.tiendaRow, pressed && styles.pressed]}
      onPress={() => { onAbrir && onAbrir(offer); if (offer.url) Linking.openURL(offer.url); }}
    >
      <StoreDot storeId={offer.storeId} size={9} />
      <Txt variant="caption" color={COLORS.textHigh} style={styles.tiendaNombre} numberOfLines={1}>
        {offer.store}
      </Txt>
      {esMejor && hayDiferencia ? <Badge variant="best" label="Mejor" /> : null}
      <View style={{ flex: 1 }} />
      {delta > 0 ? (
        <Txt style={styles.delta}>+{formatUYU(delta)}</Txt>
      ) : null}
      <Txt style={[styles.tiendaPrecio, esMejor && hayDiferencia && { color: COLORS.income }]}>
        {formatUYU(offer.price)}
      </Txt>
      <Ionicons name="open-outline" size={13} color={COLORS.textLow} style={{ marginLeft: 8 }} />
    </Pressable>
  );
}

/**
 * Grupo de resultado: un producto real con la oferta de cada tienda adentro.
 */
function GrupoResultado({ item, index, searchId }) {
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
  const pctDesc = best.listPrice && best.listPrice > best.price
    ? Math.round((1 - best.price / best.listPrice) * 100)
    : null;
  const unitario = formatUnitPrice(item);

  const alternar = () => {
    LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'opacity'));
    setAbierto((v) => !v);
  };

  return (
    <Card style={styles.grupo} contentStyle={{ flex: 1 }}>
      <Pressable
        style={({ pressed }) => [styles.grupoHead, pressed && styles.pressed]}
        onPress={() => {
          if (enVarias) { alternar(); return; }
          registrarClick({ searchId, position: index + 1, offer: best });
          if (best.url) Linking.openURL(best.url);
        }}
      >
        <View style={styles.imgCaja}>
          {item.image ? (
            <Image source={{ uri: item.image }} style={styles.img} resizeMode="contain" />
          ) : (
            <Ionicons name="image-outline" size={22} color={COLORS.textLow} />
          )}
        </View>

        <View style={styles.grupoInfo}>
          <Txt style={styles.grupoNombre} numberOfLines={2}>{item.name}</Txt>

          <View style={styles.grupoMeta}>
            {enVarias ? (
              <Txt variant="caption" color={COLORS.textMid} style={styles.metaTxt}>
                {offers.length} tiendas
              </Txt>
            ) : (
              <>
                <StoreDot storeId={best.storeId} size={8} style={{ marginRight: 6 }} />
                <Txt variant="caption" color={COLORS.textMid} style={styles.metaTxt}>{best.store}</Txt>
              </>
            )}
            {unitario ? (
              <Txt variant="caption" color={COLORS.textLow} style={styles.metaTxt}> · {unitario}</Txt>
            ) : null}
          </View>

          {enVarias && ahorro > 0 ? (
            <Txt variant="caption" color={COLORS.income} style={styles.rango}>
              {formatUYU(best.price)} – {formatUYU(peor.price)} · ahorrás {formatUYU(ahorro)}
              {ahorroPct >= 3 ? ` (${ahorroPct}%)` : ''}
            </Txt>
          ) : null}
        </View>

        <View style={styles.grupoPrecio}>
          <Txt style={styles.precio}>{formatUYU(precio)}</Txt>
          {pctDesc ? (
            <Txt style={styles.tachado}>{formatUYU(best.listPrice)}</Txt>
          ) : null}
          {item.currency === 'USD' && item.originalPrice != null ? (
            <Txt style={styles.usd}>US$ {item.originalPrice.toLocaleString('es-UY')}</Txt>
          ) : null}
          {pctDesc ? <Badge variant="discount" label={`−${pctDesc}%`} style={{ marginTop: 5 }} /> : null}
          {enVarias ? (
            <Ionicons
              name={abierto ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={COLORS.textLow}
              style={{ marginTop: 4 }}
            />
          ) : null}
        </View>
      </Pressable>

      {abierto && enVarias ? (
        <View style={styles.tiendas}>
          {ahorro === 0 ? (
            <Txt variant="caption" color={COLORS.textLow} style={styles.mismoPrecio}>
              Mismo precio en las {offers.length} tiendas
            </Txt>
          ) : null}
          {offers.map((o, i) => (
            <TiendaRow
              key={o.url || `${o.store}-${i}`}
              offer={o}
              esMejor={i === 0}
              hayDiferencia={ahorro > 0}
              delta={i === 0 ? 0 : Math.round(o.price - best.price)}
              onAbrir={(of) => registrarClick({ searchId, position: index + 1, offer: of })}
            />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

export default function SearchScreen() {
  const { t } = useLanguage();
  const { canComparePrices, showUpgrade } = usePlan();

  const [query, setQuery]     = useState('');
  const [category, setCategory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);   // null = no buscado aún
  const [stats, setStats]     = useState(null);
  const [meta, setMeta]       = useState(null);
  const [orden, setOrden]     = useState('relevancia');
  const [ultimaBusqueda, setUltima] = useState('');
  const [searchId, setSearchId] = useState(null);

  // Cuántas tiendas cubre cada categoría. Se pide una vez en vez de
  // hardcodearlo: el backend agrega tiendas y un número escrito a mano acá
  // quedaría mintiendo en la pantalla de carga.
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
      .catch(() => {});   // sin esto la pantalla funciona igual, sólo sin el número
    return () => { vivo = false; };
  }, []);

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
      // `groups` viene agrupado por producto real. Si el backend no lo manda,
      // se cae a la lista plana de siempre.
      setResults(data.groups || (data.items || []).map((i) => ({
        ...i, minPrice: i.price, maxPrice: i.price, storeCount: 1, offers: [{ ...i }],
      })));
      setStats(data.stats);
      setMeta({ substitutes: !!data.substitutes, storesSearched: data.storesSearched || 0 });
      setSearchId(data.searchId || null);
      setUltima(term);
    } catch (err) {
      setResults([]);
      setMeta(null);
      setUltima(term);
    } finally {
      setLoading(false);
    }
  }, [query, category, canComparePrices, showUpgrade]);

  // El orden se aplica sobre lo ya traído: reordenar no vuelve a pegarle a las
  // tiendas.
  const ordenados = useMemo(() => {
    if (!results) return results;
    if (orden === 'relevancia') return results;
    const lista = results.slice();
    if (orden === 'precio') {
      return lista.sort((a, b) => (a.minPrice ?? a.price) - (b.minPrice ?? b.price));
    }
    // Por unidad: los que no tienen precio unitario van al final en vez de
    // desaparecer — una TV no tiene precio por litro y eso no es un error.
    return lista.sort((a, b) => {
      if (a.unitPrice == null && b.unitPrice == null) return 0;
      if (a.unitPrice == null) return 1;
      if (b.unitPrice == null) return -1;
      return a.unitPrice - b.unitPrice;
    });
  }, [results, orden]);

  const conUnitario = (results || []).filter((r) => r.unitPrice != null).length;
  const tiendasDeCategoria = category ? storesPorCat[category] : storesPorCat.__todas;
  const puedeBuscar = query.trim().length >= 2;

  const onCategoryChange = (catId) => {
    setCategory(catId);
    if (query.trim().length >= 2) search(query, catId);
  };

  const ordenes = [
    { id: 'relevancia', label: 'Relevancia' },
    { id: 'precio', label: 'Precio' },
    // Sólo se ofrece si hay algo que ordenar: en hogar o ropa casi ningún
    // producto tiene precio por unidad y el chip sería falso.
    ...(conUnitario >= 2 ? [{ id: 'unitario', label: 'Precio x unidad' }] : []),
  ];

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          title="Buscar"
          subtitle={tiendasDeCategoria ? `${tiendasDeCategoria} cadenas · precios de hoy` : 'Precios de hoy'}
          actionIcon={canComparePrices ? 'options-outline' : 'lock-closed'}
          onActionPress={canComparePrices ? undefined : () => showUpgrade('prices')}
        />

        {/* Sangra hasta el borde con degradado a la derecha: es la afordancia
            de que la fila scrollea, sin barra visible. */}
        <View style={styles.chipsWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            {CATEGORIES.map((cat) => (
              <Chip
                key={String(cat.id)}
                label={cat.label}
                icon={cat.icon}
                active={category === cat.id}
                onPress={() => onCategoryChange(cat.id)}
                style={styles.chip}
              />
            ))}
          </ScrollView>
          <LinearGradient
            colors={GRADIENTS.scrollFade}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.chipsFade}
            pointerEvents="none"
          />
        </View>

        <View style={styles.searchRow}>
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="ej: leche, shampoo, auriculares…"
            icon="search-outline"
            onClear={() => setQuery('')}
            onSubmitEditing={() => search()}
            returnKeyType="search"
            style={{ flex: 1 }}
          />
          <Pressable
            onPress={() => search()}
            disabled={loading || (canComparePrices && !puedeBuscar)}
            style={({ pressed }) => [
              styles.searchBtn,
              (loading || (canComparePrices && !puedeBuscar)) && styles.searchBtnOff,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name={canComparePrices ? 'search' : 'lock-closed'}
              size={20}
              color={COLORS.onPrimary}
            />
          </Pressable>
        </View>

        {loading ? (
          <>
            <Txt variant="caption" color={COLORS.textMid} style={styles.stats}>
              Buscando{tiendasDeCategoria ? ` en ${tiendasDeCategoria} tiendas` : ''}…
            </Txt>
            {[0, 1, 2, 3].map((i) => (
              <OfferRowSkeleton key={i} style={styles.skel} />
            ))}
          </>
        ) : null}

        {stats && !loading && results && results.length > 0 ? (
          <>
            <Txt variant="caption" color={COLORS.textMid} style={styles.stats}>
              {results.length} producto{results.length === 1 ? '' : 's'}
              {meta?.storesSearched ? ` en ${meta.storesSearched} tiendas` : ''}
              {stats.min != null ? ` · desde ${formatUYU(stats.min)}` : ''}
            </Txt>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sortRow}
            >
              {ordenes.map((o) => (
                <SortChip
                  key={o.id}
                  label={o.label}
                  active={orden === o.id}
                  desc={false}
                  onPress={() => setOrden(o.id)}
                  style={styles.chip}
                />
              ))}
            </ScrollView>
          </>
        ) : null}

        {/* Por qué los nombres no coinciden con lo que se buscó. */}
        {meta?.substitutes && !loading && results && results.length > 0 ? (
          <Card style={styles.aviso}>
            <View style={styles.avisoRow}>
              <Ionicons name="information-circle-outline" size={16} color={COLORS.accent} />
              <Txt variant="caption" color={COLORS.textMid} style={styles.avisoTxt}>
                No hay productos que se llamen “{ultimaBusqueda}”. Te mostramos las marcas
                con las que se vende.
              </Txt>
            </View>
          </Card>
        ) : null}

        {/* Sin resultados — distingue el hueco de stock del error de tipeo. */}
        {results && !loading && results.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title={`Nada para “${ultimaBusqueda}”`}
            text={category
              ? `Buscamos en ${tiendasDeCategoria || 'las'} tiendas de esta categoría y ninguna lo tiene.`
              : 'Revisá cómo está escrito o probá con un término más general.'}
            actionLabel={category ? 'Buscar en todas las categorías' : undefined}
            actionIcon="globe-outline"
            onAction={() => { setCategory(null); search(ultimaBusqueda, null); }}
            style={styles.bloque}
          />
        ) : null}

        {ordenados && !loading
          ? ordenados.map((item, i) => (
              <GrupoResultado
                key={(item.offers && item.offers[0] && item.offers[0].url) || item.name || i}
                item={item}
                index={i}
                searchId={searchId}
              />
            ))
          : null}

        {results === null && !loading && canComparePrices ? (
          <EmptyState
            icon="pricetag-outline"
            title="Compará antes de comprar"
            text="Elegí una categoría y buscá cualquier producto para ver qué cadena lo tiene más barato."
            style={styles.bloque}
          />
        ) : null}

        {results === null && !loading && !canComparePrices ? (
          <Card variant="locked" label="Premium" style={styles.bloque}>
            <Txt variant="h2" style={{ marginBottom: 6 }}>{t('premium.lockedPrices')}</Txt>
            <Txt variant="body" color={COLORS.textMid} style={{ marginBottom: 16 }}>
              {t('premium.upgradeNudgePrices')}
            </Txt>
            <Button
              label={t('premium.ctaBtn')}
              variant="premiumLocked"
              icon="diamond-outline"
              onPress={() => showUpgrade('prices')}
            />
          </Card>
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
  pressed: { opacity: 0.75 },
  bloque: { marginTop: SPACING.m },

  chipsWrap: { marginTop: SPACING.m, marginHorizontal: -SPACING.m },
  chipsRow: { paddingHorizontal: SPACING.m, gap: SPACING.s },
  chipsFade: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 32 },
  chip: { marginRight: 0 },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s, marginTop: SPACING.m },
  searchBtn: {
    width: 48, height: 48,
    borderRadius: RADIUS.m,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  searchBtnOff: { backgroundColor: COLORS.surfaceSunken },

  stats: { marginTop: SPACING.m, marginBottom: SPACING.s },
  sortRow: { gap: SPACING.s, paddingBottom: SPACING.xs },
  skel: { marginTop: SPACING.s },

  aviso: { marginTop: SPACING.m },
  avisoRow: { flexDirection: 'row', alignItems: 'flex-start' },
  avisoTxt: { flex: 1, marginLeft: SPACING.s },

  grupo: { marginTop: SPACING.s, padding: 13 },
  grupoHead: { flexDirection: 'row', alignItems: 'center' },
  imgCaja: {
    width: 62, height: 62,
    borderRadius: RADIUS.s + 2,
    backgroundColor: COLORS.surfaceSunken,
    borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  img: { width: '100%', height: '100%' },
  grupoInfo: { flex: 1, minWidth: 0, marginHorizontal: 13 },
  grupoNombre: { fontFamily: FONTS.semibold, fontSize: 14.5, lineHeight: 19.5, color: COLORS.textHigh, marginBottom: 5 },
  grupoMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  metaTxt: { fontFamily: FONTS.medium, fontSize: 12.5, lineHeight: 16 },
  rango: { fontSize: 12.5, lineHeight: 16, marginTop: 4 },
  grupoPrecio: { alignItems: 'flex-end' },
  precio: { fontFamily: FONTS.amountBold, fontSize: 16, lineHeight: 19, color: COLORS.textHigh },
  tachado: {
    fontFamily: FONTS.amount, fontSize: 12, lineHeight: 16,
    color: COLORS.textLow, textDecorationLine: 'line-through',
  },
  usd: { fontFamily: FONTS.amount, fontSize: 11, lineHeight: 15, color: COLORS.textLow },

  tiendas: { marginTop: 12, borderTopWidth: 1, borderTopColor: COLORS.borderSubtle, paddingTop: 4 },
  mismoPrecio: { fontSize: 12, paddingVertical: 8 },
  tiendaRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  tiendaNombre: { fontFamily: FONTS.semibold, marginLeft: 8, marginRight: 8, flexShrink: 1 },
  tiendaPrecio: { fontFamily: FONTS.amountBold, fontSize: 14, lineHeight: 17, color: COLORS.textHigh },
  delta: { fontFamily: FONTS.semibold, fontSize: 12, lineHeight: 16, color: COLORS.expense, marginRight: 10 },
});
