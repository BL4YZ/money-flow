import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, Linking, Alert, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../api/client';
import { COLORS, SPACING, RADIUS } from '../theme';

export default function SubscriptionsScreen() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [totalMonthly, setTotalMonthly] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSubs = useCallback(async () => {
    try {
      const { data } = await api.get('/subscriptions');
      setSubscriptions(data.subscriptions);
      setTotalMonthly(data.totalMonthly);
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Error al cargar suscripciones' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  const toggleActive = async (id, current) => {
    try {
      await api.patch(`/subscriptions/${id}`, { is_active: !current });
      setSubscriptions(prev =>
        prev.map(s => s.id === id ? { ...s, is_active: !current } : s)
      );
    } catch (_) {
      Toast.show({ type: 'error', text1: 'Error al actualizar' });
    }
  };

  const deleteSub = (id, name) => {
    Alert.alert('Eliminar suscripción', `¿Eliminar "${name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          await api.delete(`/subscriptions/${id}`);
          setSubscriptions(prev => prev.filter(s => s.id !== id));
          Toast.show({ type: 'success', text1: 'Suscripción eliminada' });
        },
      },
    ]);
  };

  const openCancelUrl = (url) => {
    if (!url) return Toast.show({ type: 'info', text1: 'Sin link de cancelación disponible' });
    Linking.openURL(url);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  const activeSubs = subscriptions.filter(s => s.is_active);
  const inactiveSubs = subscriptions.filter(s => !s.is_active);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchSubs(); }} tintColor={COLORS.primary} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Suscripciones</Text>
      </View>

      {/* Total mensual */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total mensual en suscripciones</Text>
        <Text style={styles.totalAmount}>${totalMonthly.toLocaleString('es-UY', { maximumFractionDigits: 0 })}</Text>
        <Text style={styles.totalYear}>
          ${(totalMonthly * 12).toLocaleString('es-UY', { maximumFractionDigits: 0 })} por año
        </Text>
      </View>

      {subscriptions.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="refresh-circle-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>Sin suscripciones detectadas</Text>
          <Text style={styles.emptyHint}>Subí un estado de cuenta y las detectamos automáticamente</Text>
        </View>
      ) : (
        <>
          {activeSubs.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Activas ({activeSubs.length})</Text>
              {activeSubs.map(sub => (
                <SubCard
                  key={sub.id}
                  sub={sub}
                  onToggle={() => toggleActive(sub.id, sub.is_active)}
                  onCancel={() => openCancelUrl(sub.cancel_url)}
                  onDelete={() => deleteSub(sub.id, sub.name)}
                />
              ))}
            </View>
          )}

          {inactiveSubs.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Pausadas ({inactiveSubs.length})</Text>
              {inactiveSubs.map(sub => (
                <SubCard
                  key={sub.id}
                  sub={sub}
                  onToggle={() => toggleActive(sub.id, sub.is_active)}
                  onCancel={() => openCancelUrl(sub.cancel_url)}
                  onDelete={() => deleteSub(sub.id, sub.name)}
                />
              ))}
            </View>
          )}
        </>
      )}
      <View style={{ height: SPACING.xxl }} />
    </ScrollView>
  );
}

function SubCard({ sub, onToggle, onCancel, onDelete }) {
  const ICONS = {
    'Netflix': '🎬', 'Spotify': '🎵', 'Disney+': '🏰', 'HBO Max': '🎭',
    'Amazon Prime': '📦', 'YouTube Premium': '▶️', 'Apple TV+': '🍎',
    'PlayStation Plus': '🎮', 'Xbox Game Pass': '🎮', 'iCloud': '☁️',
    'Google One': '☁️', 'Microsoft 365': '📊', 'Adobe Creative Cloud': '🎨',
    'Gimnasio': '💪',
  };

  return (
    <View style={[styles.subCard, !sub.is_active && styles.subCardInactive]}>
      <View style={styles.subLeft}>
        <Text style={styles.subIcon}>{ICONS[sub.name] || '📱'}</Text>
        <View>
          <Text style={styles.subName}>{sub.name}</Text>
          <Text style={styles.subMeta}>
            ${parseFloat(sub.amount || 0).toLocaleString()} · {sub.frequency === 'monthly' ? 'mensual' : 'anual'}
            {sub.auto_detected && ' · auto-detectada'}
          </Text>
        </View>
      </View>

      <View style={styles.subRight}>
        <Switch
          value={sub.is_active}
          onValueChange={onToggle}
          trackColor={{ false: COLORS.surfaceLight, true: COLORS.primary }}
          thumbColor="#fff"
        />
        {sub.cancel_url && (
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onDelete}>
          <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: { padding: SPACING.lg, paddingTop: 56 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  totalCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.primary, alignItems: 'center' },
  totalLabel: { color: COLORS.textSecondary, fontSize: 13, marginBottom: SPACING.xs },
  totalAmount: { fontSize: 36, fontWeight: '700', color: COLORS.primary },
  totalYear: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4 },
  section: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.md },
  sectionTitle: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: SPACING.sm },
  subCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  subCardInactive: { opacity: 0.5 },
  subLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flex: 1 },
  subIcon: { fontSize: 28 },
  subName: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  subMeta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  subRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  cancelBtn: { backgroundColor: COLORS.danger + '22', borderRadius: RADIUS.sm, paddingHorizontal: 8, paddingVertical: 4 },
  cancelText: { color: COLORS.danger, fontSize: 12, fontWeight: '600' },
  emptyCard: { margin: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.xxl, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  emptyText: { color: COLORS.text, fontSize: 16, fontWeight: '600', marginTop: SPACING.md },
  emptyHint: { color: COLORS.textSecondary, fontSize: 13, marginTop: SPACING.xs, textAlign: 'center' },
});
