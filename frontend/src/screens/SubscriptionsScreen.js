import React, { useState, useEffect, useCallback } from 'react';
import {
  View, ScrollView, StyleSheet, Pressable, RefreshControl,
  ActivityIndicator, Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import api from '../api/client';
import { daysUntilDue } from '../utils/notifications';
import { usePlan } from '../context/PlanContext';
import { useLanguage } from '../context/LanguageContext';
import RefreshBadge from '../components/RefreshBadge';
import {
  Txt, Card, Input, Chip, Segmented, Badge, Button, BottomSheet,
  Glow, EmptyState, ScreenHeader, Toggle, formatUYU,
} from '../components/ui';
import { COLORS, SPACING, RADIUS, FONTS, serviceMeta, estilos } from '../theme';

const EMPTY_FORM = { name: '', amount: '', frequency: 'monthly' };
const EMPTY_BILL_FORM = { name: '', amount: '', due_day: '', reminder_days: '3', category: 'Servicios' };

const BILL_CATEGORIES = ['Servicios', 'Vivienda', 'Salud', 'Educación', 'Transporte', 'Otros'];
const BILL_CAT_ICONS = {
  Servicios: 'flash-outline', Vivienda: 'home-outline', Salud: 'medkit-outline',
  Educación: 'school-outline', Transporte: 'car-outline', Otros: 'receipt-outline',
};

/** Recordatorio de factura. El color dice cuán cerca está el vencimiento. */
function BillCard({ bill, onDelete }) {
  const { t } = useLanguage();
  const days = daysUntilDue(bill.due_day);
  const icon = BILL_CAT_ICONS[bill.category] || 'receipt-outline';
  const tono = days <= 3 ? COLORS.error : days <= 7 ? COLORS.warning : COLORS.textMid;

  return (
    <Card style={styles.fila}>
      <View style={styles.filaRow}>
        <View style={[styles.iconBox, { borderColor: tono }]}>
          <Ionicons name={icon} size={18} color={tono} />
        </View>
        <View style={styles.filaInfo}>
          <Txt variant="caption" color={COLORS.textHigh} style={styles.filaNombre} numberOfLines={1}>
            {bill.name}
          </Txt>
          <Txt variant="caption" color={tono} style={styles.filaMeta}>
            {days === 0 ? t('subs.billDueToday')
              : days === 1 ? t('subs.billDueTomorrow')
              : t('subs.billDueInDays', { n: days })}
            {` · día ${bill.due_day}`}
          </Txt>
          {bill.amount ? (
            <Txt style={styles.filaMonto}>{formatUYU(parseFloat(bill.amount))}</Txt>
          ) : null}
        </View>
        <View style={styles.filaDer}>
          <Badge variant="statusMuted" icon="notifications-outline" label={`−${bill.reminder_days}d`} />
          <Pressable onPress={onDelete} hitSlop={8} style={{ marginTop: 6 }}>
            <Ionicons name="trash-outline" size={14} color={COLORS.textLow} />
          </Pressable>
        </View>
      </View>
    </Card>
  );
}

/** Suscripción. El toggle pausa sin borrar: pausar y dar de baja no es lo mismo. */
function SubCard({ sub, onToggle, onDelete }) {
  const { t } = useLanguage();
  const { icon, color } = serviceMeta(sub.name);
  const amount = parseFloat(sub.amount || 0);

  return (
    <Card style={[styles.fila, !sub.is_active && styles.filaInactiva]}>
      <View style={styles.filaRow}>
        <View style={[styles.iconBox, { borderColor: color }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>

        <View style={styles.filaInfo}>
          <Txt variant="h2" style={styles.subNombre} numberOfLines={1}>{sub.name}</Txt>
          <View style={styles.subMeta}>
            <Txt style={styles.subMonto}>{formatUYU(amount)}</Txt>
            <Txt variant="caption" color={COLORS.textLow}>
              {' · '}{sub.frequency === 'monthly' ? t('subs.monthly') : t('subs.yearly')}
            </Txt>
            {sub.auto_detected ? (
              <Badge variant="statusMuted" label="AUTO" style={{ marginLeft: SPACING.s }} />
            ) : null}
          </View>

          {sub.price_alert ? (
            <View style={styles.priceAlert}>
              <Ionicons name="trending-up" size={12} color={COLORS.warning} />
              <Txt variant="caption" color={COLORS.warning} style={{ marginLeft: 5, flex: 1 }}>
                Subió {formatUYU(sub.price_alert.diff)} — ahora {formatUYU(sub.price_alert.new)}
              </Txt>
            </View>
          ) : null}
        </View>

        <View style={styles.subControles}>
          <Toggle value={sub.is_active} onValueChange={onToggle} />
          <Pressable onPress={onDelete} hitSlop={8} style={{ marginTop: SPACING.s }}>
            <Ionicons name="trash-outline" size={15} color={COLORS.textLow} />
          </Pressable>
        </View>
      </View>
    </Card>
  );
}

export default function SubscriptionsScreen() {
  const { t } = useLanguage();
  const { canAddBill, showUpgrade } = usePlan();

  const [subscriptions, setSubscriptions] = useState([]);
  const [totalMonthly, setTotalMonthly] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [bills, setBills] = useState([]);
  const [billModalVisible, setBillModalVisible] = useState(false);
  const [billForm, setBillForm] = useState(EMPTY_BILL_FORM);
  const [savingBill, setSavingBill] = useState(false);

  const [upcoming, setUpcoming] = useState([]);
  const [detected, setDetected] = useState([]);
  const [dismissedDetect, setDismissedDetect] = useState([]);

  const fetchSubs = useCallback(async () => {
    try {
      const { data } = await api.get('/subscriptions');
      setSubscriptions(data.subscriptions);
      setTotalMonthly(data.totalMonthly);
    } catch (_) {
      Toast.show({ type: 'error', text1: t('subs.errorLoad') });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchBills = useCallback(async () => {
    try {
      const { data } = await api.get('/bills');
      setBills(data.bills || []);
    } catch (_) {}
  }, []);

  const fetchUpcoming = useCallback(async () => {
    try {
      const { data } = await api.get('/subscriptions/upcoming');
      setUpcoming(data.upcoming || []);
    } catch (_) {}
  }, []);

  const fetchDetected = useCallback(async () => {
    try {
      const { data } = await api.get('/subscriptions/detect');
      setDetected(data.candidates || []);
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchSubs(); fetchBills(); fetchUpcoming(); fetchDetected();
  }, [fetchSubs, fetchBills, fetchUpcoming, fetchDetected]);

  const addDetected = async (candidate) => {
    try {
      // El día de cobro se infiere de la última fecha detectada.
      const billing_day = candidate.lastCharge
        ? new Date(candidate.lastCharge + 'T00:00:00').getDate()
        : undefined;
      const { data } = await api.post('/subscriptions', {
        name: candidate.suggestedName,
        amount: candidate.amount,
        frequency: candidate.frequency,
        billing_day,
      });
      setSubscriptions((prev) => [data.subscription, ...prev]);
      setTotalMonthly((prev) => prev + candidate.amount);
      setDetected((prev) => prev.filter((c) => c.description !== candidate.description));
      fetchUpcoming();
      Toast.show({ type: 'success', text1: t('subs.successSubAdded') });
    } catch (_) {
      Toast.show({ type: 'error', text1: t('subs.errorSave') });
    }
  };

  const saveBill = async () => {
    if (!billForm.name.trim() || !billForm.due_day) {
      return Toast.show({ type: 'error', text1: t('subs.errorFields') });
    }
    const due = parseInt(billForm.due_day, 10);
    if (isNaN(due) || due < 1 || due > 31) {
      return Toast.show({ type: 'error', text1: t('subs.errorDay') });
    }
    setSavingBill(true);
    try {
      const { data } = await api.post('/bills', {
        name: billForm.name.trim(),
        due_day: due,
        reminder_days: parseInt(billForm.reminder_days, 10) || 3,
        category: billForm.category,
        ...(billForm.amount ? { amount: parseFloat(billForm.amount) } : {}),
      });
      setBills((prev) => [...prev, data.bill].sort((a, b) => a.due_day - b.due_day));
      setBillModalVisible(false);
      setBillForm(EMPTY_BILL_FORM);
      Toast.show({ type: 'success', text1: t('subs.successBillCreated') });
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || t('subs.errorSave') });
    } finally {
      setSavingBill(false);
    }
  };

  const deleteBill = (id, name) => {
    Alert.alert(t('subs.deleteBillTitle'), t('subs.deleteConfirm', { name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          await api.delete(`/bills/${id}`);
          setBills((prev) => prev.filter((b) => b.id !== id));
          Toast.show({ type: 'success', text1: t('subs.successBillDeleted') });
        },
      },
    ]);
  };

  const toggleActive = async (id, current) => {
    try {
      await api.patch(`/subscriptions/${id}`, { is_active: !current });
      setSubscriptions((prev) => prev.map((s) => (s.id === id ? { ...s, is_active: !current } : s)));
    } catch (_) {
      Toast.show({ type: 'error', text1: t('subs.errorUpdate') });
    }
  };

  const deleteSub = (id, name) => {
    Alert.alert(t('subs.deleteSubTitle'), t('subs.deleteConfirm', { name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          await api.delete(`/subscriptions/${id}`);
          setSubscriptions((prev) => prev.filter((s) => s.id !== id));
          Toast.show({ type: 'success', text1: t('subs.successSubDeleted') });
        },
      },
    ]);
  };

  const createSub = async () => {
    if (!form.name.trim() || !form.amount) {
      return Toast.show({ type: 'error', text1: t('subs.errorSubFields') });
    }
    setSaving(true);
    try {
      const { data } = await api.post('/subscriptions', {
        name: form.name.trim(),
        amount: parseFloat(form.amount),
        frequency: form.frequency,
      });
      setSubscriptions((prev) => [data.subscription, ...prev]);
      setTotalMonthly((prev) => prev + parseFloat(form.amount));
      setModalVisible(false);
      setForm(EMPTY_FORM);
      Toast.show({ type: 'success', text1: t('subs.successSubAdded') });
    } catch (_) {
      Toast.show({ type: 'error', text1: t('subs.errorSave') });
    } finally {
      setSaving(false);
    }
  };

  const activas = subscriptions.filter((s) => s.is_active);
  const pausadas = subscriptions.filter((s) => !s.is_active);
  const detectadas = detected.filter((c) => !dismissedDetect.includes(c.description));

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
            onRefresh={() => { setRefreshing(true); fetchSubs(); }}
            tintColor="transparent"
            colors={['transparent']}
          />
        }
      >
        <ScreenHeader
          title={t('subs.heroTitle')}
          subtitle={t('subs.heroSubtitle')}
          actionIcon="add"
          onActionPress={() => setModalVisible(true)}
        />

        <Card variant="raised" label={t('subs.monthlyCommitment')} style={styles.bloque}>
          <Txt style={styles.total}>{formatUYU(totalMonthly)}</Txt>
          <Txt variant="caption" color={COLORS.textMid}>
            {formatUYU(totalMonthly * 12)} {t('subs.perYear')}
          </Txt>
          <View style={styles.bento}>
            <View style={styles.bentoItem}>
              <Txt style={styles.bentoValor}>{activas.length}</Txt>
              <Txt variant="caption" color={COLORS.textLow}>{t('subs.active')}</Txt>
            </View>
            <View style={styles.bentoItem}>
              <Txt style={[styles.bentoValor, { color: COLORS.textMid }]}>{pausadas.length}</Txt>
              <Txt variant="caption" color={COLORS.textLow}>{t('subs.paused')}</Txt>
            </View>
          </View>
        </Card>

        {/* Detectadas del resumen bancario — la función que justifica subir el PDF. */}
        {detectadas.length > 0 ? (
          <Card variant="raised" style={styles.bloque}>
            <View style={styles.detectHead}>
              <Ionicons name="sparkles" size={16} color={COLORS.accent} />
              <Txt variant="overline" color={COLORS.accent} style={{ marginLeft: 7 }}>
                Detectamos cobros recurrentes
              </Txt>
            </View>
            <Txt variant="caption" color={COLORS.textMid} style={{ marginBottom: SPACING.s }}>
              Encontramos estos pagos que se repiten en tus movimientos. ¿Agregarlos?
            </Txt>
            {detectadas.map((c) => (
              <View key={c.description} style={styles.detectRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="caption" color={COLORS.textHigh} style={styles.filaNombre} numberOfLines={1}>
                    {c.suggestedName}
                  </Txt>
                  <Txt variant="caption" color={COLORS.textLow}>
                    {formatUYU(c.amount)}/mes · {c.occurrences} cobros
                  </Txt>
                </View>
                <Button label="Agregar" size="sm" onPress={() => addDetected(c)} />
                <Pressable
                  onPress={() => setDismissedDetect((prev) => [...prev, c.description])}
                  hitSlop={8}
                  style={{ marginLeft: SPACING.s }}
                >
                  <Ionicons name="close" size={16} color={COLORS.textLow} />
                </Pressable>
              </View>
            ))}
          </Card>
        ) : null}

        {/* Próximos cobros (30 días) */}
        {upcoming.length > 0 ? (
          <>
            <Txt variant="overline" color={COLORS.textLow} style={styles.seccion}>Próximos cobros</Txt>
            <Card>
              {upcoming.map((u, i) => {
                const pronto = u.daysUntil <= 3;
                const d = new Date(u.date + 'T00:00:00');
                return (
                  <View key={u.type + u.id} style={[styles.upRow, i > 0 && styles.upRowBorde]}>
                    <View style={[styles.upFecha, pronto && styles.upFechaPronto]}>
                      <Txt style={[styles.upDia, pronto && { color: COLORS.warning }]}>{d.getDate()}</Txt>
                      <Txt variant="caption" color={COLORS.textLow} style={styles.upMes}>
                        {d.toLocaleDateString('es-UY', { month: 'short' })}
                      </Txt>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt variant="caption" color={COLORS.textHigh} style={styles.filaNombre} numberOfLines={1}>
                        {u.name}
                      </Txt>
                      <Txt variant="caption" color={COLORS.textLow}>
                        {u.daysUntil === 0 ? 'Hoy' : u.daysUntil === 1 ? 'Mañana' : `En ${u.daysUntil} días`}
                        {u.type === 'bill' ? ' · Factura' : ''}
                      </Txt>
                    </View>
                    {u.amount > 0 ? <Txt style={styles.upMonto}>{formatUYU(u.amount)}</Txt> : null}
                  </View>
                );
              })}
            </Card>
          </>
        ) : null}

        {/* Recordatorios de factura */}
        <View style={styles.seccionHead}>
          <Txt variant="overline" color={COLORS.textLow}>{t('subs.billReminders')}</Txt>
          <View style={styles.seccionAcciones}>
            {__DEV__ ? (
              <Button
                label={t('subs.testNotify')}
                variant="ghost"
                size="sm"
                icon="notifications-outline"
                onPress={async () => {
                  try {
                    const { data } = await api.post('/bills/test-notify');
                    Toast.show({
                      type: 'success',
                      text1: data.sent !== 1
                        ? t('subs.testSentPlural', { n: data.sent })
                        : t('subs.testSent', { n: data.sent }),
                      text2: data.reason || undefined,
                    });
                  } catch (e) {
                    Toast.show({ type: 'error', text1: t('subs.testFailed'), text2: e.message });
                  }
                }}
              />
            ) : null}
            <Button
              label={t('subs.addReminder')}
              variant="ghost"
              size="sm"
              icon={canAddBill ? 'add' : 'lock-closed'}
              onPress={() => {
                if (!canAddBill) { showUpgrade('bills'); return; }
                setBillForm(EMPTY_BILL_FORM);
                setBillModalVisible(true);
              }}
            />
          </View>
        </View>

        {bills.length === 0 ? (
          <EmptyState
            icon="notifications-outline"
            title={t('subs.noReminders')}
            actionLabel={t('subs.addReminder')}
            actionIcon={canAddBill ? 'add' : 'lock-closed'}
            onAction={() => {
              if (!canAddBill) { showUpgrade('bills'); return; }
              setBillForm(EMPTY_BILL_FORM);
              setBillModalVisible(true);
            }}
          />
        ) : (
          bills.map((bill) => (
            <BillCard key={bill.id} bill={bill} onDelete={() => deleteBill(bill.id, bill.name)} />
          ))
        )}

        {subscriptions.length === 0 ? (
          <EmptyState
            icon="repeat-outline"
            title={t('subs.noSubsYet')}
            text={t('subs.emptyHint')}
            actionLabel={t('subs.addSub')}
            actionIcon="add"
            onAction={() => setModalVisible(true)}
            style={styles.bloque}
          />
        ) : null}

        {activas.length > 0 ? (
          <>
            <Txt variant="overline" color={COLORS.textLow} style={styles.seccion}>
              {t('subs.activeSection')}
            </Txt>
            {activas.map((sub) => (
              <SubCard
                key={sub.id}
                sub={sub}
                onToggle={() => toggleActive(sub.id, sub.is_active)}
                onDelete={() => deleteSub(sub.id, sub.name)}
              />
            ))}
          </>
        ) : null}

        {pausadas.length > 0 ? (
          <>
            <Txt variant="overline" color={COLORS.textLow} style={styles.seccion}>
              {t('subs.pausedSection')}
            </Txt>
            {pausadas.map((sub) => (
              <SubCard
                key={sub.id}
                sub={sub}
                onToggle={() => toggleActive(sub.id, sub.is_active)}
                onDelete={() => deleteSub(sub.id, sub.name)}
              />
            ))}
          </>
        ) : null}

        {subscriptions.length > 0 ? (
          <Card variant="raised" style={styles.bloque}>
            <View style={styles.optimizeRow}>
              <View style={{ flex: 1 }}>
                <Txt variant="h2" style={{ marginBottom: 4 }}>{t('subs.optimizeTitle')}</Txt>
                <Txt variant="caption" color={COLORS.textMid}>
                  {t('subs.optimizeSub')}{' '}
                  <Txt variant="caption" color={COLORS.income}>
                    {formatUYU(Math.round(totalMonthly * 0.2))}{t('subs.perMonth')}
                  </Txt>
                </Txt>
              </View>
              <Ionicons name="flash" size={24} color={COLORS.accent} />
            </View>
          </Card>
        ) : null}

        {/* Aire para la tab bar flotante. */}
        <View style={{ height: 110 }} />
      </ScrollView>

      {/* Nueva suscripción */}
      <BottomSheet
        visible={modalVisible}
        onClose={() => { setModalVisible(false); setForm(EMPTY_FORM); }}
        title={t('subs.addSub')}
        primaryLabel={t('common.save')}
        onPrimary={createSub}
        primaryLoading={saving}
      >
        <Input
          icon="repeat-outline"
          value={form.name}
          onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
          placeholder={t('subs.namePlaceholder')}
          style={{ marginBottom: SPACING.s }}
        />
        <Input
          money
          value={form.amount}
          onChangeText={(v) => setForm((f) => ({ ...f, amount: v }))}
          placeholder={t('subs.amountPlaceholder')}
          keyboardType="numeric"
          style={{ marginBottom: SPACING.m }}
        />
        <Segmented
          options={[
            { value: 'monthly', label: t('subs.monthly') },
            { value: 'yearly', label: t('subs.yearly') },
          ]}
          value={form.frequency}
          onChange={(v) => setForm((f) => ({ ...f, frequency: v }))}
        />
      </BottomSheet>

      {/* Nuevo recordatorio */}
      <BottomSheet
        visible={billModalVisible}
        onClose={() => { setBillModalVisible(false); setBillForm(EMPTY_BILL_FORM); }}
        title={t('subs.addReminder')}
        primaryLabel={t('common.save')}
        onPrimary={saveBill}
        primaryLoading={savingBill}
      >
        <Input
          icon="receipt-outline"
          value={billForm.name}
          onChangeText={(v) => setBillForm((f) => ({ ...f, name: v }))}
          placeholder={t('subs.billNamePlaceholder')}
          style={{ marginBottom: SPACING.s }}
        />
        <Input
          money
          value={billForm.amount}
          onChangeText={(v) => setBillForm((f) => ({ ...f, amount: v }))}
          placeholder={t('subs.amountPlaceholder')}
          keyboardType="numeric"
          style={{ marginBottom: SPACING.s }}
        />
        <Input
          icon="calendar-outline"
          value={billForm.due_day}
          onChangeText={(v) => setBillForm((f) => ({ ...f, due_day: v }))}
          placeholder={t('subs.dayPlaceholder')}
          keyboardType="numeric"
          style={{ marginBottom: SPACING.s }}
        />
        <Input
          icon="notifications-outline"
          value={billForm.reminder_days}
          onChangeText={(v) => setBillForm((f) => ({ ...f, reminder_days: v }))}
          placeholder={t('subs.reminderPlaceholder')}
          keyboardType="numeric"
          style={{ marginBottom: SPACING.m }}
        />
        <Txt variant="overline" color={COLORS.textLow} style={{ marginBottom: SPACING.s }}>
          {t('common.category')}
        </Txt>
        <View style={styles.catChips}>
          {BILL_CATEGORIES.map((cat) => (
            <Chip
              key={cat}
              label={cat}
              icon={BILL_CAT_ICONS[cat]}
              active={billForm.category === cat}
              onPress={() => setBillForm((f) => ({ ...f, category: cat }))}
            />
          ))}
        </View>
      </BottomSheet>
    </View>
  );
}

// Se declara con `estilos()` y no con `StyleSheet.create` suelto: create COPIA
// los colores al cargar el modulo, asi que un cambio de tema en caliente no
// repintaria nada. Ver theme.js.
const styles = estilos(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  content: { paddingHorizontal: SPACING.m, paddingTop: 60 },
  bloque: { marginTop: SPACING.m },
  seccion: { marginTop: SPACING.l, marginBottom: SPACING.s },
  seccionHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: SPACING.l, marginBottom: SPACING.s,
  },
  seccionAcciones: { flexDirection: 'row', alignItems: 'center' },

  total: { fontFamily: FONTS.amountBold, fontSize: 32, lineHeight: 38, color: COLORS.textHigh },
  bento: { flexDirection: 'row', gap: SPACING.s, marginTop: SPACING.m },
  bentoItem: {
    flex: 1, alignItems: 'center',
    backgroundColor: COLORS.surfaceSunken,
    borderRadius: RADIUS.m, paddingVertical: 12,
  },
  bentoValor: { fontFamily: FONTS.amountBold, fontSize: 20, lineHeight: 24, color: COLORS.textHigh, marginBottom: 2 },

  detectHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  detectRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },

  fila: { marginTop: SPACING.s },
  filaInactiva: { opacity: 0.55 },
  filaRow: { flexDirection: 'row', alignItems: 'center' },
  iconBox: {
    width: 42, height: 42, borderRadius: RADIUS.m,
    borderWidth: 1.5,
    backgroundColor: COLORS.surfaceSunken,
    alignItems: 'center', justifyContent: 'center',
    marginRight: SPACING.s,
  },
  filaInfo: { flex: 1, minWidth: 0 },
  filaNombre: { fontFamily: FONTS.semibold },
  filaMeta: { marginTop: 2, fontSize: 12 },
  filaMonto: { fontFamily: FONTS.amount, fontSize: 12, lineHeight: 16, color: COLORS.textLow, marginTop: 2 },
  filaDer: { alignItems: 'flex-end', marginLeft: SPACING.s },

  subNombre: { fontSize: 15 },
  subMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 3, flexWrap: 'wrap' },
  subMonto: { fontFamily: FONTS.amountBold, fontSize: 13, lineHeight: 16, color: COLORS.textHigh },
  subControles: { alignItems: 'center', marginLeft: SPACING.s },
  priceAlert: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },

  upRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  upRowBorde: { borderTopWidth: 1, borderTopColor: COLORS.borderSubtle },
  upFecha: {
    width: 44, alignItems: 'center',
    backgroundColor: COLORS.surfaceSunken,
    borderRadius: RADIUS.s, paddingVertical: 6,
    marginRight: SPACING.s,
  },
  upFechaPronto: { backgroundColor: COLORS.warningSoft },
  upDia: { fontFamily: FONTS.amountBold, fontSize: 16, lineHeight: 19, color: COLORS.textHigh },
  upMes: { fontSize: 10, textTransform: 'uppercase' },
  upMonto: { fontFamily: FONTS.amountBold, fontSize: 14, lineHeight: 17, color: COLORS.textHigh, marginLeft: SPACING.s },

  optimizeRow: { flexDirection: 'row', alignItems: 'center' },
  catChips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.s },
}));
