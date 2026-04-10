import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, RefreshControl, Dimensions,
} from 'react-native';
import { PieChart, LineChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { COLORS, SPACING, RADIUS } from '../theme';

const SCREEN_WIDTH = Dimensions.get('window').width;

const CATEGORY_COLORS = [
  '#6C63FF', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE',
];

export default function DashboardScreen() {
  const { user, logout } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );

  const fetchData = useCallback(async () => {
    try {
      const { data: summary } = await api.get('/transactions/summary', {
        params: { month: selectedMonth },
      });
      setData(summary);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const changeMonth = (delta) => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const d = new Date(year, month - 1 + delta);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setLoading(true);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const pieData = data?.byCategory
    ?.filter(c => parseFloat(c.total_spent) > 0)
    ?.slice(0, 8)
    ?.map((c, i) => ({
      name: c.category || 'Otros',
      population: parseFloat(c.total_spent),
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      legendFontColor: COLORS.textSecondary,
      legendFontSize: 12,
    })) || [];

  const lineData = data?.monthlyTrend?.length > 1 ? {
    labels: data.monthlyTrend.map(m => m.month.slice(5)),
    datasets: [{ data: data.monthlyTrend.map(m => parseFloat(m.spent) || 0) }],
  } : null;

  const totalSpent = parseFloat(data?.totals?.total_spent || 0);
  const totalIncome = parseFloat(data?.totals?.total_income || 0);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hola, {user?.name?.split(' ')[0]} 👋</Text>
          <Text style={styles.headerSub}>Resumen financiero</Text>
        </View>
        <TouchableOpacity onPress={logout}>
          <Ionicons name="log-out-outline" size={24} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Selector de mes */}
      <View style={styles.monthSelector}>
        <TouchableOpacity onPress={() => changeMonth(-1)}>
          <Ionicons name="chevron-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.monthText}>{formatMonth(selectedMonth)}</Text>
        <TouchableOpacity onPress={() => changeMonth(1)}>
          <Ionicons name="chevron-forward" size={20} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      {/* Cards de totales */}
      <View style={styles.totalsRow}>
        <View style={[styles.totalCard, { borderColor: COLORS.expense }]}>
          <Text style={styles.totalLabel}>Gastos</Text>
          <Text style={[styles.totalAmount, { color: COLORS.expense }]}>
            ${totalSpent.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
          </Text>
        </View>
        <View style={[styles.totalCard, { borderColor: COLORS.income }]}>
          <Text style={styles.totalLabel}>Ingresos</Text>
          <Text style={[styles.totalAmount, { color: COLORS.income }]}>
            ${totalIncome.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
          </Text>
        </View>
      </View>

      {/* Balance */}
      {totalIncome > 0 && (
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Balance del mes</Text>
          <Text style={[styles.balanceAmount, { color: totalIncome - totalSpent >= 0 ? COLORS.success : COLORS.danger }]}>
            {totalIncome - totalSpent >= 0 ? '+' : '-'}
            ${Math.abs(totalIncome - totalSpent).toLocaleString('es-UY', { maximumFractionDigits: 0 })}
          </Text>
        </View>
      )}

      {/* Pie chart por categoría */}
      {pieData.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Gastos por categoría</Text>
          <PieChart
            data={pieData}
            width={SCREEN_WIDTH - SPACING.lg * 2 - SPACING.md * 2}
            height={180}
            chartConfig={chartConfig}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="10"
            absolute={false}
          />
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Ionicons name="document-text-outline" size={40} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>Sin datos este mes</Text>
          <Text style={styles.emptyHint}>Subí un estado de cuenta para ver tus gastos</Text>
        </View>
      )}

      {/* Trend mensual */}
      {lineData && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tendencia de gastos</Text>
          <LineChart
            data={lineData}
            width={SCREEN_WIDTH - SPACING.lg * 2 - SPACING.md * 2}
            height={160}
            chartConfig={chartConfig}
            bezier
            style={{ borderRadius: RADIUS.md }}
          />
        </View>
      )}

      {/* Lista por categoría */}
      {data?.byCategory?.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Desglose</Text>
          {data.byCategory.map((cat, i) => (
            <CategoryRow key={i} cat={cat} total={totalSpent} color={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
          ))}
        </View>
      )}

      <View style={{ height: SPACING.xxl }} />
    </ScrollView>
  );
}

function CategoryRow({ cat, total, color }) {
  const spent = parseFloat(cat.total_spent);
  const pct = total > 0 ? (spent / total) * 100 : 0;

  return (
    <View style={styles.catRow}>
      <View style={[styles.catDot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <View style={styles.catHeader}>
          <Text style={styles.catName}>{cat.category || 'Otros'}</Text>
          <Text style={styles.catAmount}>${spent.toLocaleString('es-UY', { maximumFractionDigits: 0 })}</Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: color }]} />
        </View>
      </View>
    </View>
  );
}

const chartConfig = {
  backgroundColor: COLORS.surface,
  backgroundGradientFrom: COLORS.surface,
  backgroundGradientTo: COLORS.surface,
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(108, 99, 255, ${opacity})`,
  labelColor: () => COLORS.textSecondary,
  style: { borderRadius: RADIUS.md },
  propsForDots: { r: '4', strokeWidth: '2', stroke: COLORS.primary },
};

function formatMonth(ym) {
  const [year, month] = ym.split('-');
  const names = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${names[parseInt(month) - 1]} ${year}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.lg, paddingTop: 56 },
  greeting: { fontSize: 22, fontWeight: '700', color: COLORS.text },
  headerSub: { color: COLORS.textSecondary, fontSize: 13 },
  monthSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.lg, marginBottom: SPACING.md },
  monthText: { color: COLORS.text, fontSize: 16, fontWeight: '600', minWidth: 140, textAlign: 'center' },
  totalsRow: { flexDirection: 'row', paddingHorizontal: SPACING.lg, gap: SPACING.md, marginBottom: SPACING.md },
  totalCard: { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1 },
  totalLabel: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 4 },
  totalAmount: { fontSize: 20, fontWeight: '700' },
  balanceCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  balanceLabel: { color: COLORS.textSecondary, fontSize: 14 },
  balanceAmount: { fontSize: 22, fontWeight: '700' },
  card: { margin: SPACING.lg, marginTop: 0, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  cardTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: SPACING.md },
  emptyCard: { margin: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.xxl, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  emptyText: { color: COLORS.text, fontSize: 16, fontWeight: '600', marginTop: SPACING.md },
  emptyHint: { color: COLORS.textSecondary, fontSize: 13, marginTop: SPACING.xs, textAlign: 'center' },
  catRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md, gap: SPACING.sm },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  catName: { color: COLORS.text, fontSize: 14 },
  catAmount: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  progressBar: { height: 4, backgroundColor: COLORS.surfaceLight, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
});
