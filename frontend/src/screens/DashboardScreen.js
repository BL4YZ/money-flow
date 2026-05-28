import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, RefreshControl, Dimensions, Modal,
  TextInput, KeyboardAvoidingView, Platform, Alert, Animated, PanResponder,
} from 'react-native';
import { useEntrance, usePressScale } from '../utils/animations';
import { daysUntilDue } from '../utils/notifications';
import { PieChart, BarChart, LineChart } from 'react-native-chart-kit';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { usePlan } from '../context/PlanContext';
import { useLanguage } from '../context/LanguageContext';
import RefreshBadge from '../components/RefreshBadge';
import { COLORS, SPACING, RADIUS, GRADIENT, SHADOWS } from '../theme';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Color fijo por categoría — siempre el mismo sin importar el orden
const CATEGORY_COLORS = {
  // Ingresos — siempre verde
  Salario:         '#2ecc71',
  Ingreso:         '#27ae60',
  // Gastos — todos claramente distintos entre sí y del verde
  Supermercado:    '#a29bfe',   // lavender
  Restaurantes:    '#fd79a8',   // pink
  Comida:          '#e17055',   // orange-red
  Transporte:      '#54a0ff',   // blue
  Salud:           '#ff6b6b',   // red
  Streaming:       '#6c5ce7',   // deep purple
  Servicios:       '#fdcb6e',   // amber
  Deporte:         '#00cec9',   // teal
  Entretenimiento: '#e84393',   // magenta
  Ropa:            '#74b9ff',   // sky blue
  Educación:       '#8e44ad',   // violet
  Vivienda:        '#f39c12',   // orange
  Préstamos:       '#e74c3c',   // crimson
  Seguros:         '#1abc9c',   // emerald
  Transferencia:   '#95a5a6',   // gray
  Otros:           '#7f8c8d',   // dark gray
};

function categoryColor(name) {
  if (CATEGORY_COLORS[name]) return CATEGORY_COLORS[name];
  // Para categorías custom: hash simple del nombre → color del espectro
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 65%, 60%)`;
}

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
  'Supermercado','Restaurantes','Transporte','Salud','Streaming','Servicios',
  'Deporte','Entretenimiento','Ropa','Educación','Vivienda','Préstamos','Seguros','Salario','Transferencia','Otros',
];

function formatMonth(ym) {
  const [year, month] = ym.split('-');
  const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${names[parseInt(month) - 1]} ${year}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  // Tomar solo YYYY-MM-DD por si viene como timestamp completo de Postgres
  const clean = String(dateStr).slice(0, 10);
  const d = new Date(clean + 'T00:00:00');
  if (isNaN(d.getTime())) return clean;
  return d.toLocaleDateString('es-UY', { day: '2-digit', month: 'short' });
}

const chartConfig = {
  backgroundColor: 'transparent',
  backgroundGradientFrom: COLORS.surfaceContainer,
  backgroundGradientTo: COLORS.surfaceContainer,
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(205, 189, 255, ${opacity})`,
  labelColor: () => COLORS.onSurfaceVariant,
  style: { borderRadius: RADIUS.xl },
  propsForDots: { r: '4', strokeWidth: '2', stroke: COLORS.primary },
};

const EMPTY_FORM = {
  type: 'debit', amount: '', description: '', category: 'Otros',
  date: new Date().toISOString().slice(0, 10),
};

export default function DashboardScreen() {
  const { user, logout } = useAuth();
  const { t, lang, toggleLanguage } = useLanguage();
  const { isPremium, isTrial, trialDays, showUpgrade } = usePlan();
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [txLoading, setTxLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = crear, id = editar
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [expenseChartType, setExpenseChartType] = useState('pie');
  const [incomeChartType, setIncomeChartType] = useState('pie');
  const [customCategories, setCustomCategories] = useState([]);
  const [newCatInput, setNewCatInput] = useState('');
  const [showCatInput, setShowCatInput] = useState(false);
  const [upcomingBills, setUpcomingBills] = useState([]);
  const [budgets, setBudgets] = useState({});         // { category: amount }
  const [budgetModal, setBudgetModal] = useState(null); // { category } | null
  const [budgetInput, setBudgetInput] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);
  const alertedCategories = useRef(new Set());

  const panY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 5 && g.dy > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) panY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 70 || g.vy > 0.6) {
          panY.setValue(0);
          setModalVisible(false);
          setEditingId(null);
          setShowCatInput(false);
          setNewCatInput('');
        } else {
          Animated.spring(panY, {
            toValue: 0, damping: 20, stiffness: 300, useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

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
        .map(b => ({ ...b, daysLeft: daysUntilDue(b.due_day) }))
        .filter(b => b.daysLeft <= 7)
        .sort((a, b) => a.daysLeft - b.daysLeft);
      setUpcomingBills(upcoming);
    } catch (_) {}
  }, []);

  const fetchBudgets = useCallback(async () => {
    try {
      const { data } = await api.get('/budgets');
      const map = {};
      (data.budgets || []).forEach(b => { map[b.category] = parseFloat(b.amount); });
      setBudgets(map);
    } catch (_) {}
  }, []);

  const saveBudget = async () => {
    const amount = parseFloat(budgetInput);
    if (!amount || amount < 1) return;
    setSavingBudget(true);
    try {
      await api.post('/budgets', { category: budgetModal.category, amount });
      setBudgets(prev => ({ ...prev, [budgetModal.category]: amount }));
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
      setBudgets(prev => { const n = { ...prev }; delete n[budgetModal.category]; return n; });
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
          setTransactions(prev => prev.filter(tx => tx.id !== id));
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
    panY.setValue(0);
    setModalVisible(false);
    setEditingId(null);
    setShowCatInput(false);
    setNewCatInput('');
  };

  const addCustomCategory = () => {
    const cat = newCatInput.trim();
    if (!cat) return;
    if (![...DEFAULT_CATEGORIES, ...customCategories].includes(cat)) {
      setCustomCategories(prev => [...prev, cat]);
    }
    setForm(f => ({ ...f, category: cat }));
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
        setTransactions(prev => prev.map(t => t.id === editingId ? data.transaction : t));
        Toast.show({ type: 'success', text1: t('dashboard.successUpdate') });
      } else {
        await api.post('/transactions', payload);
        Toast.show({ type: 'success', text1: form.type === 'debit' ? t('dashboard.successExpense') : t('dashboard.successIncome') });
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

  // Alert when a category exceeds its budget (once per category per session)
  useEffect(() => {
    if (!summary || Object.keys(budgets).length === 0) return;
    (summary.byCategory || []).forEach(cat => {
      const limit = budgets[cat.category];
      const spent = parseFloat(cat.total_spent);
      if (!limit || spent <= limit) return;
      if (alertedCategories.current.has(cat.category)) return;
      alertedCategories.current.add(cat.category);
      const over = (spent - limit).toLocaleString('es-UY', { maximumFractionDigits: 0 });
      Toast.show({
        type: 'error',
        text1: t('dashboard.budgetExceeded', { cat: cat.category }),
        text2: t('dashboard.budgetExceededDetail', { over, limit: limit.toLocaleString('es-UY', { maximumFractionDigits: 0 }) }),
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

  const heroAnim    = useEntrance({ delay: 0,   fromY: 24 });
  const balanceAnim = useEntrance({ delay: 100, fromY: 28 });
  const chartsAnim  = useEntrance({ delay: 220, fromY: 24 });

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
  const firstName = user?.name?.split(' ')[0] || 'there';

  const expenseRows = summary?.byCategory
    ?.filter(c => parseFloat(c.total_spent) > 0)
    ?.slice(0, 8) || [];

  const incomeRows = summary?.byCategory
    ?.filter(c => parseFloat(c.total_income) > 0)
    ?.slice(0, 8) || [];

  const CHART_W = SCREEN_WIDTH - SPACING.lg * 2 - SPACING.md * 2;

  const makePieData = rows => rows.map(c => ({
    name: c.category || 'Otros',
    population: parseFloat(c.total_spent) || parseFloat(c.total_income),
    color: categoryColor(c.category || 'Otros'),
    legendFontColor: COLORS.onSurfaceVariant,
    legendFontSize: 11,
  }));

  const makeBarLineData = (rows, field) => rows.length > 0 ? {
    labels: rows.map(c => (c.category || 'Otros').slice(0, 5)),
    datasets: [{
      data: rows.map(c => parseFloat(c[field]) || 0),
      colors: rows.map(c => () => categoryColor(c.category || 'Otros')),
    }],
  } : null;


  return (
    <View style={styles.root}>
      <RefreshBadge refreshing={refreshing} />
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={18} color={COLORS.primary} />
          </View>
          <View>
            <Text style={styles.topBarTitle}>MoneyFlow</Text>
            <View style={styles.topBarSubRow}>
              <Text style={styles.topBarSub}>Hey, {firstName}</Text>
              <TouchableOpacity
                onPress={!isPremium ? () => showUpgrade() : undefined}
                activeOpacity={!isPremium ? 0.7 : 1}
                style={[
                  styles.planBadge,
                  isPremium && !isTrial && styles.planBadgePremium,
                  isTrial && styles.planBadgeTrial,
                ]}
              >
                <Ionicons
                  name={isTrial ? 'timer-outline' : isPremium ? 'diamond' : 'lock-closed'}
                  size={9}
                  color={isTrial ? COLORS.warning : isPremium ? COLORS.onPrimary : COLORS.onSurfaceVariant}
                  style={{ marginRight: 2 }}
                />
                <Text style={[
                  styles.planBadgeText,
                  isPremium && !isTrial && { color: COLORS.onPrimary },
                  isTrial && { color: COLORS.warning },
                ]}>
                  {isTrial
                    ? `${trialDays}d`
                    : isPremium ? t('premium.badge') : t('premium.freeBadge')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <View style={styles.topBarRight}>
          <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
            <Ionicons name="add" size={20} color={COLORS.onPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleLanguage} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Text style={{ color: COLORS.onSurfaceVariant, fontSize: 12, fontWeight: '700' }}>
              {lang === 'es' ? 'EN' : 'ES'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={logout} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Ionicons name="log-out-outline" size={22} color={COLORS.onSurfaceVariant} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="transparent" colors={['transparent']} />}
      >
        {/* Hero */}
        <Animated.View style={[styles.hero, heroAnim.style]}>
          <Text style={styles.heroTitle}>{t('dashboard.heroTitle')}</Text>
          <Text style={styles.heroSubtitle}>{t('dashboard.heroSubtitle')}</Text>
        </Animated.View>

        {/* Month selector */}
        <View style={styles.monthSelector}>
          <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthArrow}>
            <Ionicons name="chevron-back" size={18} color={COLORS.onSurface} />
          </TouchableOpacity>
          <Text style={styles.monthText}>{formatMonth(selectedMonth)}</Text>
          <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthArrow}>
            <Ionicons name="chevron-forward" size={18} color={COLORS.onSurface} />
          </TouchableOpacity>
        </View>

        {/* Balance hero card */}
        <Animated.View style={balanceAnim.style}>
        {totalIncome > 0 ? (
          <LinearGradient
            colors={balance >= 0 ? ['#0e2a1f', '#143d2b'] : ['#2a0e0e', '#3d1414']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.balanceCard}
          >
            <Text style={styles.balanceLabel}>{t('dashboard.monthlyBalance')}</Text>
            <Text style={[styles.balanceAmount, { color: balance >= 0 ? COLORS.secondary : COLORS.danger }]}>
              {balance >= 0 ? '+' : '-'}${Math.abs(balance).toLocaleString('es-UY', { maximumFractionDigits: 0 })}
            </Text>
            <View style={styles.balanceDivider} />
            <View style={styles.balanceMetrics}>
              <View style={styles.balanceMetric}>
                <Text style={styles.balanceMetricLabel}>{t('dashboard.incomeLabel')}</Text>
                <Text style={[styles.balanceMetricValue, { color: COLORS.secondary }]}>
                  +${totalIncome.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
                </Text>
              </View>
              <View style={styles.balanceMetric}>
                <Text style={styles.balanceMetricLabel}>{t('dashboard.expensesLabel')}</Text>
                <Text style={[styles.balanceMetricValue, { color: COLORS.danger }]}>
                  -${totalSpent.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
                </Text>
              </View>
            </View>
          </LinearGradient>
        ) : totalSpent > 0 ? (
          <View style={[styles.balanceCard, { backgroundColor: COLORS.surfaceContainer }]}>
            <Text style={styles.balanceLabel}>{t('dashboard.totalExpenses')}</Text>
            <Text style={[styles.balanceAmount, { color: COLORS.expense }]}>
              ${totalSpent.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
            </Text>
          </View>
        ) : null}
        </Animated.View>

        {/* Expenses chart */}
        <Animated.View style={chartsAnim.style}>
        {expenseRows.length > 0 && (
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
        )}

        {/* Income chart */}
        {incomeRows.length > 0 && (
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
        )}

        {/* Category breakdown — tappable para filtrar */}
        {(expenseRows.length > 0 || incomeRows.length > 0) && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('dashboard.breakdown')}</Text>
            {summary.byCategory.map((cat, i) => (
              <CategoryRow
                key={i}
                cat={cat}
                total={totalSpent}
                totalIncome={totalIncome}
                color={categoryColor(cat.category || 'Otros')}
                active={selectedCategory === cat.category}
                onPress={() => handleCategoryTap(cat.category)}
                budget={budgets[cat.category] ?? null}
                onSetBudget={() => {
                  setBudgetInput(budgets[cat.category] ? String(budgets[cat.category]) : '');
                  setBudgetModal({ category: cat.category });
                }}
              />
            ))}
            {selectedCategory && (
              <TouchableOpacity onPress={() => handleCategoryTap(null)} style={styles.clearFilter}>
                <Ionicons name="close-circle-outline" size={14} color={COLORS.primary} />
                <Text style={styles.clearFilterText}>{t('dashboard.clearFilter')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Transactions list */}
        {(transactions.length > 0 || txLoading) && (
          <View style={styles.card}>
            <View style={styles.txHeader}>
              <Text style={styles.cardTitle}>
                {selectedCategory ? selectedCategory : t('dashboard.transactions')}
              </Text>
              <Text style={styles.txCount}>{transactions.length}</Text>
            </View>

            {txLoading ? (
              <ActivityIndicator color={COLORS.primary} style={{ marginVertical: SPACING.md }} />
            ) : (
              transactions.map(tx => (
                <TxRow key={tx.id} tx={tx} onEdit={() => openEdit(tx)} onDelete={() => deleteTransaction(tx.id)} />
              ))
            )}
          </View>
        )}

        </Animated.View>

        {/* Upcoming bills */}
        {upcomingBills.length > 0 && (
          <View style={styles.card}>
            <View style={[styles.txHeader, { marginBottom: SPACING.md }]}>
              <Text style={styles.cardTitle}>{t('dashboard.upcomingBills')}</Text>
              <View style={styles.billsBadge}>
                <Text style={styles.billsBadgeText}>{upcomingBills.length}</Text>
              </View>
            </View>
            {upcomingBills.map(bill => {
              const urgent = bill.daysLeft <= 3;
              const color  = urgent ? COLORS.danger : '#f9a825';
              return (
                <View key={bill.id} style={styles.upcomingBillRow}>
                  <View style={[styles.upcomingBillDot, { backgroundColor: color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.upcomingBillName}>{bill.name}</Text>
                    {bill.amount && (
                      <Text style={styles.upcomingBillAmt}>
                        ${parseFloat(bill.amount).toLocaleString('es-UY', { maximumFractionDigits: 0 })}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.upcomingBillDays, { color }]}>
                    {bill.daysLeft === 0 ? t('dashboard.dueToday') : bill.daysLeft === 1 ? t('dashboard.dueTomorrow') : t('dashboard.dueInDays', { n: bill.daysLeft })}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Empty state */}
        {!loading && expenseRows.length === 0 && incomeRows.length === 0 && transactions.length === 0 && (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconBg}>
              <Ionicons name="document-text-outline" size={28} color={COLORS.primary} />
            </View>
            <Text style={styles.emptyText}>{t('dashboard.noData')}</Text>
            <Text style={styles.emptyHint}>{t('dashboard.noDataHint')}</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Modal crear / editar transacción */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Backdrop tap to close */}
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={closeModal}
          />

          {/* Card — fixed at bottom, slides with pan gesture */}
          <Animated.View style={[styles.modalCard, { transform: [{ translateY: panY }] }]}>
            <View style={styles.modalHandleArea} {...panResponder.panHandlers}>
              <View style={styles.modalHandle} />
            </View>
            <Text style={styles.modalTitle}>{editingId ? t('dashboard.editTransaction') : t('dashboard.newTransaction')}</Text>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <View style={styles.typeToggle}>
                <TouchableOpacity
                  style={[styles.typeBtn, form.type === 'debit' && styles.typeBtnExpense]}
                  onPress={() => setForm(f => ({ ...f, type: 'debit' }))}
                >
                  <Ionicons name="arrow-up" size={15} color={form.type === 'debit' ? '#fff' : COLORS.onSurfaceVariant} />
                  <Text style={[styles.typeBtnText, form.type === 'debit' && { color: '#fff' }]}>{t('dashboard.typeExpense')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeBtn, form.type === 'credit' && styles.typeBtnIncome]}
                  onPress={() => setForm(f => ({ ...f, type: 'credit' }))}
                >
                  <Ionicons name="arrow-down" size={15} color={form.type === 'credit' ? '#fff' : COLORS.onSurfaceVariant} />
                  <Text style={[styles.typeBtnText, form.type === 'credit' && { color: '#fff' }]}>{t('dashboard.typeIncome')}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputRow}>
                <Text style={styles.inputCurrency}>$</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('dashboard.amountPlaceholder')}
                  placeholderTextColor={COLORS.textMuted}
                  value={form.amount}
                  onChangeText={v => setForm(f => ({ ...f, amount: v }))}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.inputRow}>
                <Ionicons name="create-outline" size={16} color={COLORS.outlineVariant} style={{ marginRight: SPACING.sm }} />
                <TextInput
                  style={styles.input}
                  placeholder={t('dashboard.descPlaceholder')}
                  placeholderTextColor={COLORS.textMuted}
                  value={form.description}
                  onChangeText={v => setForm(f => ({ ...f, description: v }))}
                />
              </View>
              <View style={styles.inputRow}>
                <Ionicons name="calendar-outline" size={16} color={COLORS.outlineVariant} style={{ marginRight: SPACING.sm }} />
                <TextInput
                  style={styles.input}
                  placeholder={t('dashboard.datePlaceholder')}
                  placeholderTextColor={COLORS.textMuted}
                  value={form.date}
                  onChangeText={v => setForm(f => ({ ...f, date: v }))}
                />
              </View>

              <Text style={styles.catLabel}>{t('common.category')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.sm }}>
                {[...DEFAULT_CATEGORIES, ...customCategories].map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.catChip, form.category === cat && styles.catChipActive]}
                    onPress={() => setForm(f => ({ ...f, category: cat }))}
                  >
                    <Text style={[styles.catChipText, form.category === cat && styles.catChipTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[styles.catChip, styles.catChipNew]}
                  onPress={() => setShowCatInput(v => !v)}
                >
                  <Ionicons name="add" size={14} color={COLORS.secondary} />
                  <Text style={styles.catChipNewText}>{t('common.new')}</Text>
                </TouchableOpacity>
              </ScrollView>

              {showCatInput && (
                <View style={styles.newCatRow}>
                  <View style={[styles.inputRow, { flex: 1, marginBottom: 0 }]}>
                    <Ionicons name="pricetag-outline" size={15} color={COLORS.outlineVariant} style={{ marginRight: SPACING.sm }} />
                    <TextInput
                      style={styles.input}
                      placeholder={t('dashboard.categoryPlaceholder')}
                      placeholderTextColor={COLORS.textMuted}
                      value={newCatInput}
                      onChangeText={setNewCatInput}
                      autoFocus
                      onSubmitEditing={addCustomCategory}
                      returnKeyType="done"
                    />
                  </View>
                  <TouchableOpacity style={styles.addCatBtn} onPress={addCustomCategory}>
                    <Text style={styles.addCatBtnText}>{t('common.add')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>

            <View style={[styles.modalBtns, { marginTop: SPACING.md }]}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeModal}>
                <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveTransaction} disabled={saving} activeOpacity={0.85} style={{ flex: 1 }}>
                <LinearGradient
                  colors={GRADIENT.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                >
                  {saving
                    ? <ActivityIndicator size="small" color={COLORS.onPrimary} />
                    : <Text style={styles.saveBtnText}>{editingId ? t('common.edit') : t('common.save')}</Text>
                  }
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Budget modal */}
      <Modal
        visible={!!budgetModal}
        animationType="slide"
        transparent
        onRequestClose={() => setBudgetModal(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setBudgetModal(null)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t('dashboard.setBudget')}</Text>
            <Text style={[styles.modalSubtitle, { color: COLORS.onSurfaceVariant, marginBottom: SPACING.lg }]}>
              {budgetModal?.category}
            </Text>

            <View style={styles.inputRow}>
              <Text style={styles.inputCurrency}>$</Text>
              <TextInput
                style={styles.input}
                placeholder={t('dashboard.budgetPlaceholder')}
                placeholderTextColor={COLORS.textMuted}
                value={budgetInput}
                onChangeText={setBudgetInput}
                keyboardType="numeric"
                autoFocus
              />
            </View>

            <View style={[styles.modalBtns, { marginTop: SPACING.lg }]}>
              {budgets[budgetModal?.category] && (
                <TouchableOpacity style={[styles.cancelBtn, { borderColor: COLORS.danger + '50' }]} onPress={removeBudget}>
                  <Text style={[styles.cancelBtnText, { color: COLORS.danger }]}>{t('common.remove')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={saveBudget}
                disabled={savingBudget}
                activeOpacity={0.85}
                style={{ flex: 1 }}
              >
                <LinearGradient
                  colors={GRADIENT.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.saveBtn, savingBudget && { opacity: 0.6 }]}
                >
                  {savingBudget
                    ? <ActivityIndicator size="small" color={COLORS.onPrimary} />
                    : <Text style={styles.saveBtnText}>{t('common.save')}</Text>
                  }
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function ChartCard({ title, accentColor, rows, field, chartType, setChartType, chartW, makePieData, makeBarLineData }) {
  const pieData = makePieData(rows.map(c => ({
    ...c,
    total_spent: field === 'total_spent' ? c.total_spent : 0,
    total_income: field === 'total_income' ? c.total_income : 0,
  })));
  const barLineData = makeBarLineData(rows, field);

  const cfg = {
    ...chartConfig,
    color: (opacity = 1) => accentColor + Math.round(opacity * 255).toString(16).padStart(2, '0'),
  };

  return (
    <View style={styles.card}>
      <View style={styles.chartHeader}>
        <View style={styles.chartTitleRow}>
          <View style={[styles.chartDot, { backgroundColor: accentColor }]} />
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        <View style={styles.chartToggle}>
          {[
            { key: 'pie',  icon: 'pie-chart-outline' },
            { key: 'bar',  icon: 'bar-chart-outline' },
            { key: 'line', icon: 'trending-up-outline' },
          ].map(({ key, icon }) => (
            <TouchableOpacity
              key={key}
              onPress={() => setChartType(key)}
              style={[styles.chartToggleBtn, chartType === key && styles.chartToggleBtnActive]}
            >
              <Ionicons
                name={icon}
                size={16}
                color={chartType === key ? COLORS.primary : COLORS.onSurfaceVariant}
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {chartType === 'pie' && (
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
      )}

      {chartType === 'bar' && barLineData && (
        <BarChart
          data={barLineData}
          width={chartW}
          height={200}
          chartConfig={{ ...cfg, barPercentage: 0.65, fillShadowGradientOpacity: 1 }}
          style={{ borderRadius: RADIUS.xl, marginLeft: -SPACING.md }}
          showValuesOnTopOfBars
          withInnerLines={false}
          fromZero
          withCustomBarColorFromData
          flatColor
        />
      )}

      {chartType === 'line' && barLineData && (
        <LineChart
          data={barLineData}
          width={chartW}
          height={200}
          chartConfig={cfg}
          bezier
          style={{ borderRadius: RADIUS.xl, marginLeft: -SPACING.md }}
          withInnerLines={false}
          withDots
        />
      )}
    </View>
  );
}

function TxRow({ tx, onEdit, onDelete }) {
  const isDebit = tx.type === 'debit';
  const icon = CATEGORY_ICONS[tx.category] || CATEGORY_ICONS['Otros'];
  const press = usePressScale(0.975);

  return (
    <Animated.View style={press.style}>
    <TouchableOpacity
      onPress={onEdit}
      activeOpacity={1}
      style={styles.txRow}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <View style={[styles.txIcon, { backgroundColor: isDebit ? COLORS.expense + '18' : COLORS.income + '18' }]}>
        <Ionicons name={icon} size={16} color={isDebit ? COLORS.expense : COLORS.income} />
      </View>
      <View style={styles.txInfo}>
        <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>
        <Text style={styles.txMeta}>{formatDate(tx.date)} · {tx.category || 'Otros'}</Text>
      </View>
      <View style={styles.txRight}>
        <Text style={[styles.txAmount, { color: isDebit ? COLORS.expense : COLORS.income }]}>
          {isDebit ? '-' : '+'}${parseFloat(tx.amount).toLocaleString('es-UY', { maximumFractionDigits: 0 })}
        </Text>
        <View style={styles.txActions}>
          <TouchableOpacity onPress={onEdit} hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}>
            <Ionicons name="pencil-outline" size={13} color={COLORS.primary + 'AA'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}>
            <Ionicons name="trash-outline" size={13} color={COLORS.onSurfaceVariant + '60'} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
    </Animated.View>
  );
}

function CategoryRow({ cat, total, totalIncome, color, active, onPress, budget, onSetBudget }) {
  const { t } = useLanguage();
  const spent    = parseFloat(cat.total_spent);
  const income   = parseFloat(cat.total_income);
  const isIncome = spent === 0 && income > 0;
  const amount   = isIncome ? income : spent;
  const icon     = CATEGORY_ICONS[cat.category] || CATEGORY_ICONS['Otros'];

  // Budget state (expenses only)
  const rawBudgetPct = !isIncome && budget ? (spent / budget) * 100 : null;
  const isOver       = rawBudgetPct !== null && rawBudgetPct > 100;
  const overAmount   = isOver ? Math.round(spent - budget) : null;
  const budgetColor  = rawBudgetPct == null ? null
    : rawBudgetPct >= 100 ? COLORS.danger
    : rawBudgetPct >= 75  ? '#f9a825'
    : COLORS.secondary;

  // One bar: budget % if budget set, else % of total expenses
  const totalPct   = isIncome
    ? (totalIncome > 0 ? (income / totalIncome) * 100 : 0)
    : (total > 0 ? (spent / total) * 100 : 0);
  const barFill    = rawBudgetPct !== null ? Math.min(rawBudgetPct, 100) : Math.min(totalPct, 100);
  const barColor   = rawBudgetPct !== null ? budgetColor : (isIncome ? COLORS.income : color);
  const iconColor  = rawBudgetPct !== null ? budgetColor : (isIncome ? COLORS.income : color);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.catRow, active && styles.catRowActive]}
    >
      <View style={[styles.catIconBox, { backgroundColor: iconColor + '22' }]}>
        <Ionicons name={icon} size={14} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.catHeader}>
          <Text style={styles.catName}>{cat.category || 'Otros'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.catAmount, isIncome && { color: COLORS.income }, isOver && { color: COLORS.danger }]}>
              {isIncome ? '+' : ''}${amount.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
              {budget ? ` / $${budget.toLocaleString('es-UY', { maximumFractionDigits: 0 })}` : ''}
            </Text>
            {!isIncome && (
              <TouchableOpacity onPress={onSetBudget} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <Ionicons
                  name={budget ? 'wallet' : 'wallet-outline'}
                  size={13}
                  color={budget ? budgetColor : COLORS.onSurfaceVariant + '60'}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${barFill}%`, backgroundColor: barColor }]} />
        </View>

        {isOver && (
          <Text style={styles.overBudgetText}>
            +${overAmount.toLocaleString('es-UY', { maximumFractionDigits: 0 })} {t('dashboard.overLimit')}
          </Text>
        )}
      </View>
      {active && <Ionicons name="chevron-forward" size={14} color={iconColor} style={{ marginLeft: SPACING.sm }} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: SPACING.lg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },

  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingTop: 56, paddingBottom: SPACING.md,
    backgroundColor: COLORS.background + 'CC',
  },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  topBarSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant + '50',
  },
  planBadgePremium: {
    backgroundColor: COLORS.primaryContainer,
    borderColor: COLORS.primary + '40',
  },
  planBadgeTrial: {
    backgroundColor: COLORS.warning + '18',
    borderColor: COLORS.warning + '50',
  },
  planBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: COLORS.onSurfaceVariant,
    letterSpacing: 0.8,
  },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.outlineVariant,
  },
  topBarTitle: { fontSize: 16, fontWeight: '800', color: COLORS.onSurface, letterSpacing: -0.3 },
  topBarSub: { fontSize: 11, color: COLORS.onSurfaceVariant, marginTop: 1 },
  addBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: COLORS.primaryContainer,
    justifyContent: 'center', alignItems: 'center',
  },

  hero: { marginBottom: SPACING.xl },
  heroTitle: { fontSize: 36, fontWeight: '800', color: COLORS.onSurface, letterSpacing: -0.5, marginBottom: SPACING.sm },
  heroSubtitle: { fontSize: 15, color: COLORS.onSurfaceVariant, lineHeight: 22 },

  monthSelector: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.lg, marginBottom: SPACING.lg,
  },
  monthArrow: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center', alignItems: 'center',
  },
  monthText: { color: COLORS.onSurface, fontSize: 15, fontWeight: '700', minWidth: 150, textAlign: 'center' },

  balanceCard: {
    borderRadius: RADIUS.xxl, padding: SPACING.lg,
    marginBottom: SPACING.lg, borderWidth: 1,
    borderColor: COLORS.outlineVariant + '20', ...SHADOWS.ambient,
  },
  balanceLabel: { fontSize: 9, fontWeight: '700', color: COLORS.onSurfaceVariant, letterSpacing: 2, marginBottom: SPACING.sm },
  balanceAmount: { fontSize: 42, fontWeight: '800', letterSpacing: -1, marginBottom: SPACING.md },
  balanceDivider: { height: 1, backgroundColor: COLORS.outlineVariant + '30', marginBottom: SPACING.md },
  balanceMetrics: { flexDirection: 'row', gap: SPACING.xl },
  balanceMetric: {},
  balanceMetricLabel: { fontSize: 9, fontWeight: '700', color: COLORS.onSurfaceVariant, letterSpacing: 2, marginBottom: 3 },
  balanceMetricValue: { fontSize: 17, fontWeight: '800' },

  card: {
    backgroundColor: COLORS.surfaceContainer, borderRadius: RADIUS.xxl,
    padding: SPACING.md, marginBottom: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.outlineVariant + '20',
  },
  cardTitle: { color: COLORS.onSurface, fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  chartTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  chartDot: { width: 8, height: 8, borderRadius: 4 },
  chartToggle: { flexDirection: 'row', gap: 4, backgroundColor: COLORS.surfaceContainerHigh, borderRadius: RADIUS.lg, padding: 3 },
  chartToggleBtn: { width: 30, height: 30, borderRadius: RADIUS.md, justifyContent: 'center', alignItems: 'center' },
  chartToggleBtnActive: { backgroundColor: COLORS.surfaceContainerHighest },

  // Category rows
  catRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: SPACING.md, gap: SPACING.sm,
    borderRadius: RADIUS.lg, padding: 6, marginHorizontal: -6,
  },
  catRowActive: { backgroundColor: COLORS.primary + '10' },
  catIconBox: { width: 28, height: 28, borderRadius: RADIUS.sm, justifyContent: 'center', alignItems: 'center' },
  catHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  catName: { color: COLORS.onSurface, fontSize: 13 },
  catAmount: { color: COLORS.onSurface, fontSize: 13, fontWeight: '700' },
  progressBar: { height: 4, backgroundColor: COLORS.surfaceContainerHigh, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  overBudgetText: { fontSize: 10, color: COLORS.danger, fontWeight: '700', marginTop: 3 },
  clearFilter: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: SPACING.sm, justifyContent: 'center' },
  clearFilterText: { color: COLORS.primary, fontSize: 12, fontWeight: '600' },

  // Transaction list
  txHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  billsBadge: { backgroundColor: COLORS.danger + '20', borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 },
  billsBadgeText: { fontSize: 11, fontWeight: '800', color: COLORS.danger },
  upcomingBillRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: COLORS.outlineVariant + '15' },
  upcomingBillDot: { width: 8, height: 8, borderRadius: 4 },
  upcomingBillName: { fontSize: 13, fontWeight: '600', color: COLORS.onSurface },
  upcomingBillAmt: { fontSize: 11, color: COLORS.onSurfaceVariant, marginTop: 1 },
  upcomingBillDays: { fontSize: 13, fontWeight: '800' },
  txCount: {
    backgroundColor: COLORS.primary + '20', borderRadius: RADIUS.full,
    paddingHorizontal: 8, paddingVertical: 2,
    fontSize: 11, fontWeight: '700', color: COLORS.primary,
  },
  txRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.outlineVariant + '20',
  },
  txIcon: { width: 34, height: 34, borderRadius: RADIUS.md, justifyContent: 'center', alignItems: 'center' },
  txInfo: { flex: 1 },
  txDesc: { fontSize: 13, color: COLORS.onSurface, fontWeight: '500' },
  txMeta: { fontSize: 11, color: COLORS.onSurfaceVariant, marginTop: 2 },
  txRight: { alignItems: 'flex-end', gap: 4 },
  txAmount: { fontSize: 14, fontWeight: '700' },
  txActions: { flexDirection: 'row', gap: SPACING.md },

  // Empty
  emptyCard: { alignItems: 'center', paddingVertical: SPACING.xxl, marginBottom: SPACING.lg },
  emptyIconBg: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.primaryContainer + '15',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.primary + '30',
  },
  emptyText: { color: COLORS.onSurface, fontSize: 16, fontWeight: '700', marginBottom: SPACING.sm },
  emptyHint: { color: COLORS.onSurfaceVariant, fontSize: 13, textAlign: 'center' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalScroll: { maxHeight: '92%' },
  modalCard: {
    backgroundColor: COLORS.surfaceContainer, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: SPACING.lg, paddingBottom: 36,
  },
  modalHandleArea: { alignItems: 'center', paddingTop: SPACING.sm, paddingBottom: SPACING.md, marginBottom: SPACING.sm },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.outlineVariant },
  modalTitle: { fontSize: 22, fontWeight: '800', color: COLORS.onSurface, marginBottom: 4 },
  modalSubtitle: { fontSize: 14, color: COLORS.onSurfaceVariant },
  typeToggle: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  typeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: COLORS.surfaceContainerHigh, borderRadius: RADIUS.xl, paddingVertical: 12,
  },
  typeBtnExpense: { backgroundColor: COLORS.expense },
  typeBtnIncome: { backgroundColor: COLORS.income },
  typeBtnText: { color: COLORS.onSurfaceVariant, fontWeight: '700', fontSize: 14 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surfaceContainerLowest, borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md, marginBottom: SPACING.sm,
  },
  inputCurrency: { color: COLORS.outlineVariant, fontSize: 16, fontWeight: '700', marginRight: SPACING.sm },
  input: { flex: 1, paddingVertical: 13, color: COLORS.onSurface, fontSize: 15 },
  catLabel: { fontSize: 10, fontWeight: '700', color: COLORS.onSurfaceVariant, letterSpacing: 2, marginBottom: SPACING.sm, marginLeft: 4 },
  catChip: {
    backgroundColor: COLORS.surfaceContainerHigh, borderRadius: RADIUS.full,
    paddingHorizontal: 12, paddingVertical: 7, marginRight: SPACING.xs,
  },
  catChipActive: { backgroundColor: COLORS.primaryContainer },
  catChipText: { color: COLORS.onSurfaceVariant, fontSize: 13 },
  catChipTextActive: { color: COLORS.onPrimary, fontWeight: '700' },
  catChipNew: { borderWidth: 1, borderColor: COLORS.secondary + '50', backgroundColor: COLORS.secondary + '10', flexDirection: 'row', alignItems: 'center', gap: 3 },
  catChipNewText: { color: COLORS.secondary, fontSize: 13, fontWeight: '600' },
  newCatRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center', marginBottom: SPACING.sm },
  addCatBtn: { backgroundColor: COLORS.secondary, borderRadius: RADIUS.lg, paddingHorizontal: 14, paddingVertical: 13 },
  addCatBtnText: { color: COLORS.onSecondary, fontWeight: '700', fontSize: 14 },
  modalBtns: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.sm },
  cancelBtn: {
    flex: 1, borderRadius: RADIUS.xxl, paddingVertical: 16, alignItems: 'center',
    backgroundColor: COLORS.surfaceContainerLowest, borderWidth: 1, borderColor: COLORS.outlineVariant + '30',
  },
  cancelBtnText: { color: COLORS.onSurfaceVariant, fontWeight: '600', fontSize: 15 },
  saveBtn: { borderRadius: RADIUS.xxl, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { color: COLORS.onPrimary, fontWeight: '700', fontSize: 15 },
});
