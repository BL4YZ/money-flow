import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, ScrollView, StyleSheet, ActivityIndicator, Pressable,
  RefreshControl, Alert, Animated, Easing,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import api from '../api/client';
import { daysUntilDue } from '../utils/notifications';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import RefreshBadge from '../components/RefreshBadge';
import { usePlan } from '../context/PlanContext';
import {
  Txt, Card, Input, Chip, Segmented, Badge, Button, BottomSheet, FloatingAction,
  EmptyState, ProgressBar, ScreenHeader, Glow, BarChart, formatUYU, formatMoney,
} from '../components/ui';
import {
  COLORS, SPACING, RADIUS, FONTS, categoryColor,
} from '../theme';

const CATEGORY_ICONS = {
  Supermercado: 'cart-outline',
  Restaurantes: 'restaurant-outline',
  Transporte: 'car-outline',
  Salud: 'medkit-outline',
  Streaming: 'play-circle-outline',
  Servicios: 'flash-outline',
  Deporte: 'barbell-outline',
  Entretenimiento: 'musical-notes-outline',
  Ropa: 'shirt-outline',
  Educación: 'school-outline',
  Vivienda: 'home-outline',
  Préstamos: 'cash-outline',
  Seguros: 'shield-checkmark-outline',
  Salario: 'wallet-outline',
  Transferencia: 'swap-horizontal-outline',
  Otros: 'ellipsis-horizontal-circle-outline',
};

const DEFAULT_CATEGORIES = [
  'Supermercado', 'Restaurantes', 'Transporte', 'Salud', 'Streaming', 'Servicios',
  'Deporte', 'Entretenimiento', 'Ropa', 'Educación', 'Vivienda', 'Préstamos',
  'Seguros', 'Salario', 'Transferencia', 'Otros',
];

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function formatMonth(ym) {
  const [year, month] = ym.split('-');
  return `${MESES[parseInt(month, 10) - 1]} ${year}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  // Sólo YYYY-MM-DD, por si viene como timestamp completo de Postgres.
  const clean = String(dateStr).slice(0, 10);
  const d = new Date(clean + 'T00:00:00');
  if (isNaN(d.getTime())) return clean;
  return d.toLocaleDateString('es-UY', { day: '2-digit', month: 'short' });
}


const EMPTY_FORM = {
  type: 'debit', amount: '', description: '', category: 'Otros',
  // Arranca en pesos porque es lo comun, pero se puede cambiar: en Uruguay
  // mucha gente tiene cuenta en pesos y cuenta en dolares, y hay quien cobra
  // directamente en dolares.
  currency: 'UYU',
  date: new Date().toISOString().slice(0, 10),
};

/** Fila de transacción. */
function TxRow({ tx, onEdit, onDelete }) {
  const esGasto = tx.type === 'debit';
  const icon = CATEGORY_ICONS[tx.category] || CATEGORY_ICONS.Otros;
  const tono = categoryColor(tx.category || 'Otros');

  return (
    <Pressable onPress={onEdit} style={({ pressed }) => [styles.txRow, pressed && styles.pressed]}>
      <View style={[styles.txIcon, { borderColor: tono }]}>
        <Ionicons name={icon} size={16} color={tono} />
      </View>
      <View style={styles.txInfo}>
        <Txt variant="caption" color={COLORS.textHigh} style={styles.txDesc} numberOfLines={1}>
          {tx.description}
        </Txt>
        <Txt variant="caption" color={COLORS.textLow} style={styles.txMeta}>
          {formatDate(tx.date)} · {tx.category || 'Otros'}
          {/* El equivalente en pesos del dia del movimiento. Va abajo y en
              gris porque el importe real es el de arriba: esto es referencia,
              y ademas NO es lo que valdria hoy. */}
          {tx.currency === 'USD' && tx.amount_uyu
            ? ` · ${formatUYU(parseFloat(tx.amount_uyu))} al cambio del día`
            : ''}
        </Txt>
      </View>
      <View style={styles.txRight}>
        <Txt style={[styles.txAmount, { color: esGasto ? COLORS.expense : COLORS.income }]}>
          {esGasto ? '−' : '+'}{formatMoney(parseFloat(tx.amount), tx.currency)}
        </Txt>
        <Pressable onPress={onDelete} hitSlop={8} style={{ marginTop: 4 }}>
          <Ionicons name="trash-outline" size={13} color={COLORS.textLow} />
        </Pressable>
      </View>
    </Pressable>
  );
}

/**
 * Fila de categoría. Muestra el presupuesto cuando hay uno y el porcentaje del
 * total cuando no. El sobregiro lo dibuja ProgressBar, que parte la barra en
 * "lo presupuestado" y "el excedente" en vez de pintarla toda de rojo — una
 * barra al 100% no distingue gastar justo de gastar el doble.
 */
function CategoryRow({ cat, total, totalIncome, active, onPress, budget, onSetBudget, currency = 'UYU' }) {
  const gasto = parseFloat(cat.total_spent);
  const ingreso = parseFloat(cat.total_income);
  const esIngreso = gasto === 0 && ingreso > 0;
  const monto = esIngreso ? ingreso : gasto;
  const icon = CATEGORY_ICONS[cat.category] || CATEGORY_ICONS.Otros;
  const tono = esIngreso ? COLORS.income : categoryColor(cat.category || 'Otros');

  // Con presupuesto la barra mide contra el límite; sin él, contra el total del
  // mes — dos preguntas distintas y por eso el detalle también cambia.
  const conPresupuesto = !esIngreso && !!budget;
  const base = esIngreso ? totalIncome : total;
  const valor = conPresupuesto ? gasto : monto;
  const max = conPresupuesto ? budget : (base || 1);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.catRow, active && styles.catRowActive, pressed && styles.pressed]}
    >
      <View style={[styles.catIcon, { borderColor: tono }]}>
        <Ionicons name={icon} size={14} color={tono} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.catHead}>
          <Txt variant="caption" color={COLORS.textHigh} style={styles.catName} numberOfLines={1}>
            {cat.category || 'Otros'}
          </Txt>
          <View style={styles.catRight}>
            <Txt style={[styles.catAmount, esIngreso && { color: COLORS.income }]}>
              {esIngreso ? '+' : ''}{formatMoney(monto, currency)}
              {budget ? ` / ${formatMoney(budget, currency)}` : ''}
            </Txt>
            {!esIngreso ? (
              <Pressable onPress={onSetBudget} hitSlop={8} style={{ marginLeft: 6 }}>
                <Ionicons
                  name={budget ? 'wallet' : 'wallet-outline'}
                  size={13}
                  color={budget ? COLORS.warning : COLORS.textLow}
                />
              </Pressable>
            ) : null}
          </View>
        </View>
        <ProgressBar value={valor} max={max} color={tono} style={{ marginTop: 6 }} />
      </View>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const { user, logout } = useAuth();
  const { t, lang, toggleLanguage } = useLanguage();

  const [summary, setSummary] = useState(null);
  const { isPremium, isTrial, trialDays, showUpgrade } = usePlan();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [txLoading, setTxLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);   // null = crear, id = editar
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [chartMode, setChartMode] = useState('mes');   // 'mes' | 'cat'
  const [customCategories, setCustomCategories] = useState([]);
  const [newCatInput, setNewCatInput] = useState('');
  const [showCatInput, setShowCatInput] = useState(false);
  const [upcomingBills, setUpcomingBills] = useState([]);
  const [budgets, setBudgets] = useState({});          // { category: amount }
  const [budgetModal, setBudgetModal] = useState(null); // { category } | null
  // QUE CUENTA se esta mirando. En Uruguay una persona tiene cuenta en pesos y
  // cuenta en dolares, y son cuentas distintas con resumenes distintos: verlas
  // sumadas en un total unico no es lo que nadie tiene en la cabeza. 'todo'
  // existe igual, convertido a pesos, para mirar el conjunto.
  const [cuenta, setCuentaEstado] = useState(user?.display_currency || 'UYU');

  // Cambiar de cuenta guarda la eleccion en el servidor, no en el telefono: es
  // una preferencia de la persona, no del dispositivo. Se aplica en pantalla al
  // instante y se guarda en segundo plano — si el guardado falla, lo unico que
  // se pierde es que la proxima vez arranque en la otra, no la navegacion.
  const setCuenta = (valor) => {
    setCuentaEstado(valor);
    setSelectedCategory(null);
    api.patch('/account/preferences', { display_currency: valor }).catch(() => {});
  };
  const [cuentas, setCuentas] = useState([]);
  // Distingue "abrir la app" de "cambiar de vista": solo lo primero justifica
  // un spinner que tape todo.
  const primeraCarga = useRef(true);
  const fade = useRef(new Animated.Value(1)).current;
  // La moneda de los numeros la DICE el backend en la respuesta, no la deduce
  // la pantalla: si alguna vez no coincidieran, un total en dolares dibujado
  // con el signo del peso es exactamente el error que hay que evitar.

  const [budgetInput, setBudgetInput] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);

  const alertedCategories = useRef(new Set());

  const fetchSummary = useCallback(async () => {
    try {
      const { data } = await api.get('/transactions/summary', {
        params: { month: selectedMonth, ...(cuenta === 'todo' ? {} : { currency: cuenta }) },
      });
      setSummary(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedMonth, cuenta]);

  const fetchTransactions = useCallback(async (category = null) => {
    setTxLoading(true);
    try {
      const params = { month: selectedMonth, limit: 60 };
      if (category) params.category = category;
      if (cuenta !== 'todo') params.currency = cuenta;
      const { data } = await api.get('/transactions', { params });
      setTransactions(data.transactions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setTxLoading(false);
    }
  }, [selectedMonth, cuenta]);

  // Que cuentas tiene de verdad esta persona. Sin esto habria que mostrarle un
  // selector de moneda a alguien que solo opera en pesos, y eso es ruido para
  // la mayoria; para quien tiene las dos, es lo primero que busca.
  const fetchCuentas = useCallback(async () => {
    try {
      const { data } = await api.get('/transactions/accounts');
      setCuentas(data.accounts || []);
    } catch (_) { setCuentas([]); }
  }, []);

  const fetchUpcomingBills = useCallback(async () => {
    try {
      const { data } = await api.get('/bills');
      const upcoming = (data.bills || [])
        .map((b) => ({ ...b, daysLeft: daysUntilDue(b.due_day) }))
        .filter((b) => b.daysLeft <= 7)
        .sort((a, b) => a.daysLeft - b.daysLeft);
      setUpcomingBills(upcoming);
    } catch (_) {}
  }, []);

  const fetchBudgets = useCallback(async () => {
    try {
      const { data } = await api.get('/budgets');
      const map = {};
      (data.budgets || []).forEach((b) => { map[b.category] = parseFloat(b.amount); });
      setBudgets(map);
    } catch (_) {}
  }, []);

  const saveBudget = async () => {
    const amount = parseFloat(budgetInput);
    if (!amount || amount < 1) return;
    setSavingBudget(true);
    try {
      await api.post('/budgets', { category: budgetModal.category, amount });
      setBudgets((prev) => ({ ...prev, [budgetModal.category]: amount }));
      setBudgetModal(null);
      setBudgetInput('');
    } catch (err) {
      const detail = err.response?.data?.detail || err.response?.data?.error || err.message;
      Toast.show({ type: 'error', text1: t('dashboard.errorSaveBudget'), text2: detail });
    } finally {
      setSavingBudget(false);
    }
  };

  const removeBudget = async () => {
    try {
      await api.delete(`/budgets/${encodeURIComponent(budgetModal.category)}`);
      setBudgets((prev) => { const n = { ...prev }; delete n[budgetModal.category]; return n; });
      setBudgetModal(null);
      setBudgetInput('');
    } catch (_) {
      Toast.show({ type: 'error', text1: t('dashboard.errorDeleteBudget') });
    }
  };

  // `cuenta` va en las dependencias: sin eso, cambiar de pesos a dolares
  // recreaba los fetch pero no volvia a ejecutarlos, asi que el selector se
  // movia y la pantalla seguia mostrando los numeros de la otra cuenta.
  //
  // EL SPINNER DE PANTALLA COMPLETA ES SOLO PARA LA PRIMERA CARGA. Ponerlo en
  // cada cambio de cuenta o de mes desmonta la pantalla entera y la vuelve a
  // montar: eso es el parpadeo. Cambiar de cuenta no es cargar la app de nuevo,
  // es pasar de una vista a otra, y se lee como transicion o se lee como que
  // algo se rompio.
  useEffect(() => {
    const primera = primeraCarga.current;
    primeraCarga.current = false;

    if (primera) setLoading(true);
    // 0.62 y no 0.45: bajar mas se lee como que la pantalla se apaga. Y con
    // curva, no lineal — una opacidad que baja a ritmo constante se nota como
    // un efecto; con salida acelerada se nota como movimiento.
    else Animated.timing(fade, {
      toValue: 0.62, duration: 120, easing: Easing.in(Easing.quad), useNativeDriver: true,
    }).start();

    (async () => {
      // allSettled y no all: si UNO de estos rechaza, `all` corta y el fade
      // nunca vuelve a 1 — la pantalla queda al 45% de opacidad para siempre.
      // Que falle una parte no puede dejar la vista a medio encender.
      await Promise.allSettled([
        fetchSummary(),
        fetchTransactions(selectedCategory),
        fetchBudgets(),
        fetchCuentas(),
        fetchUpcomingBills(),
      ]);
      // Vuelve mas lento de lo que se fue: una entrada suave se lee como que el
      // contenido llego, y una salida rapida evita que se vea el dato viejo.
      if (!primera) Animated.timing(fade, {
        toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start();
    })();
  }, [selectedMonth, cuenta]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchSummary();
    fetchTransactions(selectedCategory);
  };

  const handleCategoryTap = (cat) => {
    const next = selectedCategory === cat ? null : cat;
    setSelectedCategory(next);
    fetchTransactions(next);
  };

  const deleteTransaction = (id) => {
    Alert.alert(t('dashboard.deleteTitle'), t('dashboard.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          await api.delete(`/transactions/${id}`);
          setTransactions((prev) => prev.filter((tx) => tx.id !== id));
          fetchSummary();
        },
      },
    ]);
  };

  const openCreate = () => {
    setEditingId(null);
    // Arranca en la moneda de la cuenta que se esta mirando: si estas viendo la
    // cuenta en dolares y tocas "+", lo que vas a cargar es casi seguro un
    // movimiento en dolares. En "Todo" no hay respuesta obvia, asi que pesos.
    setForm({ ...EMPTY_FORM, currency: cuenta === 'todo' ? 'UYU' : cuenta });
    setShowCatInput(false);
    setNewCatInput('');
    setModalVisible(true);
  };

  const openEdit = (tx) => {
    setEditingId(tx.id);
    setForm({
      type: tx.type,
      amount: String(parseFloat(tx.amount)),
      currency: tx.currency || 'UYU',
      description: tx.description,
      category: tx.category || 'Otros',
      date: tx.date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    });
    setShowCatInput(false);
    setNewCatInput('');
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingId(null);
    setShowCatInput(false);
    setNewCatInput('');
  };

  const addCustomCategory = () => {
    const cat = newCatInput.trim();
    if (!cat) return;
    if (![...DEFAULT_CATEGORIES, ...customCategories].includes(cat)) {
      setCustomCategories((prev) => [...prev, cat]);
    }
    setForm((f) => ({ ...f, category: cat }));
    setNewCatInput('');
    setShowCatInput(false);
  };

  const saveTransaction = async () => {
    if (!form.amount || !form.description.trim()) {
      return Toast.show({ type: 'error', text1: t('dashboard.errorFields') });
    }
    setSaving(true);
    try {
      const payload = {
        date: form.date,
        description: form.description.trim(),
        amount: parseFloat(form.amount),
        type: form.type,
        category: form.category,
        currency: form.currency,
      };
      if (editingId) {
        const { data } = await api.patch(`/transactions/${editingId}`, payload);
        setTransactions((prev) => prev.map((x) => (x.id === editingId ? data.transaction : x)));
        Toast.show({ type: 'success', text1: t('dashboard.successUpdate') });
      } else {
        await api.post('/transactions', payload);
        Toast.show({
          type: 'success',
          text1: form.type === 'debit' ? t('dashboard.successExpense') : t('dashboard.successIncome'),
        });
        // Si lo cargado es de OTRA cuenta que la que se esta mirando, saltar a
        // esa. Sin esto el movimiento se guarda bien y desaparece de la lista
        // —queda filtrado— y parece que no se guardo.
        if (cuenta !== 'todo' && form.currency !== cuenta) setCuenta(form.currency);
        else fetchTransactions(selectedCategory);
      }
      closeModal();
      fetchSummary();
      // La lista de cuentas cambia al cargar el PRIMER movimiento en dolares:
      // sin esto el selector no aparece hasta recargar la app.
      fetchCuentas();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || t('dashboard.errorSave') });
    } finally {
      setSaving(false);
    }
  };

  // Avisa cuando una categoría supera su presupuesto, una vez por categoría por
  // sesión — si no, el toast salta en cada refresh y se vuelve ruido.
  useEffect(() => {
    if (!summary || Object.keys(budgets).length === 0) return;
    (summary.byCategory || []).forEach((cat) => {
      const limit = budgets[cat.category];
      const spent = parseFloat(cat.total_spent);
      if (!limit || spent <= limit) return;
      if (alertedCategories.current.has(cat.category)) return;
      alertedCategories.current.add(cat.category);
      const over = (spent - limit).toLocaleString('es-UY', { maximumFractionDigits: 0 });
      Toast.show({
        type: 'error',
        text1: t('dashboard.budgetExceeded', { cat: cat.category }),
        text2: t('dashboard.budgetExceededDetail', {
          over, limit: limit.toLocaleString('es-UY', { maximumFractionDigits: 0 }),
        }),
        visibilityTime: 5000,
      });
    });
  }, [summary, budgets]);

  const changeMonth = (delta) => {
    alertedCategories.current.clear();
    const [year, month] = selectedMonth.split('-').map(Number);
    const d = new Date(year, month - 1 + delta);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setSelectedCategory(null);
    setLoading(true);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Distingue "esta cuenta esta vacia" de "todavia no cargaste nada": son

  // dos situaciones distintas y merecen dos mensajes distintos.

  const cuentaVaciaPeroHayOtra = cuenta !== 'todo'

    && cuentas.length > 0

    && !cuentas.some((c) => c.currency === cuenta);

  const monedaVista = summary?.currency || 'UYU';

  const totalSpent = parseFloat(summary?.totals?.total_spent || 0);
  const totalIncome = parseFloat(summary?.totals?.total_income || 0);
  const balance = totalIncome - totalSpent;
  const firstName = user?.name?.split(' ')[0] || '';
  const iniciales = (user?.name || '?')
    .split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase();

  const expenseRows = summary?.byCategory?.filter((c) => parseFloat(c.total_spent) > 0)?.slice(0, 8) || [];
  const incomeRows = summary?.byCategory?.filter((c) => parseFloat(c.total_income) > 0)?.slice(0, 8) || [];

  // ── Datos del gráfico ────────────────────────────────────────────
  //
  // `monthlyTrend` ya venía en /transactions/summary y se estaba tirando: la
  // pantalla mostraba dos tortas del mes actual y nunca la evolución.
  const trend = (summary?.monthlyTrend || []).slice(-5);

  const barrasMes = trend.map((m) => {
    const [y, mm] = m.month.split('-');
    return {
      label: new Date(Number(y), Number(mm) - 1, 1)
        .toLocaleDateString('es-UY', { month: 'short' })
        .replace('.', ''),
      value: parseFloat(m.spent) || 0,
      active: m.month === selectedMonth,
    };
  });

  // El modo "Cat" conserva lo que mostraban las tortas: el desglose del mes.
  const barrasCat = expenseRows.slice(0, 5).map((c) => ({
    label: (c.category || 'Otros').slice(0, 4),
    value: parseFloat(c.total_spent) || 0,
    active: selectedCategory === c.category,
  }));

  const barras = chartMode === 'mes' ? barrasMes : barrasCat;

  // Variación contra el mes anterior. Sólo se muestra cuando hay dos meses con
  // datos: un "+100%" contra un mes vacío no informa nada.
  const variacion = (() => {
    if (trend.length < 2) return null;
    const actual = parseFloat(trend[trend.length - 1].spent) || 0;
    const previo = parseFloat(trend[trend.length - 2].spent) || 0;
    if (previo <= 0) return null;
    return Math.round(((actual - previo) / previo) * 1000) / 10;
  })();

  const sinDatos = expenseRows.length === 0 && incomeRows.length === 0 && transactions.length === 0;
  const categoriasDisponibles = [...DEFAULT_CATEGORIES, ...customCategories];

  return (
    <View style={styles.root}>
      <Glow />
      <RefreshBadge refreshing={refreshing} />

      <Animated.View style={{ flex: 1, opacity: fade }}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="transparent"
            colors={['transparent']}
          />
        }
      >
        {/* Idioma y salir viven ACA, a la derecha del nombre. Antes eran una
            fila propia debajo del encabezado, y una fila entera para dos cosas
            que casi nunca se tocan es alto perdido en la primera pantalla —
            justo donde hay que entender que hacer. */}
        <ScreenHeader
          title={firstName ? `Hola, ${firstName}` : 'MoneyFlow'}
          subtitle={t('dashboard.heroSubtitle')}
          initials={iniciales}
          card={false}
          titleBadge={
            // PREMIUM: solo el diamante, sin pastilla ni gradiente. Es un
            // estado, no algo que haya que tocar, y al lado del nombre una
            // pastilla dorada le gana la mirada al nombre.
            //
            // GRATIS es otra cosa: ahi la marca SI invita a tocar —es la unica
            // entrada al paywall desde el inicio— asi que sigue siendo una
            // pastilla, chica y apagada.
            isPremium ? (
              <Ionicons name="diamond" size={13} color={COLORS.premium} />
            ) : (
              <Pressable onPress={() => showUpgrade()} hitSlop={8}>
                <Badge
                  variant={isTrial ? 'streak' : 'statusMuted'}
                  icon={isTrial ? 'timer-outline' : 'lock-closed'}
                  label={isTrial ? `${trialDays}d` : t('premium.freeBadge')}
                />
              </Pressable>
            )
          }
          actions={
            <>
              {/* Sin palabra el de salir: dos etiquetas al lado del nombre no
                  entran en un telefono angosto, y el nombre es lo que tiene que
                  sobrevivir. El lector de pantalla lo sigue nombrando.

                  ACA HABIA UN ESCUDO que abria la hoja "Seguridad y datos", y se
                  saco por pedido. La hoja sigue existiendo y sigue estando a un
                  toque desde Movimientos, que es donde alguien que esta por
                  entregar el resumen de su banco realmente se lo pregunta. */}
              <Button
                label={lang === 'es' ? 'EN' : 'ES'}
                variant="ghost"
                size="sm"
                onPress={toggleLanguage}
              />
              <Button
                label=""
                variant="ghost"
                size="sm"
                icon="log-out-outline"
                a11yLabel={t('common.logout')}
                onPress={logout}
              />
            </>
          }
        />

        {/* SELECTOR DE CUENTA, SIEMPRE VISIBLE.
            Antes solo aparecia si ya habia movimientos en las dos monedas, y eso
            lo volvia inencontrable: no podias mirar tu cuenta en dolares hasta
            no tener dolares cargados, ni enterarte de que la vista existia.
            Mirar una cuenta vacia es una respuesta valida —"no tengo nada aca"—
            y ademas es donde uno entiende que puede cargar algo.

            "Todo" convierte a pesos con la cotizacion del dia de cada
            movimiento; las otras dos muestran la cuenta en SU moneda, sin
            convertir nada. */}
        <Segmented
          options={[
            { value: 'UYU', label: '$ Pesos' },
            { value: 'USD', label: 'US$ Dólares' },
            { value: 'todo', label: 'Todo' },
          ]}
          value={cuenta}
          onChange={setCuenta}
          style={{ marginTop: SPACING.m }}
        />


        {/* Selector de mes */}
        <View style={styles.monthRow}>
          <Pressable onPress={() => changeMonth(-1)} style={({ pressed }) => [styles.monthArrow, pressed && styles.pressed]}>
            <Ionicons name="chevron-back" size={18} color={COLORS.textHigh} />
          </Pressable>
          <Txt variant="h2" style={styles.monthTxt}>{formatMonth(selectedMonth)}</Txt>
          <Pressable onPress={() => changeMonth(1)} style={({ pressed }) => [styles.monthArrow, pressed && styles.pressed]}>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textHigh} />
          </Pressable>
        </View>

        {/* Balance */}
        {totalIncome > 0 ? (
          <Card variant="raised" style={styles.bloque}>
            {/* El monto va en hueso, no en verde: el color del dato se reserva
                para las cajas de ingresos y egresos, que son las que tienen
                signo. Un balance positivo pintado de verde compite con ellas. */}
            <View style={styles.balanceHead}>
              <Txt variant="overline" color={COLORS.textLow}>{t('dashboard.monthlyBalance')}</Txt>
              {variacion !== null ? (
                <Badge
                  variant={variacion <= 0 ? 'best' : 'discount'}
                  icon={variacion <= 0 ? 'trending-down' : 'trending-up'}
                  label={`${variacion > 0 ? '+' : ''}${String(variacion).replace('.', ',')}%`}
                />
              ) : null}
            </View>
            <Txt style={styles.balance}>
              {balance >= 0 ? '' : '−'}{formatMoney(Math.abs(balance), monedaVista)}
            </Txt>
            <View style={styles.balanceMetrics}>
              <View style={styles.balanceMetric}>
                <Txt variant="caption" color={COLORS.textLow}>{t('dashboard.incomeLabel')}</Txt>
                <Txt style={[styles.metricValue, { color: COLORS.income }]}>+{formatMoney(totalIncome, monedaVista)}</Txt>
              </View>
              <View style={styles.balanceMetric}>
                <Txt variant="caption" color={COLORS.textLow}>{t('dashboard.expensesLabel')}</Txt>
                <Txt style={[styles.metricValue, { color: COLORS.expense }]}>−{formatMoney(totalSpent, monedaVista)}</Txt>
              </View>
            </View>
          </Card>
        ) : totalSpent > 0 ? (
          <Card variant="raised" label={t('dashboard.totalExpenses')} style={styles.bloque}>
            <Txt style={[styles.balance, { color: COLORS.expense }]}>{formatMoney(totalSpent, monedaVista)}</Txt>
          </Card>
        ) : null}

        {barras.length > 0 ? (
          <BarChart
            data={barras}
            mode={chartMode}
            onModeChange={setChartMode}
            style={styles.bloque}
          />
        ) : null}

        {/* Sin movimientos no hay nada que desglosar: el titulo solo dejaria un
            encabezado colgando arriba del estado vacio. */}
        <View style={[styles.seccionHead, sinDatos && { display: 'none' }]}>
          <Txt variant="h2" style={styles.seccionTitulo}>{t('dashboard.breakdown')}</Txt>
          {selectedCategory ? (
            <Pressable onPress={() => handleCategoryTap(selectedCategory)} hitSlop={8}>
              <Txt variant="caption" color={COLORS.textHigh}>{t('dashboard.clearFilter')}</Txt>
            </Pressable>
          ) : null}
        </View>

        {/* Categorías — tocar filtra las transacciones */}
        {expenseRows.length > 0 || incomeRows.length > 0 ? (
          <Card>
            {summary.byCategory.map((cat, i) => (
              <CategoryRow
                key={i}
                cat={cat}
                currency={monedaVista}
                total={totalSpent}
                totalIncome={totalIncome}
                active={selectedCategory === cat.category}
                onPress={() => handleCategoryTap(cat.category)}
                budget={budgets[cat.category] ?? null}
                onSetBudget={() => {
                  setBudgetInput(budgets[cat.category] ? String(budgets[cat.category]) : '');
                  setBudgetModal({ category: cat.category });
                }}
              />
            ))}
            {selectedCategory ? (
              <Button
                label={t('dashboard.clearFilter')}
                variant="ghost"
                size="sm"
                icon="close-circle-outline"
                onPress={() => handleCategoryTap(null)}
                style={{ alignSelf: 'flex-start', marginTop: SPACING.s }}
              />
            ) : null}
          </Card>
        ) : null}

        {/* Transacciones */}
        {transactions.length > 0 || txLoading ? (
          <Card style={styles.bloque}>
            <View style={styles.cardHead}>
              <Txt variant="overline" color={COLORS.textLow}>
                {selectedCategory ? selectedCategory : t('dashboard.transactions')}
              </Txt>
              <Badge variant="statusMuted" label={String(transactions.length)} />
            </View>
            {/* El spinner solo cuando no hay NADA que mostrar. Si ya hay filas,
                se quedan mientras llegan las nuevas: cambiarlas por un spinner
                durante 300 ms es el mismo parpadeo, en chico. */}
            {txLoading && transactions.length === 0 ? (
              <ActivityIndicator color={COLORS.primary} style={{ marginVertical: SPACING.m }} />
            ) : (
              transactions.map((tx) => (
                <TxRow
                  key={tx.id}
                  tx={tx}
                  onEdit={() => openEdit(tx)}
                  onDelete={() => deleteTransaction(tx.id)}
                />
              ))
            )}
          </Card>
        ) : null}

        {/* Próximos vencimientos */}
        {upcomingBills.length > 0 ? (
          <Card style={styles.bloque}>
            <View style={styles.cardHead}>
              <Txt variant="overline" color={COLORS.textLow}>{t('dashboard.upcomingBills')}</Txt>
              <Badge variant="statusMuted" label={String(upcomingBills.length)} />
            </View>
            {upcomingBills.map((bill) => {
              const urgente = bill.daysLeft <= 3;
              const tono = urgente ? COLORS.error : COLORS.warning;
              return (
                <View key={bill.id} style={styles.billRow}>
                  <View style={[styles.billDot, { backgroundColor: tono }]} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="caption" color={COLORS.textHigh} style={styles.billName}>{bill.name}</Txt>
                    {bill.amount ? (
                      <Txt style={styles.billAmount}>{formatUYU(parseFloat(bill.amount))}</Txt>
                    ) : null}
                  </View>
                  <Txt variant="caption" color={tono} style={styles.billDays}>
                    {bill.daysLeft === 0 ? t('dashboard.dueToday')
                      : bill.daysLeft === 1 ? t('dashboard.dueTomorrow')
                      : t('dashboard.dueInDays', { n: bill.daysLeft })}
                  </Txt>
                </View>
              );
            })}
          </Card>
        ) : null}

        {/* "No hay datos" a secas seria mentira estando parado en una cuenta
            vacia mientras la otra tiene movimientos: lo que falta es de ESTA
            cuenta. */}
        {/* Con la pantalla vacía, describir dónde está el botón es peor que
            darlo: es el momento exacto en que la persona no sabe qué hacer, y
            es cuando menos ganas tiene de buscar. */}
        {sinDatos ? (
          <EmptyState
            icon="document-text-outline"
            title={cuentaVaciaPeroHayOtra
              ? (cuenta === 'USD' ? 'Sin movimientos en dólares' : 'Sin movimientos en pesos')
              : t('dashboard.noData')}
            text={cuentaVaciaPeroHayOtra
              ? 'Podés cargar uno con el botón de abajo, o subir el resumen de esa cuenta.'
              : t('dashboard.noDataHint')}
            actionLabel={t('dashboard.newTransaction')}
            actionIcon="add"
            onAction={openCreate}
            style={styles.bloque}
          />
        ) : null}

        {/* Aire para la tab bar flotante Y para el boton de agregar, que queda
            por encima de ella: con 110 el ultimo bloque se escondia debajo. */}
        <View style={{ height: 172 }} />
      </ScrollView>
      </Animated.View>

      {/* LA ACCION PRINCIPAL DE LA PANTALLA, donde se la busca.
          Va FUERA del Animated.View que hace el cruce de opacidad al cambiar de
          cuenta: el contenido puede bajar a 45% mientras llegan los numeros
          nuevos, pero el boton de agregar no puede parpadear — es lo unico que
          tiene que estar siempre, sobre todo cuando la pantalla esta vacia y no
          hay ningun otro lugar donde empezar. */}
      <FloatingAction icon="add" a11yLabel={t('dashboard.newTransaction')} onPress={openCreate} />

      {/* Alta / edición de movimiento */}
      <BottomSheet
        visible={modalVisible}
        onClose={closeModal}
        title={editingId ? t('dashboard.editTransaction') : t('dashboard.newTransaction')}
        subtitle="Se suma al mes que estás viendo"
        primaryLabel={editingId ? t('common.edit') : t('common.save')}
        onPrimary={saveTransaction}
        primaryLoading={saving}
        secondaryLabel={t('common.cancel')}
      >
        <Segmented
          options={[
            { value: 'debit', label: t('dashboard.typeExpense') },
            { value: 'credit', label: t('dashboard.typeIncome') },
          ]}
          value={form.type}
          onChange={(v) => setForm((f) => ({ ...f, type: v }))}
          tone={form.type === 'debit' ? COLORS.expense : COLORS.income}
          style={{ marginBottom: SPACING.m }}
        />

        {/* La moneda va ANTES del importe, no despues: se elige al empezar a
            escribir el numero, no cuando ya lo escribiste pensando en otra. */}
        <Segmented
          options={[
            { value: 'UYU', label: '$ Pesos' },
            { value: 'USD', label: 'US$ Dólares' },
          ]}
          value={form.currency}
          onChange={(v) => setForm((f) => ({ ...f, currency: v }))}
          style={{ marginBottom: SPACING.s }}
        />

        <Input
          money
          value={form.amount}
          onChangeText={(v) => setForm((f) => ({ ...f, amount: v }))}
          placeholder={t('dashboard.amountPlaceholder')}
          keyboardType="numeric"
          style={{ marginBottom: SPACING.s }}
        />
        <Input
          icon="create-outline"
          value={form.description}
          onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
          placeholder={t('dashboard.descPlaceholder')}
          style={{ marginBottom: SPACING.s }}
        />
        <Input
          icon="calendar-outline"
          value={form.date}
          onChangeText={(v) => setForm((f) => ({ ...f, date: v }))}
          placeholder={t('dashboard.datePlaceholder')}
          style={{ marginBottom: SPACING.m }}
        />

        <Txt variant="overline" color={COLORS.textLow} style={{ marginBottom: SPACING.s }}>
          {t('common.category')}
        </Txt>
        <View style={styles.catChips}>
          {categoriasDisponibles.map((cat) => (
            <Chip
              key={cat}
              label={cat}
              active={form.category === cat}
              onPress={() => setForm((f) => ({ ...f, category: cat }))}
            />
          ))}
          <Chip
            label={t('common.new')}
            icon="add"
            active={showCatInput}
            onPress={() => setShowCatInput((v) => !v)}
          />
        </View>

        {showCatInput ? (
          <View style={styles.newCatRow}>
            <Input
              icon="pricetag-outline"
              value={newCatInput}
              onChangeText={setNewCatInput}
              placeholder={t('dashboard.categoryPlaceholder')}
              autoFocus
              onSubmitEditing={addCustomCategory}
              returnKeyType="done"
              style={{ flex: 1 }}
            />
            <Button label={t('common.add')} size="sm" onPress={addCustomCategory} />
          </View>
        ) : null}
      </BottomSheet>

      {/* Presupuesto por categoría */}
      <BottomSheet
        visible={!!budgetModal}
        onClose={() => setBudgetModal(null)}
        title={t('dashboard.setBudget')}
        subtitle={budgetModal?.category}
        primaryLabel={t('common.save')}
        onPrimary={saveBudget}
        primaryLoading={savingBudget}
        secondaryLabel={budgets[budgetModal?.category] ? t('common.remove') : t('common.cancel')}
        onSecondary={budgets[budgetModal?.category] ? removeBudget : undefined}
      >
        <Input
          money
          value={budgetInput}
          onChangeText={setBudgetInput}
          placeholder={t('dashboard.budgetPlaceholder')}
          keyboardType="numeric"
          autoFocus
        />
      </BottomSheet>

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  content: { paddingHorizontal: SPACING.m, paddingTop: 60 },
  bloque: { marginTop: SPACING.m },
  pressed: { opacity: 0.75 },


  monthRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: RADIUS.full,
    padding: 5,
    marginTop: SPACING.m,
  },
  monthArrow: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: COLORS.surfaceSunken,
    alignItems: 'center', justifyContent: 'center',
  },
  monthTxt: { flex: 1, textAlign: 'center' },

  balanceHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  balance: { fontFamily: FONTS.amountBold, fontSize: 38, lineHeight: 40, letterSpacing: -1, color: COLORS.textHigh },
  seccionHead: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginTop: SPACING.l, marginBottom: 9,
  },
  seccionTitulo: { fontSize: 15 },
  balanceMetrics: { flexDirection: 'row', marginTop: SPACING.m, gap: SPACING.s },
  balanceMetric: {
    flex: 1,
    backgroundColor: COLORS.surfaceSunken,
    borderRadius: RADIUS.m,
    padding: 12,
  },
  metricValue: { fontFamily: FONTS.amountBold, fontSize: 15, lineHeight: 19, marginTop: 3 },

  cardTitle: { marginBottom: SPACING.s },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.s },

  chartHead: { marginBottom: SPACING.m },
  chartTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.s },
  chartDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },

  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  catRowActive: { opacity: 1 },
  catIcon: {
    width: 30, height: 30, borderRadius: RADIUS.s,
    borderWidth: 1.5,
    backgroundColor: COLORS.surfaceSunken,
    alignItems: 'center', justifyContent: 'center',
    marginRight: SPACING.s,
  },
  catHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catName: { fontFamily: FONTS.semibold, flex: 1, marginRight: SPACING.s },
  catRight: { flexDirection: 'row', alignItems: 'center' },
  catAmount: { fontFamily: FONTS.amount, fontSize: 13, lineHeight: 16, color: COLORS.textHigh },

  txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  txIcon: {
    width: 38, height: 38, borderRadius: RADIUS.s + 2,
    borderWidth: 1.5,
    backgroundColor: COLORS.surfaceSunken,
    alignItems: 'center', justifyContent: 'center',
    marginRight: SPACING.s,
  },
  txInfo: { flex: 1, minWidth: 0 },
  txDesc: { fontFamily: FONTS.semibold },
  txMeta: { fontSize: 12, marginTop: 2 },
  txRight: { alignItems: 'flex-end', marginLeft: SPACING.s },
  txAmount: { fontFamily: FONTS.amountBold, fontSize: 14, lineHeight: 17 },

  billRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  billDot: { width: 8, height: 8, borderRadius: 4, marginRight: SPACING.s },
  billName: { fontFamily: FONTS.semibold },
  billAmount: { fontFamily: FONTS.amount, fontSize: 12, lineHeight: 16, color: COLORS.textLow, marginTop: 2 },
  billDays: { fontFamily: FONTS.bold, fontSize: 12 },

  catChips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.s },
  newCatRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s, marginTop: SPACING.s },
});
