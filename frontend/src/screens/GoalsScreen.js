import React, { useState, useEffect, useCallback } from 'react';
import {
  View, ScrollView, StyleSheet, Pressable, RefreshControl,
  ActivityIndicator, Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import api from '../api/client';
import { usePlan } from '../context/PlanContext';
import { useLanguage } from '../context/LanguageContext';
import RefreshBadge from '../components/RefreshBadge';
import {
  Txt, Card, Input, Button, Badge, BottomSheet, EmptyState,
  ProgressBar, ProgressRing, ScreenHeader, Glow, formatUYU,
} from '../components/ui';
import { COLORS, SPACING, RADIUS, FONTS } from '../theme';

const GOAL_ICONS = [
  'home-outline', 'car-outline', 'airplane-outline', 'laptop-outline',
  'school-outline', 'heart-outline', 'cash-outline', 'gift-outline',
  'trophy-outline', 'star-outline',
];

const FORM_VACIO = { name: '', target_amount: '', target_date: '', icon: 'trophy-outline' };

/**
 * Tarjeta de meta. La línea de proyección es lo más importante: "llegás en ~4
 * meses" responde la pregunta que trae al usuario, y el porcentaje sólo la
 * ilustra.
 */
function GoalCard({ goal, onDeposit, onDelete }) {
  const current = parseFloat(goal.current_amount);
  const target = parseFloat(goal.target_amount);
  const progress = Math.min(current / target, 1);
  const tono = goal.is_completed ? COLORS.income : COLORS.primary;

  // Los insights vienen calculados del backend.
  const ins = goal.insights;
  const proj = ins?.projection;
  const streak = ins?.streak || 0;
  const quota = ins?.monthlyQuota;
  const surplus = ins?.savingsSurplus || 0;

  const projText = (() => {
    if (goal.is_completed) return null;
    if (proj?.status === 'ok') {
      const m = proj.monthsLeft;
      if (m < 1) return 'Llegás en menos de 1 mes 🎉';
      if (m === 1) return 'Llegás en ~1 mes';
      return `Llegás en ~${m} meses`;
    }
    if (quota) return `Necesitás ${formatUYU(quota)}/mes para llegar`;
    return null;
  })();

  const subText = (() => {
    if (goal.is_completed || !projText) return null;
    if (proj?.status === 'ok' && quota) return `Ahorrando ${formatUYU(quota)}/mes llegarías antes`;
    if (proj?.status === 'ok') return `Ritmo actual: ${formatUYU(proj.avgPerMonth)}/mes`;
    return 'Hacé tu primer depósito para ver la proyección';
  })();

  return (
    <Card variant={goal.is_completed ? 'best' : 'base'} style={styles.goal}>
      <View style={styles.goalTop}>
        <ProgressRing value={progress} size="md" color={tono} />

        <View style={styles.goalInfo}>
          <View style={styles.goalHead}>
            <Txt variant="h2" style={styles.goalName} numberOfLines={1}>{goal.name}</Txt>
            {streak >= 3 ? <Badge variant="streak" label={`${streak}d`} /> : null}
            <View style={{ flex: 1 }} />
            <Pressable onPress={onDelete} hitSlop={8}>
              <Ionicons name="trash-outline" size={15} color={COLORS.textLow} />
            </Pressable>
          </View>

          <View style={styles.goalAmounts}>
            <Txt style={[styles.goalCurrent, { color: tono }]}>{formatUYU(current)}</Txt>
            <Txt variant="caption" color={COLORS.textLow} style={styles.goalSep}> de </Txt>
            <Txt style={styles.goalTarget}>{formatUYU(target)}</Txt>
          </View>
        </View>
      </View>

      <ProgressBar value={current} max={target} color={tono} style={{ marginTop: SPACING.s }} />

      {goal.is_completed ? (
        <View style={styles.completada}>
          <Ionicons name="checkmark-circle" size={14} color={COLORS.income} />
          <Txt variant="caption" color={COLORS.income} style={{ marginLeft: 6 }}>
            ¡Meta alcanzada! 🎉
          </Txt>
        </View>
      ) : (
        <View style={styles.goalBottom}>
          <View style={{ flex: 1, marginRight: SPACING.s }}>
            {projText ? (
              <>
                <Txt variant="caption" color={COLORS.textHigh} style={styles.proj}>{projText}</Txt>
                {subText ? (
                  <Txt variant="caption" color={COLORS.textLow} style={{ marginTop: 2 }}>{subText}</Txt>
                ) : null}
              </>
            ) : (
              <Txt variant="caption" color={COLORS.textLow}>
                Hacé tu primer depósito para ver cuándo llegás
              </Txt>
            )}
            {surplus > 0 ? (
              <Txt variant="caption" color={COLORS.income} style={{ marginTop: 4 }}>
                💡 Ahorrás {formatUYU(surplus)} extra este mes
              </Txt>
            ) : null}
          </View>
          <Button label="Ahorrar" size="sm" icon="add" onPress={onDeposit} />
        </View>
      )}
    </Card>
  );
}

export default function GoalsScreen() {
  const { t } = useLanguage();
  const { isPremium, showUpgrade } = usePlan();

  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [depositModal, setDepositModal] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [depositAmount, setDepositAmount] = useState('');
  const [saving, setSaving] = useState(false);

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

  useEffect(() => { fetchGoals(); }, [fetchGoals]);

  const createGoal = async () => {
    if (!form.name.trim() || !form.target_amount) {
      return Toast.show({ type: 'error', text1: t('goals.errorCreate') });
    }
    setSaving(true);
    try {
      const { data } = await api.post('/goals', {
        name: form.name.trim(),
        target_amount: parseFloat(form.target_amount),
        target_date: form.target_date || undefined,
      });
      setGoals((prev) => [data.goal, ...prev]);
      setModalVisible(false);
      setForm(FORM_VACIO);
      Toast.show({ type: 'success', text1: t('goals.successCreate') });
    } catch (_) {
      Toast.show({ type: 'error', text1: t('goals.errorCreate') });
    } finally {
      setSaving(false);
    }
  };

  const addDeposit = async () => {
    // Formato uruguayo: "3.000" usa el punto como separador de miles.
    const normalizado = depositAmount.trim().replace(/\./g, '').replace(',', '.');
    const amount = parseFloat(normalizado);
    if (!amount || amount <= 0) return Toast.show({ type: 'error', text1: t('goals.errorAmount') });

    setSaving(true);
    try {
      const { data } = await api.post(`/goals/${depositModal}/deposits`, { amount });
      setGoals((prev) => prev.map((g) => (g.id === depositModal ? data.goal : g)));
      setDepositModal(null);
      setDepositAmount('');
      Toast.show({
        type: 'success',
        text1: data.completed
          ? t('goals.successGoalReached')
          : t('goals.successDeposit', { amount: amount.toLocaleString('es-UY') }),
      });
    } catch (_) {
      Toast.show({ type: 'error', text1: t('goals.errorUpdate') });
    } finally {
      setSaving(false);
    }
  };

  const deleteGoal = (id, name) => {
    Alert.alert(t('goals.deleteTitle'), t('goals.deleteConfirm', { name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          await api.delete(`/goals/${id}`);
          setGoals((prev) => prev.filter((g) => g.id !== id));
        },
      },
    ]);
  };

  const activas = goals.filter((g) => !g.is_completed);
  const completadas = goals.filter((g) => g.is_completed);
  const totalSaved = goals.reduce((s, g) => s + parseFloat(g.current_amount), 0);
  const totalTarget = goals.reduce((s, g) => s + parseFloat(g.target_amount), 0);
  const overall = totalTarget > 0 ? totalSaved / totalTarget : 0;
  const bloqueado = !isPremium && goals.length >= 1;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Glow />
      <RefreshBadge refreshing={refreshing} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchGoals(); }}
            tintColor="transparent"
            colors={['transparent']}
          />
        }
      >
        <ScreenHeader
          title={t('goals.heroTitle')}
          subtitle={t('goals.heroSubtitle')}
          actionIcon={bloqueado ? 'lock-closed' : 'add'}
          onActionPress={() => (bloqueado ? showUpgrade('goals') : setModalVisible(true))}
        />

        {goals.length > 0 ? (
          <Card variant="raised" style={styles.bloque}>
            <View style={styles.resumen}>
              <ProgressRing value={overall} size="lg" color={COLORS.accent} label="ahorrado" />
              <View style={styles.resumenInfo}>
                <Txt variant="overline" color={COLORS.textLow}>{t('goals.totalSaved')}</Txt>
                <Txt style={styles.resumenTotal}>{formatUYU(totalSaved)}</Txt>
                <View style={styles.resumenMetas}>
                  <View style={styles.resumenMeta}>
                    <Txt variant="caption" color={COLORS.textLow}>{t('goals.target')}</Txt>
                    <Txt style={styles.resumenValor}>{formatUYU(totalTarget)}</Txt>
                  </View>
                  <View style={styles.resumenMeta}>
                    <Txt variant="caption" color={COLORS.textLow}>{t('goals.done')}</Txt>
                    <Txt style={[styles.resumenValor, { color: COLORS.income }]}>{completadas.length}</Txt>
                  </View>
                </View>
              </View>
            </View>
          </Card>
        ) : null}

        {activas.length > 0 ? (
          <>
            <Txt variant="overline" color={COLORS.textLow} style={styles.seccion}>
              {t('goals.inProgress')}
            </Txt>
            {activas.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onDeposit={() => setDepositModal(goal.id)}
                onDelete={() => deleteGoal(goal.id, goal.name)}
              />
            ))}
          </>
        ) : null}

        {completadas.length > 0 ? (
          <>
            <Txt variant="overline" color={COLORS.textLow} style={styles.seccion}>
              {t('goals.completed')}
            </Txt>
            {completadas.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onDeposit={() => {}}
                onDelete={() => deleteGoal(goal.id, goal.name)}
              />
            ))}
          </>
        ) : null}

        {goals.length === 0 ? (
          <EmptyState
            icon="trophy-outline"
            title={t('goals.addNew')}
            text={t('goals.addNewHint')}
            actionLabel={t('goals.addNew')}
            actionIcon="add"
            onAction={() => setModalVisible(true)}
            style={styles.bloque}
          />
        ) : bloqueado ? (
          <Card variant="locked" label="Premium" style={styles.bloque}>
            <Txt variant="h2" style={{ marginBottom: 6 }}>{t('goals.addNew')}</Txt>
            <Txt variant="body" color={COLORS.textMid} style={{ marginBottom: SPACING.m }}>
              {t('premium.upgradeNudgeGoals')}
            </Txt>
            <Button
              label={t('premium.ctaBtn')}
              variant="premiumLocked"
              icon="diamond-outline"
              onPress={() => showUpgrade('goals')}
            />
          </Card>
        ) : (
          <Button
            label={t('goals.addNew')}
            variant="secondary"
            icon="add"
            fullWidth
            onPress={() => setModalVisible(true)}
            style={styles.bloque}
          />
        )}

        {/* Aire para la tab bar flotante. */}
        <View style={{ height: 110 }} />
      </ScrollView>

      {/* Nueva meta */}
      <BottomSheet
        visible={modalVisible}
        onClose={() => { setModalVisible(false); setForm(FORM_VACIO); }}
        title={t('goals.addNew')}
        subtitle={t('goals.addNewHint')}
        primaryLabel={t('common.save')}
        onPrimary={createGoal}
        primaryLoading={saving}
      >
        <Txt variant="overline" color={COLORS.textLow} style={{ marginBottom: SPACING.s }}>
          Icono
        </Txt>
        <View style={styles.iconos}>
          {GOAL_ICONS.map((icon) => (
            <Pressable
              key={icon}
              onPress={() => setForm((f) => ({ ...f, icon }))}
              style={[styles.iconoBtn, form.icon === icon && styles.iconoBtnActivo]}
            >
              <Ionicons
                name={icon}
                size={20}
                color={form.icon === icon ? COLORS.textHigh : COLORS.textMid}
              />
            </Pressable>
          ))}
        </View>

        <Input
          icon="flag-outline"
          value={form.name}
          onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
          placeholder={t('goals.namePlaceholder')}
          style={{ marginTop: SPACING.m, marginBottom: SPACING.s }}
        />
        <Input
          money
          value={form.target_amount}
          onChangeText={(v) => setForm((f) => ({ ...f, target_amount: v }))}
          placeholder={t('goals.targetPlaceholder')}
          keyboardType="numeric"
          style={{ marginBottom: SPACING.s }}
        />
        <Input
          icon="calendar-outline"
          value={form.target_date}
          onChangeText={(v) => setForm((f) => ({ ...f, target_date: v }))}
          placeholder={t('goals.datePlaceholder')}
        />
      </BottomSheet>

      {/* Depósito */}
      <BottomSheet
        visible={!!depositModal}
        onClose={() => { setDepositModal(null); setDepositAmount(''); }}
        title="Ahorrar"
        subtitle="Se suma a lo que ya llevás en esta meta"
        primaryLabel={t('common.save')}
        onPrimary={addDeposit}
        primaryLoading={saving}
      >
        <Input
          money
          value={depositAmount}
          onChangeText={setDepositAmount}
          placeholder={t('goals.depositPlaceholder')}
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
  seccion: { marginTop: SPACING.l, marginBottom: SPACING.s },

  resumen: { flexDirection: 'row', alignItems: 'center' },
  resumenInfo: { flex: 1, marginLeft: SPACING.m },
  resumenTotal: { fontFamily: FONTS.amountBold, fontSize: 26, lineHeight: 32, color: COLORS.textHigh, marginVertical: 2 },
  resumenMetas: { flexDirection: 'row', gap: SPACING.l, marginTop: SPACING.xs },
  resumenMeta: {},
  resumenValor: { fontFamily: FONTS.amountBold, fontSize: 14, lineHeight: 18, color: COLORS.textHigh, marginTop: 2 },

  goal: { marginTop: SPACING.s },
  goalTop: { flexDirection: 'row', alignItems: 'center' },
  goalInfo: { flex: 1, minWidth: 0, marginLeft: SPACING.m },
  goalHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  goalName: { flexShrink: 1, fontSize: 16 },
  goalAmounts: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  goalCurrent: { fontFamily: FONTS.amountBold, fontSize: 18, lineHeight: 22 },
  goalSep: { fontSize: 12 },
  goalTarget: { fontFamily: FONTS.amount, fontSize: 14, lineHeight: 18, color: COLORS.textMid },

  goalBottom: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.s },
  proj: { fontFamily: FONTS.semibold },
  completada: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.s },

  iconos: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.s },
  iconoBtn: {
    width: 46, height: 46, borderRadius: RADIUS.m,
    backgroundColor: COLORS.surfaceSunken,
    borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  iconoBtnActivo: { backgroundColor: COLORS.primarySoft, borderColor: COLORS.primary },
});
