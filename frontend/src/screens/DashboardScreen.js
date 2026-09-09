import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, ScrollView, StyleSheet, ActivityIndicator, Pressable,
  RefreshControl, Dimensions, Alert,
} from 'react-native';
import { PieChart, BarChart, LineChart } from 'react-native-chart-kit';
import Ionicons from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import api from '../api/client';
import { daysUntilDue } from '../utils/notifications';
import { useAuth } from '../context/AuthContext';
import { usePlan } from '../context/PlanContext';
import { useLanguage } from '../context/LanguageContext';
import RefreshBadge from '../components/RefreshBadge';
import {
  Txt, Card, Input, Chip, Segmented, Badge, Button, BottomSheet,
  EmptyState, ProgressBar, ScreenHeader, formatUYU,
} from '../components/ui';
import {
  COLORS, SPACING, RADIUS, FONTS, TYPE, categoryColor,
} from '../theme';

const SCREEN_WIDTH = Dimensions.get('window').width;

const CATEGORY_ICONS = {
  Supermercado: 'cart-outline',
  Restaurantes: 'restaurant-outline',
  Comida: 'fast-food-outline',
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
  Ingreso: 'trending-up-outline',
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

const chartConfig = {
  backgroundColor: 'transparent',
  backgroundGradientFrom: COLORS.surfaceRaised,
  backgroundGradientTo: COLORS.surfaceRaised,
  decimalPlaces: 0,
  color: () => COLORS.primary,
  labelColor: () => COLORS.textMid,
  style: { borderRadius: RADIUS.l },
  propsForDots: { r: '4', strokeWidth: '2', stroke: COLORS.primary },
};

const EMPTY_FORM = {
  type: 'debit', amount: '', description: '', category: 'Otros',
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
        </Txt>
      </View>
      <View style={styles.txRight}>
        <Txt style={[styles.txAmount, { color: esGasto ? COLORS.expense : COLORS.income }]}>
          {esGasto ? '−' : '+'}{formatUYU(parseFloat(tx.amount))}
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
function CategoryRow({ cat, total, totalIncome, active, onPress, budget, onSetBudget }) {
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
              {esIngreso ? '+' : ''}{formatUYU(monto)}
              {budget ? ` / ${formatUYU(budget)}` : ''}
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

/** Card de gráfico. El toggle usa Segmented para no ser un cuarto tipo de chip. */
function ChartCard({ title, accentColor, rows, field, chartType, setChartType, chartW, makePieData, makeBarLineData }) {
  const pieData = makePieData(rows.map((c) => ({
    ...c,
    total_spent: field === 'total_spent' ? c.total_spent : 0,
    total_income: field === 'total_income' ? c.total_income : 0,
  })));
  const barLineData = makeBarLineData(rows, field);
  const cfg = { ...chartConfig, color: () => accentColor };

  return (
    <Card variant="raised" style={styles.bloque}>
      <View style={styles.chartHead}>
        <View style={styles.chartTitleRow}>
          <View style={[styles.chartDot, { backgroundColor: accentColor }]} />
          <Txt variant="h2">{title}</Txt>
        </View>
        <Segmented
          options={[{ value: 'pie', label: 'Torta' }, { value: 'bar', label: 'Barras' }, { value: 'line', label: 'Línea' }]}
          value={chartType}
          onChange={setChartType}
        />
      </View>

      {chartType === 'pie' ? (
        <PieChart
          data={pieData}
          width={chartW}
          height={180}
          chartConfig={chartConfig}
          accessor="population"
          backgroundColor="transparent"
          paddingLeft="10"
          absolute={false}
        />
      ) : null}

      {chartType === 'bar' && barLineData ? (
        <BarChart
          data={barLineData}
          width={chartW}
          height={200}
          chartConfig={{ ...cfg, barPercentage: 0.65, fillShadowGradientOpacity: 1 }}
          style={{ borderRadius: RADIUS.l, marginLeft: -SPACING.m }}
          showValuesOnTopOfBars
          withInnerLines={false}
          fromZero
          withCustomBarColorFromData
          flatColor
        />
      ) : null}

      {chartType === 'line' && barLineData ? (
        <LineChart
          data={barLineData}
          width={chartW}
          height={200}
          chartConfig={cfg}
          bezier
          style={{ borderRadius: RADIUS.l, marginLeft: -SPACING.m }}
          withInnerLines={false}
          withDots
        />
      ) : null}
    </Card>
  );
}

export default function DashboardScreen() {
  const { user, logout } = useAuth();
  const { isPremium, isTrial, trialDays, showUpgrade } = usePlan();
  const { t, lang, toggleLanguage } = useLanguage();

  const [summary, setSummary] = useState(null);
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
  const [expenseChartType, setExpenseChartType] = useState('pie');
  const [incomeChartType, setIncomeChartType] = useState('pie');
  const [customCategories, setCustomCategories] = useState([]);
  const [newCatInput, setNewCatInput] = useState('');
  const [showCatInput, setShowCatInput] = useState(false);
  const [upcomingBills, setUpcomingBills] = useState([]);
  const [budgets, setBudgets] = useState({});          // { category: amount }
  const [budgetModal, setBudgetModal] = useState(null); // { category } | null
  const [budgetInput, setBudgetInput] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);

  const alertedCategories = useRef(new Set());

  const fetchSummary = useCallback(async () => {
    try {
      const { data } = await api.get('/transactions/summary', { params: { month: selectedMonth } });
      setSummary(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedMonth]);

  const fetchTransactions = useCallback(async (category = null) => {
    setTxLoading(true);
    try {
      const params = { month: selectedMonth, limit: 60 };
      if (category) params.category = category;
      const { data } = await api.get('/transactions', { params });
      setTransactions(data.transactions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setTxLoading(false);
    }
  }, [selectedMonth]);

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

  useEffect(() => {
    setLoading(true);
    fetchSummary();
    fetchTransactions(selectedCategory);
    fetchBudgets();
    fetchUpcomingBills();
  }, [selectedMonth]);

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
    setForm(EMPTY_FORM);
    setShowCatInput(false);
    setNewCatInput('');
    setModalVisible(true);
  };

  const openEdit = (tx) => {
    setEditingId(tx.id);
    setForm({
      type: tx.type,
      amount: String(parseFloat(tx.amount)),
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
        fetchTransactions(selectedCategory);
      }
      closeModal();
      fetchSummary();
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

  const totalSpent = parseFloat(summary?.totals?.total_spent || 0);
  const totalIncome = parseFloat(summary?.totals?.total_income || 0);
  const balance = totalIncome - totalSpent;
  const firstName = user?.name?.split(' ')[0] || '';
  const iniciales = (user?.name || '?')
    .split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase();

  const expenseRows = summary?.byCategory?.filter((c) => parseFloat(c.total_spent) > 0)?.slice(0, 8) || [];
  const incomeRows = summary?.byCategory?.filter((c) => parseFloat(c.total_income) > 0)?.slice(0, 8) || [];

  const CHART_W = SCREEN_WIDTH - SPACING.m * 2 - SPACING.m * 2;

  const makePieData = (rows) => rows.map((c) => ({
    name: c.category || 'Otros',
    population: parseFloat(c.total_spent) || parseFloat(c.total_income),
    color: categoryColor(c.category || 'Otros'),
    legendFontColor: COLORS.textMid,
    legendFontSize: 11,
  }));

  const makeBarLineData = (rows, field) => (rows.length > 0 ? {
    labels: rows.map((c) => (c.category || 'Otros').slice(0, 5)),
    datasets: [{
      data: rows.map((c) => parseFloat(c[field]) || 0),
      colors: rows.map((c) => () => categoryColor(c.category || 'Otros')),
    }],
  } : null);

  const sinDatos = expenseRows.length === 0 && incomeRows.length === 0 && transactions.length === 0;
  const categoriasDisponibles = [...DEFAULT_CATEGORIES, ...customCategories];

  return (
    <View style={styles.root}>
      <RefreshBadge refreshing={refreshing} />

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
        <ScreenHeader
          title={firstName ? `Hola, ${firstName}` : 'MoneyFlow'}
          subtitle={t('dashboard.heroSubtitle')}
          initials={iniciales}
          actionIcon="add"
          onActionPress={openCreate}
        />

        <View style={styles.utilRow}>
          {!isPremium ? (
            <Pressable onPress={() => showUpgrade()}>
              <Badge
                variant={isTrial ? 'streak' : 'statusMuted'}
                icon={isTrial ? 'timer-outline' : 'lock-closed'}
                label={isTrial ? `${trialDays}d` : t('premium.freeBadge')}
              />
            </Pressable>
          ) : (
            <Badge variant="premium" label={t('premium.badge')} />
          )}
          <View style={{ flex: 1 }} />
          <Button label={lang === 'es' ? 'EN' : 'ES'} variant="ghost" size="sm" onPress={toggleLanguage} />
          <Button label="Salir" variant="ghost" size="sm" icon="log-out-outline" onPress={logout} />
        </View>

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
          <Card variant="raised" label={t('dashboard.monthlyBalance')} style={styles.bloque}>
            <Txt style={[styles.balance, { color: balance >= 0 ? COLORS.income : COLORS.expense }]}>
              {balance >= 0 ? '+' : '−'}{formatUYU(Math.abs(balance))}
            </Txt>
            <View style={styles.balanceMetrics}>
              <View style={styles.balanceMetric}>
                <Txt variant="caption" color={COLORS.textLow}>{t('dashboard.incomeLabel')}</Txt>
                <Txt style={[styles.metricValue, { color: COLORS.income }]}>+{formatUYU(totalIncome)}</Txt>
              </View>
              <View style={styles.balanceMetric}>
                <Txt variant="caption" color={COLORS.textLow}>{t('dashboard.expensesLabel')}</Txt>
                <Txt style={[styles.metricValue, { color: COLORS.expense }]}>−{formatUYU(totalSpent)}</Txt>
              </View>
            </View>
          </Card>
        ) : totalSpent > 0 ? (
          <Card variant="raised" label={t('dashboard.totalExpenses')} style={styles.bloque}>
            <Txt style={[styles.balance, { color: COLORS.expense }]}>{formatUYU(totalSpent)}</Txt>
          </Card>
        ) : null}

        {expenseRows.length > 0 ? (
          <ChartCard
            title={t('dashboard.expenses')}
            accentColor={COLORS.expense}
            rows={expenseRows}
            field="total_spent"
            chartType={expenseChartType}
            setChartType={setExpenseChartType}
            chartW={CHART_W}
            makePieData={makePieData}
            makeBarLineData={makeBarLineData}
          />
        ) : null}

        {incomeRows.length > 0 ? (
          <ChartCard
            title={t('dashboard.income')}
            accentColor={COLORS.income}
            rows={incomeRows}
            field="total_income"
            chartType={incomeChartType}
            setChartType={setIncomeChartType}
            chartW={CHART_W}
            makePieData={makePieData}
            makeBarLineData={makeBarLineData}
          />
        ) : null}

        {/* Categorías — tocar filtra las transacciones */}
        {expenseRows.length > 0 || incomeRows.length > 0 ? (
          <Card style={styles.bloque}>
            <Txt variant="overline" color={COLORS.textLow} style={styles.cardTitle}>
              {t('dashboard.breakdown')}
            </Txt>
            {summary.byCategory.map((cat, i) => (
              <CategoryRow
                key={i}
                cat={cat}
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
            {txLoading ? (
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

        {sinDatos ? (
          <EmptyState
            icon="document-text-outline"
            title={t('dashboard.noData')}
            text={t('dashboard.noDataHint')}
            style={styles.bloque}
          />
        ) : null}

        {/* Aire para la tab bar flotante. */}
        <View style={{ height: 110 }} />
      </ScrollView>

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

  utilRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.s, gap: SPACING.xs },

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

  balance: { ...TYPE.display, fontSize: 38, lineHeight: 44 },
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
