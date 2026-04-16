import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Modal, RefreshControl, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, Animated, PanResponder,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useEntrance, useStaggerEntrance, usePressScale, useCountUp, useRingProgress } from '../utils/animations';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../api/client';
import { COLORS, SPACING, RADIUS, GRADIENT, SHADOWS } from '../theme';
import { useLanguage } from '../context/LanguageContext';

const GOAL_ICONS = [
  { icon: 'home-outline', label: 'Home' },
  { icon: 'car-outline', label: 'Car' },
  { icon: 'airplane-outline', label: 'Travel' },
  { icon: 'laptop-outline', label: 'Tech' },
  { icon: 'school-outline', label: 'Education' },
  { icon: 'heart-outline', label: 'Health' },
  { icon: 'cash-outline', label: 'Savings' },
  { icon: 'gift-outline', label: 'Gift' },
  { icon: 'trophy-outline', label: 'Goal' },
  { icon: 'star-outline', label: 'Other' },
];

function RingProgress({ progress, size = 64, stroke = 5, color = COLORS.primary }) {
  const animatedProgress = useRingProgress(progress);
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(animatedProgress, 1));

  return (
    <Svg width={size} height={size}>
      {/* Track */}
      <Circle
        cx={cx} cy={cy} r={r}
        stroke={COLORS.outlineVariant + '40'}
        strokeWidth={stroke}
        fill="none"
      />
      {/* Progress */}
      <Circle
        cx={cx} cy={cy} r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        rotation="-90"
        originX={cx}
        originY={cy}
      />
    </Svg>
  );
}

export default function GoalsScreen() {
  const { t } = useLanguage();
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [depositModal, setDepositModal] = useState(null);
  const [form, setForm] = useState({ name: '', target_amount: '', target_date: '', icon: 'trophy-outline' });
  const [depositAmount, setDepositAmount] = useState('');

  const panY = useRef(new Animated.Value(0)).current;
  const panYDeposit = useRef(new Animated.Value(0)).current;

  const makePan = (panVal, onClose) => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => g.dy > 5 && g.dy > Math.abs(g.dx),
    onPanResponderMove: (_, g) => { if (g.dy > 0) panVal.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 70 || g.vy > 0.6) { panVal.setValue(0); onClose(); }
      else Animated.spring(panVal, { toValue: 0, damping: 20, stiffness: 300, useNativeDriver: true }).start();
    },
  });

  const panResponder = useRef(
    makePan(panY, () => { setModalVisible(false); setForm({ name: '', target_amount: '', target_date: '', icon: 'trophy-outline' }); })
  ).current;

  const panResponderDeposit = useRef(
    makePan(panYDeposit, () => { setDepositModal(null); setDepositAmount(''); })
  ).current;

  const [spendingByCategory, setSpendingByCategory] = useState([]);

  const fetchGoals = useCallback(async () => {
    try {
      const { data } = await api.get('/goals');
      setGoals(data.goals);
    } catch (_) {
      Toast.show({ type: 'error', text1: t('goals.errorLoad') });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchSpending = useCallback(async () => {
    try {
      const { data } = await api.get('/transactions/summary');
      setSpendingByCategory(data.byCategory || []);
    } catch (_) {}
  }, []);

  useEffect(() => { fetchGoals(); fetchSpending(); }, [fetchGoals, fetchSpending]);

  const createGoal = async () => {
    if (!form.name.trim() || !form.target_amount) {
      return Toast.show({ type: 'error', text1: t('goals.errorCreate') });
    }
    try {
      const { data } = await api.post('/goals', {
        name: form.name.trim(),
        target_amount: parseFloat(form.target_amount),
        target_date: form.target_date || undefined,
      });
      setGoals(prev => [data.goal, ...prev]);
      setModalVisible(false);
      setForm({ name: '', target_amount: '', target_date: '', icon: 'trophy-outline' });
      Toast.show({ type: 'success', text1: t('goals.successCreate') });
    } catch (_) {
      Toast.show({ type: 'error', text1: t('goals.errorCreate') });
    }
  };

  const addDeposit = async () => {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) return Toast.show({ type: 'error', text1: t('goals.errorAmount') });

    const goal = goals.find(g => g.id === depositModal);
    const newAmount = parseFloat(goal.current_amount) + amount;

    try {
      const { data } = await api.patch(`/goals/${depositModal}`, {
        current_amount: newAmount,
        is_completed: newAmount >= parseFloat(goal.target_amount),
      });
      setGoals(prev => prev.map(g => g.id === depositModal ? data.goal : g));
      setDepositModal(null);
      setDepositAmount('');
      if (newAmount >= parseFloat(goal.target_amount)) {
        Toast.show({ type: 'success', text1: t('goals.successGoalReached') });
      } else {
        Toast.show({ type: 'success', text1: t('goals.successDeposit', { amount: amount.toLocaleString() }) });
      }
    } catch (_) {
      Toast.show({ type: 'error', text1: t('goals.errorUpdate') });
    }
  };

  const deleteGoal = (id, name) => {
    Alert.alert(t('goals.deleteTitle'), t('goals.deleteConfirm', { name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          await api.delete(`/goals/${id}`);
          setGoals(prev => prev.filter(g => g.id !== id));
        },
      },
    ]);
  };

  const heroAnim    = useEntrance({ delay: 0,   fromY: 24 });
  const summaryAnim = useEntrance({ delay: 100, fromY: 28 });
  const addCardAnim = useEntrance({ delay: 200, fromY: 20 });

  const active = goals.filter(g => !g.is_completed);
  const completed = goals.filter(g => g.is_completed);
  const totalSaved = goals.reduce((s, g) => s + parseFloat(g.current_amount), 0);
  const totalTarget = goals.reduce((s, g) => s + parseFloat(g.target_amount), 0);
  const overallProgress = totalTarget > 0 ? totalSaved / totalTarget : 0;
  const animatedTotalSaved = useCountUp(totalSaved, { duration: 1100, delay: 200 });

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={18} color={COLORS.primary} />
          </View>
          <Text style={styles.topBarTitle}>MoneyFlow</Text>
        </View>
        <Ionicons name="notifications-outline" size={22} color={COLORS.onSurfaceVariant} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchGoals(); }}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Hero */}
        <Animated.View style={[styles.hero, heroAnim.style]}>
          <Text style={styles.heroTitle}>{t('goals.heroTitle')}</Text>
          <Text style={styles.heroSubtitle}>{t('goals.heroSubtitle')}</Text>
        </Animated.View>

        {/* Summary card (only when there are goals) */}
        {goals.length > 0 && (
          <Animated.View style={[styles.summaryCard, summaryAnim.style]}>
            <View style={styles.summaryLeft}>
              <RingProgress progress={overallProgress} size={72} stroke={6} color={COLORS.secondary} />
              <View style={styles.ringOverlay}>
                <Text style={styles.ringPct}>{Math.round(overallProgress * 100)}%</Text>
              </View>
            </View>
            <View style={styles.summaryInfo}>
              <Text style={styles.summaryLabel}>{t('goals.totalSaved')}</Text>
              <Text style={styles.summaryValue}>${animatedTotalSaved.toLocaleString('es-UY', { maximumFractionDigits: 0 })}</Text>
              <View style={styles.summaryRow}>
                <View style={styles.summaryMeta}>
                  <Text style={styles.summaryMetaLabel}>{t('goals.target')}</Text>
                  <Text style={styles.summaryMetaValue}>${totalTarget.toLocaleString('es-UY', { maximumFractionDigits: 0 })}</Text>
                </View>
                <View style={styles.summaryMeta}>
                  <Text style={styles.summaryMetaLabel}>{t('goals.goals')}</Text>
                  <Text style={styles.summaryMetaValue}>{goals.length}</Text>
                </View>
                <View style={styles.summaryMeta}>
                  <Text style={styles.summaryMetaLabel}>{t('goals.done')}</Text>
                  <Text style={[styles.summaryMetaValue, { color: COLORS.secondary }]}>{completed.length}</Text>
                </View>
              </View>
            </View>
          </Animated.View>
        )}

        {/* Goal cards */}
        {active.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('goals.inProgress')}</Text>
            {active.map((goal, index) => (
              <GoalCard
                key={goal.id}
                index={index}
                goal={goal}
                spendingByCategory={spendingByCategory}
                onDeposit={() => setDepositModal(goal.id)}
                onDelete={() => deleteGoal(goal.id, goal.name)}
              />
            ))}
          </View>
        )}

        {completed.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('goals.completed')}</Text>
            {completed.map((goal, index) => (
              <GoalCard
                key={goal.id}
                index={index}
                goal={goal}
                onDeposit={() => {}}
                onDelete={() => deleteGoal(goal.id, goal.name)}
              />
            ))}
          </View>
        )}

        {/* Add new goal card */}
        <Animated.View style={addCardAnim.style}>
        <TouchableOpacity
          onPress={() => setModalVisible(true)}
          activeOpacity={0.75}
          style={styles.addCard}
        >
          <View style={styles.addIconBg}>
            <Ionicons name="add" size={24} color={COLORS.primary} />
          </View>
          <Text style={styles.addCardTitle}>{t('goals.addNew')}</Text>
          <Text style={styles.addCardHint}>{t('goals.addNewHint')}</Text>
        </TouchableOpacity>
        </Animated.View>

        {/* Bottom motivational card */}
        {goals.length > 0 && (
          <LinearGradient
            colors={GRADIENT.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.motiveCard}
          >
            <View style={styles.motiveRow}>
              <View>
                <Text style={styles.motiveTitle}>{t('goals.onTrack')}</Text>
                <Text style={styles.motiveSubtitle}>{t('goals.motiveSubtitle')}</Text>
              </View>
              <View style={styles.motiveIcon}>
                <Ionicons name="trending-up" size={28} color={COLORS.onPrimary} />
              </View>
            </View>
          </LinearGradient>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Modal crear meta */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Animated.View style={[styles.modalCard, { transform: [{ translateY: panY }] }]}>
            <View style={styles.modalHandleArea} {...panResponder.panHandlers}>
              <View style={styles.modalHandle} />
            </View>
            <Text style={styles.modalTitle}>{t('goals.newGoal')}</Text>

            <Text style={styles.inputLabel}>{t('common.category')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconScroll}>
              {GOAL_ICONS.map(({ icon, label }) => (
                <TouchableOpacity
                  key={icon}
                  onPress={() => setForm(f => ({ ...f, icon }))}
                  style={[styles.iconBtn, form.icon === icon && styles.iconBtnActive]}
                >
                  <Ionicons
                    name={icon}
                    size={22}
                    color={form.icon === icon ? COLORS.primary : COLORS.onSurfaceVariant}
                  />
                  <Text style={[styles.iconLabel, form.icon === icon && { color: COLORS.primary }]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.inputLabel}>{t('goals.goalName')}</Text>
            <View style={styles.inputRow}>
              <Ionicons name={form.icon} size={18} color={COLORS.outlineVariant} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('goals.namePlaceholder')}
                placeholderTextColor={COLORS.textMuted}
                value={form.name}
                onChangeText={v => setForm(f => ({ ...f, name: v }))}
                autoCapitalize="sentences"
              />
            </View>

            <Text style={styles.inputLabel}>{t('goals.targetAmount')}</Text>
            <View style={styles.inputRow}>
              <Text style={[styles.inputIcon, { color: COLORS.outlineVariant, fontSize: 16, fontWeight: '700' }]}>$</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor={COLORS.textMuted}
                value={form.target_amount}
                onChangeText={v => setForm(f => ({ ...f, target_amount: v }))}
                keyboardType="numeric"
              />
            </View>

            <Text style={styles.inputLabel}>{t('goals.targetDate')}</Text>
            <View style={styles.inputRow}>
              <Ionicons name="calendar-outline" size={18} color={COLORS.outlineVariant} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textMuted}
                value={form.target_date}
                onChangeText={v => setForm(f => ({ ...f, target_date: v }))}
              />
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelModalBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelModalText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={createGoal} activeOpacity={0.85} style={{ flex: 1 }}>
                <LinearGradient
                  colors={GRADIENT.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.confirmBtn}
                >
                  <Text style={styles.confirmText}>{t('goals.createGoal')}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal depositar */}
      <Modal visible={!!depositModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Animated.View style={[styles.modalCard, { transform: [{ translateY: panYDeposit }] }]}>
            <View style={styles.modalHandleArea} {...panResponderDeposit.panHandlers}>
              <View style={styles.modalHandle} />
            </View>
            <Text style={styles.modalTitle}>{t('goals.deposit')}</Text>
            <Text style={styles.modalSubtitle}>{t('goals.depositSubtitle')}</Text>

            <View style={styles.inputRow}>
              <Text style={[styles.inputIcon, { color: COLORS.outlineVariant, fontSize: 16, fontWeight: '700' }]}>$</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor={COLORS.textMuted}
                value={depositAmount}
                onChangeText={setDepositAmount}
                keyboardType="numeric"
                autoFocus
              />
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => { setDepositModal(null); setDepositAmount(''); }}
              >
                <Text style={styles.cancelModalText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={addDeposit} activeOpacity={0.85} style={{ flex: 1 }}>
                <LinearGradient
                  colors={GRADIENT.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.confirmBtn}
                >
                  <Text style={styles.confirmText}>{t('goals.depositBtn')}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const CAT_ICONS = {
  Supermercado: 'cart-outline', Restaurantes: 'restaurant-outline', Comida: 'fast-food-outline',
  Transporte: 'car-outline', Salud: 'medkit-outline', Streaming: 'play-circle-outline',
  Servicios: 'flash-outline', Deporte: 'barbell-outline', Entretenimiento: 'musical-notes-outline',
  Ropa: 'shirt-outline', Educación: 'school-outline', Vivienda: 'home-outline',
  Préstamos: 'cash-outline', Seguros: 'shield-checkmark-outline', Otros: 'ellipsis-horizontal-circle-outline',
};

// null = costos fijos / no accionables → se excluyen de sugerencias
// cut: 0-1 = proporción reducible. action = texto concreto a mostrar
// streaming usa lógica especial (cancelar 1 servicio, no porcentaje)
const CAT_STRATEGY = {
  Restaurantes:    { cut: 0.25, action: 'Cook 1 extra meal at home per week' },
  Comida:          { cut: 0.30, action: 'Meal prep for weekdays' },
  Supermercado:    { cut: 0.12, action: 'Plan meals and stick to a list' },
  Entretenimiento: { cut: 0.20, action: 'Mix paid and free activities' },
  Ropa:            { cut: 0.40, action: 'Buy only essentials this month' },
  Transporte:      { cut: 0.15, action: 'Use public transit more often' },
  Deporte:         { cut: 0.25, action: 'Try free workout alternatives' },
  Streaming:       { cut: 0.25, action: 'Downgrade plan or share with someone' },
  // Fixed costs — not actionable
  Servicios:    null,
  Salud:        null,
  Vivienda:     null,
  Préstamos:    null,
  Seguros:      null,
  Educación:    null,
  Salario:      null,
  Ingreso:      null,
  Transferencia: null,
  Otros:        null,
};

function GoalCard({ goal, onDeposit, onDelete, index = 0, spendingByCategory = [] }) {
  const { t } = useLanguage();
  const stagger    = useStaggerEntrance(index, { baseDelay: 80, fromY: 20 });
  const depositBtn = usePressScale(0.93);
  const [showPlan, setShowPlan] = useState(false);
  const planOpacity    = useRef(new Animated.Value(0)).current;
  const planTranslateY = useRef(new Animated.Value(-10)).current;

  const current  = parseFloat(goal.current_amount);
  const target   = parseFloat(goal.target_amount);
  const progress = Math.min(current / target, 1);
  const pct      = Math.round(progress * 100);
  const remaining = target - current;
  const daysLeft  = goal.target_date
    ? Math.max(0, Math.ceil((new Date(goal.target_date) - new Date()) / 86400000))
    : null;
  const monthlyNeeded = daysLeft && daysLeft > 0
    ? Math.ceil(remaining / (daysLeft / 30))
    : null;

  // Build top-3 actionable spending cuts
  const topCuts = spendingByCategory
    .filter(c => CAT_STRATEGY[c.category] != null && parseFloat(c.total_spent) > 0)
    .sort((a, b) => parseFloat(b.total_spent) - parseFloat(a.total_spent))
    .slice(0, 3)
    .map(c => {
      const spent    = parseFloat(c.total_spent);
      const strategy = CAT_STRATEGY[c.category];
      const savings  = Math.round(spent * strategy.cut);
      const label    = `+$${savings.toLocaleString()}/mo`;
      return { category: c.category, spent, action: strategy.action, savings, label };
    })
    .filter(c => c.savings > 0);

  const totalCuts        = topCuts.reduce((s, c) => s + c.savings, 0);
  const monthsBase       = monthlyNeeded && monthlyNeeded > 0 ? Math.ceil(remaining / monthlyNeeded) : null;
  const monthsWithCuts   = monthlyNeeded && totalCuts > 0
    ? Math.ceil(remaining / (monthlyNeeded + totalCuts))
    : null;
  const monthsFaster     = monthsBase && monthsWithCuts ? monthsBase - monthsWithCuts : null;

  const canShowPlan = !goal.is_completed && (monthlyNeeded || topCuts.length > 0);
  const ringColor   = goal.is_completed ? COLORS.secondary : COLORS.primary;

  const togglePlan = () => {
    if (!showPlan) {
      setShowPlan(true);
      planOpacity.setValue(0);
      planTranslateY.setValue(-10);
      Animated.parallel([
        Animated.timing(planOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
        Animated.spring(planTranslateY, { toValue: 0, damping: 20, stiffness: 300, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.timing(planOpacity, { toValue: 0, duration: 160, useNativeDriver: true })
        .start(() => setShowPlan(false));
    }
  };

  return (
    <Animated.View style={[styles.goalCard, goal.is_completed && styles.goalCardCompleted, stagger.style]}>
      <View style={styles.goalCardInner}>
        {/* Ring */}
        <View style={styles.ringContainer}>
          <RingProgress progress={progress} size={68} stroke={5} color={ringColor} />
          <View style={styles.ringCenter}>
            <Text style={[styles.ringPctSmall, { color: ringColor }]}>{pct}%</Text>
          </View>
        </View>

        {/* Info */}
        <View style={styles.goalInfo}>
          <View style={styles.goalHeaderRow}>
            <Text style={styles.goalName} numberOfLines={1}>{goal.name}</Text>
            <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <Ionicons name="trash-outline" size={15} color={COLORS.onSurfaceVariant + '80'} />
            </TouchableOpacity>
          </View>

          <View style={styles.goalAmounts}>
            <Text style={styles.goalCurrent}>
              ${current.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
            </Text>
            <Text style={styles.goalSep}> / </Text>
            <Text style={styles.goalTarget}>
              ${target.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
            </Text>
          </View>

          {goal.is_completed ? (
            <View style={styles.completedBadge}>
              <Ionicons name="checkmark-circle" size={12} color={COLORS.secondary} />
              <Text style={styles.completedText}>{t('goals.goalReached')}</Text>
            </View>
          ) : (
            <View style={styles.goalFooter}>
              <View>
                {monthlyNeeded && (
                  <Text style={styles.goalHint}>{t('goals.monthlyNeeded', { amount: monthlyNeeded.toLocaleString() })}</Text>
                )}
                {daysLeft !== null && (
                  <Text style={styles.goalDays}>{t('goals.daysLeft', { n: daysLeft })}</Text>
                )}
              </View>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                {canShowPlan && (
                  <TouchableOpacity onPress={togglePlan} style={styles.planBtn}>
                    <Ionicons
                      name={showPlan ? 'chevron-up' : 'trending-up-outline'}
                      size={13}
                      color={COLORS.secondary}
                    />
                    <Text style={styles.planBtnText}>{showPlan ? t('goals.planLess') : t('goals.planBtn')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.depositBtn}
                  onPress={onDeposit}
                  activeOpacity={1}
                  onPressIn={depositBtn.onPressIn}
                  onPressOut={depositBtn.onPressOut}
                >
                  <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: 4 }, depositBtn.style]}>
                    <Ionicons name="add" size={14} color={COLORS.onPrimary} />
                    <Text style={styles.depositText}>{t('common.add')}</Text>
                  </Animated.View>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* ── Expandable Savings Plan ─────────────────────────── */}
      {showPlan && (
        <Animated.View style={[styles.planSection, { opacity: planOpacity, transform: [{ translateY: planTranslateY }] }]}>
          <View style={styles.planDivider} />

          {/* Monthly / weekly / daily targets */}
          {monthlyNeeded && (
            <>
              <Text style={styles.planLabel}>{t('goals.savingsTarget')}</Text>
              <View style={styles.planChipsRow}>
                <View style={styles.planChip}>
                  <Text style={styles.planChipValue}>${monthlyNeeded.toLocaleString()}</Text>
                  <Text style={styles.planChipUnit}>{t('goals.perMonth')}</Text>
                </View>
                <View style={styles.planChip}>
                  <Text style={styles.planChipValue}>${Math.ceil(monthlyNeeded / 4.33).toLocaleString()}</Text>
                  <Text style={styles.planChipUnit}>{t('goals.perWeek')}</Text>
                </View>
                <View style={styles.planChip}>
                  <Text style={styles.planChipValue}>${Math.ceil(monthlyNeeded / 30).toLocaleString()}</Text>
                  <Text style={styles.planChipUnit}>{t('goals.perDay')}</Text>
                </View>
              </View>
            </>
          )}

          {/* Category cuts */}
          {topCuts.length > 0 && (
            <>
              <Text style={[styles.planLabel, { marginTop: SPACING.md }]}>{t('goals.whereToCut')}</Text>
              {topCuts.map(cut => (
                <View key={cut.category} style={styles.planCutRow}>
                  <View style={styles.planCutIconBox}>
                    <Ionicons
                      name={CAT_ICONS[cut.category] || 'ellipsis-horizontal-circle-outline'}
                      size={14}
                      color={COLORS.primary}
                    />
                  </View>
                  <View style={styles.planCutInfo}>
                    <Text style={styles.planCutCat}>{cut.category}</Text>
                    <Text style={styles.planCutAction}>{cut.action}</Text>
                  </View>
                  <Text style={styles.planCutSave}>{cut.label}</Text>
                </View>
              ))}

              {/* Impact callout */}
              {monthsFaster && monthsFaster > 0 && (
                <View style={styles.planImpact}>
                  <Ionicons name="rocket-outline" size={14} color={COLORS.secondary} />
                  <Text style={styles.planImpactText}>
                    <Text style={styles.planImpactBold}>{t('goals.planImpactText', { n: monthsFaster })}</Text>
                  </Text>
                </View>
              )}
            </>
          )}

          {topCuts.length === 0 && !monthlyNeeded && (
            <Text style={styles.planEmpty}>{t('goals.planEmpty')}</Text>
          )}
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },

  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: 56,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.background + 'CC',
  },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  topBarTitle: { fontSize: 18, fontWeight: '800', color: COLORS.onSurface, letterSpacing: -0.3 },

  content: { paddingHorizontal: SPACING.lg },

  // Hero
  hero: { marginBottom: SPACING.xl },
  heroTitle: { fontSize: 36, fontWeight: '800', color: COLORS.onSurface, letterSpacing: -0.5, marginBottom: SPACING.sm },
  heroSubtitle: { fontSize: 15, color: COLORS.onSurfaceVariant, lineHeight: 22 },

  // Summary card
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.xxl,
    padding: SPACING.md,
    marginBottom: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant + '30',
    ...SHADOWS.ambient,
    position: 'relative',
  },
  summaryLeft: { width: 72, height: 72, justifyContent: 'center', alignItems: 'center' },
  ringOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  ringPct: { fontSize: 12, fontWeight: '800', color: COLORS.secondary },
  summaryInfo: { flex: 1 },
  summaryLabel: { fontSize: 9, fontWeight: '700', color: COLORS.onSurfaceVariant, letterSpacing: 2, marginBottom: 2 },
  summaryValue: { fontSize: 24, fontWeight: '800', color: COLORS.onSurface, letterSpacing: -0.5, marginBottom: SPACING.sm },
  summaryRow: { flexDirection: 'row', gap: SPACING.md },
  summaryMeta: {},
  summaryMetaLabel: { fontSize: 10, color: COLORS.onSurfaceVariant, marginBottom: 1 },
  summaryMetaValue: { fontSize: 13, fontWeight: '700', color: COLORS.onSurface },

  // Section
  section: { marginBottom: SPACING.lg },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
    letterSpacing: 2,
    marginBottom: SPACING.md,
  },

  // Goal card
  goalCard: {
    backgroundColor: COLORS.surfaceContainerLow,
    borderRadius: RADIUS.xxl,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant + '25',
    overflow: 'hidden',
  },
  goalCardCompleted: {
    borderColor: COLORS.secondary + '40',
  },
  goalCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.md,
  },
  ringContainer: { width: 68, height: 68, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  ringCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  ringPctSmall: { fontSize: 11, fontWeight: '800' },

  goalInfo: { flex: 1 },
  goalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  goalName: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface, flex: 1, marginRight: SPACING.sm },
  goalAmounts: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 6 },
  goalCurrent: { fontSize: 17, fontWeight: '800', color: COLORS.onSurface },
  goalSep: { fontSize: 13, color: COLORS.onSurfaceVariant },
  goalTarget: { fontSize: 13, color: COLORS.onSurfaceVariant },

  completedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  completedText: { fontSize: 11, fontWeight: '700', color: COLORS.secondary },

  goalFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalHint: { fontSize: 11, color: COLORS.primary },
  goalDays: { fontSize: 11, color: COLORS.onSurfaceVariant, marginTop: 1 },
  depositBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primaryContainer,
    borderRadius: RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  depositText: { fontSize: 12, fontWeight: '700', color: COLORS.onPrimary },

  // Plan button (next to deposit)
  planBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.secondary + '50',
    backgroundColor: COLORS.secondary + '12',
  },
  planBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.secondary },

  // Savings plan section
  planSection: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
  },
  planDivider: {
    height: 1,
    backgroundColor: COLORS.outlineVariant + '30',
    marginBottom: SPACING.md,
  },
  planLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
    letterSpacing: 1.8,
    marginBottom: SPACING.sm,
  },
  planChipsRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: 2 },
  planChip: {
    flex: 1,
    backgroundColor: COLORS.surfaceContainerHigh,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.outlineVariant + '20',
  },
  planChipValue: { fontSize: 14, fontWeight: '800', color: COLORS.primary },
  planChipUnit: { fontSize: 10, color: COLORS.onSurfaceVariant, marginTop: 1 },

  // Cut rows
  planCutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant + '15',
  },
  planCutIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.primaryContainer + '30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  planCutInfo: { flex: 1 },
  planCutCat: { fontSize: 13, fontWeight: '600', color: COLORS.onSurface },
  planCutAction: { fontSize: 11, color: COLORS.onSurfaceVariant, marginTop: 2, lineHeight: 15 },
  planCutSave: { fontSize: 12, color: COLORS.secondary, fontWeight: '800' },

  // Impact callout
  planImpact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    padding: SPACING.sm,
    backgroundColor: COLORS.secondary + '12',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.secondary + '25',
  },
  planImpactText: { flex: 1, fontSize: 12, color: COLORS.onSurface, lineHeight: 17 },
  planImpactBold: { color: COLORS.secondary, fontWeight: '800' },
  planEmpty: { fontSize: 12, color: COLORS.onSurfaceVariant, fontStyle: 'italic', textAlign: 'center', paddingVertical: SPACING.sm },

  // Add card
  addCard: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    borderRadius: RADIUS.xxl,
    borderWidth: 2,
    borderColor: COLORS.outlineVariant + '40',
    borderStyle: 'dashed',
    backgroundColor: COLORS.surfaceContainerLowest,
    marginBottom: SPACING.xl,
    gap: SPACING.sm,
  },
  addIconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primaryContainer + '20',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
  },
  addCardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.onSurface },
  addCardHint: { fontSize: 13, color: COLORS.onSurfaceVariant },

  // Motivational card
  motiveCard: {
    borderRadius: RADIUS.xxl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.nebula,
  },
  motiveRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  motiveTitle: { fontSize: 18, fontWeight: '800', color: COLORS.onPrimary, marginBottom: 4 },
  motiveSubtitle: { fontSize: 13, color: COLORS.onPrimary + 'CC', lineHeight: 18 },
  motiveIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: COLORS.surfaceContainer,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: SPACING.lg,
    paddingBottom: 36,
  },
  modalHandleArea: { alignItems: 'center', paddingTop: SPACING.sm, paddingBottom: SPACING.md, marginBottom: SPACING.sm },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.outlineVariant,
  },
  modalTitle: { fontSize: 22, fontWeight: '800', color: COLORS.onSurface, marginBottom: 4 },
  modalSubtitle: { fontSize: 14, color: COLORS.onSurfaceVariant, marginBottom: SPACING.lg },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
    letterSpacing: 2,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
    marginLeft: 4,
  },
  iconScroll: { marginBottom: SPACING.sm },
  iconBtn: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: RADIUS.lg,
    marginRight: SPACING.xs,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 4,
  },
  iconBtnActive: {
    borderColor: COLORS.primary + '60',
    backgroundColor: COLORS.primary + '15',
  },
  iconLabel: { fontSize: 9, fontWeight: '600', color: COLORS.onSurfaceVariant, letterSpacing: 0.5 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  inputIcon: { marginRight: SPACING.sm },
  input: {
    flex: 1,
    paddingVertical: 14,
    color: COLORS.onSurface,
    fontSize: 15,
  },
  modalBtns: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.md },
  cancelModalBtn: {
    flex: 1,
    borderRadius: RADIUS.xxl,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant + '30',
  },
  cancelModalText: { color: COLORS.onSurfaceVariant, fontWeight: '600', fontSize: 15 },
  confirmBtn: {
    borderRadius: RADIUS.xxl,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmText: { color: COLORS.onPrimary, fontWeight: '700', fontSize: 15 },
});
