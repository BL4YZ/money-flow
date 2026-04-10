import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Modal, RefreshControl, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../api/client';
import { COLORS, SPACING, RADIUS } from '../theme';

const GOAL_EMOJIS = ['🏠', '🚗', '✈️', '💻', '💍', '🎓', '🏖️', '💰', '📱', '🎯'];

export default function GoalsScreen() {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [depositModal, setDepositModal] = useState(null);
  const [form, setForm] = useState({ name: '', target_amount: '', target_date: '', emoji: '🎯' });
  const [depositAmount, setDepositAmount] = useState('');

  const fetchGoals = useCallback(async () => {
    try {
      const { data } = await api.get('/goals');
      setGoals(data.goals);
    } catch (_) {
      Toast.show({ type: 'error', text1: 'Error al cargar metas' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);

  const createGoal = async () => {
    if (!form.name.trim() || !form.target_amount) {
      return Toast.show({ type: 'error', text1: 'Nombre e importe son requeridos' });
    }
    try {
      const { data } = await api.post('/goals', {
        name: `${form.emoji} ${form.name.trim()}`,
        target_amount: parseFloat(form.target_amount),
        target_date: form.target_date || undefined,
      });
      setGoals(prev => [data.goal, ...prev]);
      setModalVisible(false);
      setForm({ name: '', target_amount: '', target_date: '', emoji: '🎯' });
      Toast.show({ type: 'success', text1: 'Meta creada' });
    } catch (_) {
      Toast.show({ type: 'error', text1: 'Error al crear meta' });
    }
  };

  const addDeposit = async () => {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) return Toast.show({ type: 'error', text1: 'Monto inválido' });

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
        Toast.show({ type: 'success', text1: '🎉 ¡Meta alcanzada!' });
      } else {
        Toast.show({ type: 'success', text1: `+$${amount.toLocaleString()} agregado` });
      }
    } catch (_) {
      Toast.show({ type: 'error', text1: 'Error al actualizar' });
    }
  };

  const deleteGoal = (id, name) => {
    Alert.alert('Eliminar meta', `¿Eliminar "${name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          await api.delete(`/goals/${id}`);
          setGoals(prev => prev.filter(g => g.id !== id));
        },
      },
    ]);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  const active = goals.filter(g => !g.is_completed);
  const completed = goals.filter(g => g.is_completed);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchGoals(); }} tintColor={COLORS.primary} />}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Metas de ahorro</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {goals.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🎯</Text>
            <Text style={styles.emptyText}>Sin metas todavía</Text>
            <Text style={styles.emptyHint}>Creá tu primera meta de ahorro</Text>
          </View>
        )}

        {active.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>En progreso</Text>
            {active.map(goal => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onDeposit={() => setDepositModal(goal.id)}
                onDelete={() => deleteGoal(goal.id, goal.name)}
              />
            ))}
          </View>
        )}

        {completed.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Completadas 🎉</Text>
            {completed.map(goal => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onDeposit={() => {}}
                onDelete={() => deleteGoal(goal.id, goal.name)}
              />
            ))}
          </View>
        )}
        <View style={{ height: SPACING.xxl }} />
      </ScrollView>

      {/* Modal crear meta */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nueva meta</Text>

            <Text style={styles.inputLabel}>Elegí un emoji</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.md }}>
              {GOAL_EMOJIS.map(e => (
                <TouchableOpacity key={e} onPress={() => setForm(f => ({ ...f, emoji: e }))} style={[styles.emojiBtn, form.emoji === e && styles.emojiBtnActive]}>
                  <Text style={{ fontSize: 24 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TextInput style={styles.input} placeholder="Nombre de la meta (ej: Vacaciones)" placeholderTextColor={COLORS.textMuted} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} />
            <TextInput style={styles.input} placeholder="Monto objetivo ($)" placeholderTextColor={COLORS.textMuted} value={form.target_amount} onChangeText={v => setForm(f => ({ ...f, target_amount: v }))} keyboardType="numeric" />
            <TextInput style={styles.input} placeholder="Fecha límite (YYYY-MM-DD, opcional)" placeholderTextColor={COLORS.textMuted} value={form.target_date} onChangeText={v => setForm(f => ({ ...f, target_date: v }))} />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelModalBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelModalText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={createGoal}>
                <Text style={styles.confirmText}>Crear meta</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal depositar */}
      <Modal visible={!!depositModal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Agregar ahorro</Text>
            <TextInput
              style={styles.input}
              placeholder="¿Cuánto ahorraste? ($)"
              placeholderTextColor={COLORS.textMuted}
              value={depositAmount}
              onChangeText={setDepositAmount}
              keyboardType="numeric"
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelModalBtn} onPress={() => { setDepositModal(null); setDepositAmount(''); }}>
                <Text style={styles.cancelModalText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={addDeposit}>
                <Text style={styles.confirmText}>Agregar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function GoalCard({ goal, onDeposit, onDelete }) {
  const current = parseFloat(goal.current_amount);
  const target = parseFloat(goal.target_amount);
  const progress = Math.min(current / target, 1);
  const pct = Math.round(progress * 100);

  const remaining = target - current;
  const daysLeft = goal.target_date
    ? Math.max(0, Math.ceil((new Date(goal.target_date) - new Date()) / 86400000))
    : null;
  const monthlyNeeded = daysLeft && daysLeft > 0
    ? Math.ceil(remaining / (daysLeft / 30))
    : null;

  return (
    <View style={[styles.goalCard, goal.is_completed && { borderColor: COLORS.success }]}>
      <View style={styles.goalHeader}>
        <Text style={styles.goalName}>{goal.name}</Text>
        <TouchableOpacity onPress={onDelete}>
          <Ionicons name="trash-outline" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.goalAmounts}>
        <Text style={styles.goalCurrent}>${current.toLocaleString('es-UY', { maximumFractionDigits: 0 })}</Text>
        <Text style={styles.goalTarget}>/ ${target.toLocaleString('es-UY', { maximumFractionDigits: 0 })}</Text>
        <Text style={[styles.goalPct, { color: goal.is_completed ? COLORS.success : COLORS.primary }]}>{pct}%</Text>
      </View>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: goal.is_completed ? COLORS.success : COLORS.primary }]} />
      </View>

      {!goal.is_completed && (
        <View style={styles.goalFooter}>
          <View>
            {monthlyNeeded && <Text style={styles.goalHint}>~${monthlyNeeded.toLocaleString()}/mes para llegar</Text>}
            {daysLeft !== null && <Text style={styles.goalDays}>{daysLeft} días restantes</Text>}
          </View>
          <TouchableOpacity style={styles.depositBtn} onPress={onDeposit}>
            <Ionicons name="add-circle-outline" size={16} color={COLORS.primary} />
            <Text style={styles.depositText}>Agregar</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.lg, paddingTop: 56 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  addBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.full, width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  section: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.md },
  sectionTitle: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: SPACING.sm },
  goalCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.sm },
  goalName: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  goalAmounts: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: SPACING.sm },
  goalCurrent: { color: COLORS.text, fontSize: 20, fontWeight: '700' },
  goalTarget: { color: COLORS.textSecondary, fontSize: 14 },
  goalPct: { marginLeft: 'auto', fontSize: 16, fontWeight: '700' },
  progressBar: { height: 8, backgroundColor: COLORS.surfaceLight, borderRadius: 4, overflow: 'hidden', marginBottom: SPACING.sm },
  progressFill: { height: '100%', borderRadius: 4 },
  goalFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACING.xs },
  goalHint: { color: COLORS.primary, fontSize: 12 },
  goalDays: { color: COLORS.textMuted, fontSize: 12 },
  depositBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primary + '22', borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 6 },
  depositText: { color: COLORS.primary, fontSize: 13, fontWeight: '600' },
  emptyCard: { margin: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.xxl, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  emptyEmoji: { fontSize: 48 },
  emptyText: { color: COLORS.text, fontSize: 16, fontWeight: '600', marginTop: SPACING.md },
  emptyHint: { color: COLORS.textSecondary, fontSize: 13, marginTop: SPACING.xs },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.lg },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.lg },
  inputLabel: { color: COLORS.textSecondary, fontSize: 13, marginBottom: SPACING.xs },
  emojiBtn: { width: 48, height: 48, borderRadius: RADIUS.sm, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.xs, backgroundColor: COLORS.surfaceLight },
  emojiBtnActive: { borderWidth: 2, borderColor: COLORS.primary },
  input: { backgroundColor: COLORS.surfaceLight, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 14, color: COLORS.text, fontSize: 16, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  modalBtns: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.sm },
  cancelModalBtn: { flex: 1, borderRadius: RADIUS.md, paddingVertical: 14, alignItems: 'center', backgroundColor: COLORS.surfaceLight },
  cancelModalText: { color: COLORS.textSecondary, fontWeight: '600' },
  confirmBtn: { flex: 1, borderRadius: RADIUS.md, paddingVertical: 14, alignItems: 'center', backgroundColor: COLORS.primary },
  confirmText: { color: '#fff', fontWeight: '700' },
});
