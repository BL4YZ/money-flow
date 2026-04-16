import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, Switch,
  Modal, TextInput, KeyboardAvoidingView, Platform, Animated, PanResponder,
} from 'react-native';
import { useEntrance, useStaggerEntrance, useCountUp } from '../utils/animations';
import { daysUntilDue } from '../utils/notifications';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../api/client';
import { COLORS, SPACING, RADIUS, SHADOWS, GRADIENT } from '../theme';
import { useLanguage } from '../context/LanguageContext';

// Map service names to icons and accent colors
const SERVICE_META = {
  'Netflix':               { icon: 'film-outline',       color: '#E50914' },
  'Spotify':               { icon: 'musical-notes-outline', color: '#1DB954' },
  'Disney+':               { icon: 'tv-outline',          color: '#006E99' },
  'HBO Max':               { icon: 'videocam-outline',    color: '#5822A7' },
  'Amazon Prime':          { icon: 'cart-outline',        color: '#FF9900' },
  'YouTube Premium':       { icon: 'logo-youtube',        color: '#FF0000' },
  'Apple TV+':             { icon: 'logo-apple',          color: '#A2AAAD' },
  'PlayStation Plus':      { icon: 'game-controller-outline', color: '#003087' },
  'Xbox Game Pass':        { icon: 'game-controller-outline', color: '#107C10' },
  'iCloud':                { icon: 'cloud-outline',       color: '#3478F6' },
  'Google One':            { icon: 'cloud-outline',       color: '#4285F4' },
  'Microsoft 365':         { icon: 'grid-outline',        color: '#D83B01' },
  'Adobe Creative Cloud':  { icon: 'color-palette-outline', color: '#FF0000' },
  'Gimnasio':              { icon: 'barbell-outline',     color: '#FF6D00' },
};

function getServiceMeta(name) {
  return SERVICE_META[name] || { icon: 'phone-portrait-outline', color: COLORS.primary };
}

const EMPTY_FORM      = { name: '', amount: '', frequency: 'monthly' };
const EMPTY_BILL_FORM = { name: '', amount: '', due_day: '', reminder_days: '3', category: 'Servicios' };

const BILL_CATEGORIES = ['Servicios', 'Vivienda', 'Salud', 'Educación', 'Transporte', 'Otros'];
const BILL_CAT_ICONS  = {
  Servicios: 'flash-outline', Vivienda: 'home-outline', Salud: 'medkit-outline',
  Educación: 'school-outline', Transporte: 'car-outline', Otros: 'receipt-outline',
};

export default function SubscriptionsScreen() {
  const { t } = useLanguage();
  const [subscriptions, setSubscriptions] = useState([]);
  const [totalMonthly, setTotalMonthly] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Bills state
  const [bills, setBills] = useState([]);
  const [billModalVisible, setBillModalVisible] = useState(false);
  const [billForm, setBillForm] = useState(EMPTY_BILL_FORM);
  const [savingBill, setSavingBill] = useState(false);

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
          setForm(EMPTY_FORM);
        } else {
          Animated.spring(panY, {
            toValue: 0, damping: 20, stiffness: 300, useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const panYBill = useRef(new Animated.Value(0)).current;
  const panResponderBill = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 5 && g.dy > Math.abs(g.dx),
      onPanResponderMove: (_, g) => { if (g.dy > 0) panYBill.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 70 || g.vy > 0.6) {
          panYBill.setValue(0); setBillModalVisible(false); setBillForm(EMPTY_BILL_FORM);
        } else {
          Animated.spring(panYBill, { toValue: 0, damping: 20, stiffness: 300, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

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

  useEffect(() => {
    fetchSubs();
    fetchBills();
  }, [fetchSubs, fetchBills]);

  const saveBill = async () => {
    if (!billForm.name.trim() || !billForm.due_day) {
      return Toast.show({ type: 'error', text1: t('subs.errorFields') });
    }
    const due = parseInt(billForm.due_day);
    if (isNaN(due) || due < 1 || due > 31) {
      return Toast.show({ type: 'error', text1: t('subs.errorDay') });
    }
    setSavingBill(true);
    try {
      const payload = {
        name: billForm.name.trim(),
        due_day: due,
        reminder_days: parseInt(billForm.reminder_days) || 3,
        category: billForm.category,
        ...(billForm.amount ? { amount: parseFloat(billForm.amount) } : {}),
      };
      const { data } = await api.post('/bills', payload);
      setBills(prev => [...prev, data.bill].sort((a, b) => a.due_day - b.due_day));
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
          setBills(prev => prev.filter(b => b.id !== id));
          Toast.show({ type: 'success', text1: t('subs.successBillDeleted') });
        },
      },
    ]);
  };

  const toggleActive = async (id, current) => {
    try {
      await api.patch(`/subscriptions/${id}`, { is_active: !current });
      setSubscriptions(prev =>
        prev.map(s => s.id === id ? { ...s, is_active: !current } : s)
      );
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
          setSubscriptions(prev => prev.filter(s => s.id !== id));
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
      setSubscriptions(prev => [data.subscription, ...prev]);
      setTotalMonthly(prev => prev + parseFloat(form.amount));
      setModalVisible(false);
      setForm(EMPTY_FORM);
      Toast.show({ type: 'success', text1: t('subs.successSubAdded') });
    } catch (_) {
      Toast.show({ type: 'error', text1: t('subs.errorSave') });
    } finally {
      setSaving(false);
    }
  };

  const heroAnim    = useEntrance({ delay: 0,   fromY: 24 });
  const cardAnim    = useEntrance({ delay: 100, fromY: 28 });
  const listAnim    = useEntrance({ delay: 200, fromY: 20 });

  const activeSubs = subscriptions.filter(s => s.is_active);
  const inactiveSubs = subscriptions.filter(s => !s.is_active);
  const totalYearly = totalMonthly * 12;
  const animatedMonthly = useCountUp(totalMonthly, { duration: 1100, delay: 200 });
  const animatedYearly  = useCountUp(totalYearly,  { duration: 1100, delay: 300 });

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
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={20} color={COLORS.onPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchSubs(); }}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Hero */}
        <Animated.View style={[styles.hero, heroAnim.style]}>
          <Text style={styles.heroTitle}>{t('subs.heroTitle')}</Text>
          <Text style={styles.heroSubtitle}>{t('subs.heroSubtitle')}</Text>
        </Animated.View>

        {/* Hero metric card */}
        <Animated.View style={[styles.heroCard, cardAnim.style]}>
          <View style={styles.heroCardMain}>
            <Text style={styles.heroCardLabel}>{t('subs.monthlyCommitment')}</Text>
            <Text style={styles.heroCardAmount}>
              ${animatedMonthly.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
            </Text>
            <Text style={styles.heroCardSub}>
              ${animatedYearly.toLocaleString('es-UY', { maximumFractionDigits: 0 })} {t('subs.perYear')}
            </Text>
          </View>
          {/* Bento mini stats */}
          <View style={styles.bentoGrid}>
            <View style={styles.bentoItem}>
              <Text style={styles.bentoValue}>{activeSubs.length}</Text>
              <Text style={styles.bentoLabel}>{t('subs.active')}</Text>
            </View>
            <View style={[styles.bentoItem, styles.bentoItemRight]}>
              <Text style={[styles.bentoValue, { color: COLORS.onSurfaceVariant }]}>{inactiveSubs.length}</Text>
              <Text style={styles.bentoLabel}>{t('subs.paused')}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Empty state */}
        {subscriptions.length === 0 && (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconBg}>
              <Ionicons name="repeat-outline" size={32} color={COLORS.primary} />
            </View>
            <Text style={styles.emptyTitle}>{t('subs.noSubsYet')}</Text>
            <Text style={styles.emptyHint}>{t('subs.emptyHint')}</Text>
          </View>
        )}

        {/* ── Bill Reminders ──────────────────────────────────── */}
        <Animated.View style={listAnim.style}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('subs.billReminders')}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {__DEV__ && (
                <TouchableOpacity
                  style={[styles.sectionAddBtn, { backgroundColor: COLORS.warning + '20' }]}
                  onPress={async () => {
                    try {
                      const { data } = await api.post('/bills/test-notify');
                      Toast.show({ type: 'success', text1: data.sent !== 1 ? t('subs.testSentPlural', { n: data.sent }) : t('subs.testSent', { n: data.sent }), text2: data.reason || undefined });
                    } catch (e) {
                      Toast.show({ type: 'error', text1: t('subs.testFailed'), text2: e.message });
                    }
                  }}
                >
                  <Ionicons name="notifications-outline" size={14} color={COLORS.warning} />
                  <Text style={[styles.sectionAddText, { color: COLORS.warning }]}>{t('subs.testNotify')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.sectionAddBtn}
                onPress={() => { setBillForm(EMPTY_BILL_FORM); setBillModalVisible(true); }}
              >
                <Ionicons name="add" size={14} color={COLORS.primary} />
                <Text style={styles.sectionAddText}>{t('subs.addReminder')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {bills.length === 0 ? (
            <TouchableOpacity
              style={styles.billsEmpty}
              onPress={() => { setBillForm(EMPTY_BILL_FORM); setBillModalVisible(true); }}
            >
              <Ionicons name="notifications-outline" size={20} color={COLORS.onSurfaceVariant + '60'} />
              <Text style={styles.billsEmptyText}>{t('subs.noReminders')}</Text>
            </TouchableOpacity>
          ) : (
            bills.map((bill, index) => (
              <BillCard
                key={bill.id}
                bill={bill}
                index={index}
                onDelete={() => deleteBill(bill.id, bill.name)}
              />
            ))
          )}
        </Animated.View>

        {/* Active subscriptions */}
        {activeSubs.length > 0 && (
          <Animated.View style={[styles.section, listAnim.style]}>
            <Text style={styles.sectionTitle}>{t('subs.activeSection')}</Text>
            {activeSubs.map((sub, index) => (
              <SubCard
                key={sub.id}
                index={index}
                sub={sub}
                onToggle={() => toggleActive(sub.id, sub.is_active)}
                onDelete={() => deleteSub(sub.id, sub.name)}
              />
            ))}
          </Animated.View>
        )}

        {/* Paused subscriptions */}
        {inactiveSubs.length > 0 && (
          <Animated.View style={[styles.section, listAnim.style]}>
            <Text style={styles.sectionTitle}>{t('subs.pausedSection')}</Text>
            {inactiveSubs.map((sub, index) => (
              <SubCard
                key={sub.id}
                index={index}
                sub={sub}
                onToggle={() => toggleActive(sub.id, sub.is_active)}
                onDelete={() => deleteSub(sub.id, sub.name)}
              />
            ))}
          </Animated.View>
        )}

        {/* Optimize card */}
        {subscriptions.length > 0 && (
          <LinearGradient
            colors={['#1c1b3a', '#2d1b6e']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.optimizeCard}
          >
            <View style={styles.optimizeRow}>
              <View style={styles.optimizeText}>
                <Text style={styles.optimizeTitle}>{t('subs.optimizeTitle')}</Text>
                <Text style={styles.optimizeSub}>
                  {t('subs.optimizeSub')}{' '}
                  <Text style={{ color: COLORS.secondary, fontWeight: '700' }}>
                    ${Math.round(totalMonthly * 0.2).toLocaleString()}{t('subs.perMonth')}
                  </Text>
                </Text>
              </View>
              <View style={styles.optimizeIcon}>
                <Ionicons name="flash" size={24} color={COLORS.secondary} />
              </View>
            </View>
          </LinearGradient>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Add subscription modal ── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setModalVisible(false)}
          />
          <Animated.View style={[styles.modalCard, { transform: [{ translateY: panY }] }]}>
            <View style={styles.modalHandleArea} {...panResponder.panHandlers}>
              <View style={styles.modalHandle} />
            </View>
            <Text style={styles.modalTitle}>{t('subs.newSub')}</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('subs.subName')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('subs.namePlaceholder')}
                placeholderTextColor={COLORS.onSurfaceVariant + '60'}
                value={form.name}
                onChangeText={v => setForm(f => ({ ...f, name: v }))}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('subs.subAmount')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('subs.amountPlaceholder')}
                placeholderTextColor={COLORS.onSurfaceVariant + '60'}
                value={form.amount}
                onChangeText={v => setForm(f => ({ ...f, amount: v }))}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('subs.frequency')}</Text>
              <View style={styles.freqRow}>
                {['monthly', 'yearly'].map(freq => (
                  <TouchableOpacity
                    key={freq}
                    style={[styles.freqBtn, form.frequency === freq && styles.freqBtnActive]}
                    onPress={() => setForm(f => ({ ...f, frequency: freq }))}
                  >
                    <Text style={[styles.freqBtnText, form.frequency === freq && styles.freqBtnTextActive]}>
                      {freq === 'monthly' ? t('subs.monthly') : t('subs.yearly')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <LinearGradient
              colors={GRADIENT.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.saveBtn}
            >
              <TouchableOpacity
                style={styles.saveBtnInner}
                onPress={createSub}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveBtnText}>{t('subs.saveSub')}</Text>
                }
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Bill Reminder Modal */}
      <Modal
        visible={billModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setBillModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setBillModalVisible(false)} />
          <Animated.View style={[styles.modalCard, { transform: [{ translateY: panYBill }] }]}>
            <View style={styles.modalHandleArea} {...panResponderBill.panHandlers}>
              <View style={styles.modalHandle} />
            </View>
            <Text style={styles.modalTitle}>{t('subs.newBill')}</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('subs.billName')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('subs.billNamePlaceholder')}
                placeholderTextColor={COLORS.onSurfaceVariant + '60'}
                value={billForm.name}
                onChangeText={v => setBillForm(f => ({ ...f, name: v }))}
                autoCapitalize="words"
              />
            </View>

            <View style={{ flexDirection: 'row', gap: SPACING.md }}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>{t('subs.billDueDay')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('subs.dueDayPlaceholder')}
                  placeholderTextColor={COLORS.onSurfaceVariant + '60'}
                  value={billForm.due_day}
                  onChangeText={v => setBillForm(f => ({ ...f, due_day: v }))}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>{t('subs.billReminderDays')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('subs.reminderPlaceholder')}
                  placeholderTextColor={COLORS.onSurfaceVariant + '60'}
                  value={billForm.reminder_days}
                  onChangeText={v => setBillForm(f => ({ ...f, reminder_days: v }))}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('subs.billAmountOpt')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('subs.amountPlaceholder')}
                placeholderTextColor={COLORS.onSurfaceVariant + '60'}
                value={billForm.amount}
                onChangeText={v => setBillForm(f => ({ ...f, amount: v }))}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('common.category')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {BILL_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.freqBtn, billForm.category === cat && styles.freqBtnActive, { marginRight: SPACING.sm }]}
                    onPress={() => setBillForm(f => ({ ...f, category: cat }))}
                  >
                    <Text style={[styles.freqBtnText, billForm.category === cat && styles.freqBtnTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <LinearGradient colors={GRADIENT.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtn}>
              <TouchableOpacity style={styles.saveBtnInner} onPress={saveBill} disabled={savingBill}>
                {savingBill
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveBtnText}>{t('subs.saveReminder')}</Text>
                }
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function BillCard({ bill, onDelete, index = 0 }) {
  const { t } = useLanguage();
  const stagger = useStaggerEntrance(index, { baseDelay: 60, fromY: 14 });
  const days    = daysUntilDue(bill.due_day);
  const icon    = BILL_CAT_ICONS[bill.category] || 'receipt-outline';
  const urgent  = days <= 3;
  const soon    = days <= 7;
  const dotColor = urgent ? COLORS.danger : soon ? '#f9a825' : COLORS.secondary;

  return (
    <Animated.View style={[styles.billCard, stagger.style]}>
      <View style={[styles.billIconBox, { backgroundColor: dotColor + '20' }]}>
        <Ionicons name={icon} size={18} color={dotColor} />
      </View>
      <View style={styles.billInfo}>
        <Text style={styles.billName}>{bill.name}</Text>
        <View style={styles.billMeta}>
          <View style={[styles.billDot, { backgroundColor: dotColor }]} />
          <Text style={[styles.billDays, { color: dotColor }]}>
            {days === 0 ? t('subs.billDueToday') : days === 1 ? t('subs.billDueTomorrow') : t('subs.billDueInDays', { n: days })}
          </Text>
          <Text style={styles.billDayOf}> · day {bill.due_day}</Text>
        </View>
        {bill.amount && (
          <Text style={styles.billAmount}>
            ${parseFloat(bill.amount).toLocaleString('es-UY', { maximumFractionDigits: 0 })}
          </Text>
        )}
      </View>
      <View style={styles.billRight}>
        <View style={[styles.billReminderBadge, { borderColor: dotColor + '40', backgroundColor: dotColor + '12' }]}>
          <Ionicons name="notifications-outline" size={10} color={dotColor} />
          <Text style={[styles.billReminderText, { color: dotColor }]}>-{bill.reminder_days}d</Text>
        </View>
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }} style={{ marginTop: 6 }}>
          <Ionicons name="trash-outline" size={14} color={COLORS.onSurfaceVariant + '60'} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

function SubCard({ sub, onToggle, onDelete, index = 0 }) {
  const { t } = useLanguage();
  const { icon, color } = getServiceMeta(sub.name);
  const amount = parseFloat(sub.amount || 0);
  const stagger = useStaggerEntrance(index, { baseDelay: 65, fromY: 16 });

  return (
    <Animated.View style={[styles.subCard, !sub.is_active && styles.subCardInactive, stagger.style]}>
      {/* Icon box */}
      <View style={[styles.subIconBox, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>

      {/* Info */}
      <View style={styles.subInfo}>
        <Text style={styles.subName}>{sub.name}</Text>
        <View style={styles.subMetaRow}>
          <Text style={styles.subMeta}>
            ${amount.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
            {' · '}
            {sub.frequency === 'monthly' ? t('subs.monthly') : t('subs.yearly')}
          </Text>
          {sub.auto_detected && (
            <View style={styles.autoBadge}>
              <Text style={styles.autoBadgeText}>AUTO</Text>
            </View>
          )}
        </View>
      </View>

      {/* Controls */}
      <View style={styles.subControls}>
        <Switch
          value={sub.is_active}
          onValueChange={onToggle}
          trackColor={{ false: COLORS.surfaceContainerHigh, true: COLORS.primaryContainer }}
          thumbColor={sub.is_active ? COLORS.primary : COLORS.onSurfaceVariant}
        />
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <Ionicons name="trash-outline" size={15} color={COLORS.onSurfaceVariant + '70'} />
        </TouchableOpacity>
      </View>
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

  // Hero metric card
  heroCard: {
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.xxl,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant + '25',
    ...SHADOWS.ambient,
  },
  heroCardMain: { marginBottom: SPACING.md },
  heroCardLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
    letterSpacing: 2,
    marginBottom: SPACING.sm,
  },
  heroCardAmount: {
    fontSize: 42,
    fontWeight: '800',
    color: COLORS.onSurface,
    letterSpacing: -1,
    marginBottom: 4,
  },
  heroCardSub: { fontSize: 13, color: COLORS.onSurfaceVariant },
  bentoGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant + '30',
    paddingTop: SPACING.md,
  },
  bentoItem: { flex: 1 },
  bentoItemRight: {
    paddingLeft: SPACING.md,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.outlineVariant + '30',
  },
  bentoValue: { fontSize: 22, fontWeight: '800', color: COLORS.primary, marginBottom: 2 },
  bentoLabel: { fontSize: 11, color: COLORS.onSurfaceVariant },

  // Section
  section: { marginBottom: SPACING.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
    letterSpacing: 2,
  },
  sectionAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sectionAddText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  // Bills empty state
  billsEmpty: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    padding: SPACING.md, marginBottom: SPACING.lg,
    borderRadius: RADIUS.xl, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: COLORS.outlineVariant + '40',
  },
  billsEmptyText: { flex: 1, fontSize: 13, color: COLORS.onSurfaceVariant, lineHeight: 18 },

  // Bill card
  billCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.surfaceContainerLow,
    borderRadius: RADIUS.xl, padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.outlineVariant + '20',
  },
  billIconBox: { width: 40, height: 40, borderRadius: RADIUS.lg, justifyContent: 'center', alignItems: 'center' },
  billInfo: { flex: 1 },
  billName: { fontSize: 14, fontWeight: '700', color: COLORS.onSurface, marginBottom: 3 },
  billMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  billDot: { width: 6, height: 6, borderRadius: 3 },
  billDays: { fontSize: 12, fontWeight: '600' },
  billDayOf: { fontSize: 12, color: COLORS.onSurfaceVariant },
  billAmount: { fontSize: 13, fontWeight: '700', color: COLORS.onSurface, marginTop: 3 },
  billRight: { alignItems: 'flex-end' },
  billReminderBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: RADIUS.full, borderWidth: 1,
  },
  billReminderText: { fontSize: 10, fontWeight: '700' },

  // Sub card
  subCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surfaceContainerLow,
    borderRadius: RADIUS.xxl,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant + '20',
  },
  subCardInactive: { opacity: 0.45 },
  subIconBox: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subInfo: { flex: 1 },
  subName: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface, marginBottom: 3 },
  subMetaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  subMeta: { fontSize: 12, color: COLORS.onSurfaceVariant },
  autoBadge: {
    backgroundColor: COLORS.secondary + '20',
    borderRadius: RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  autoBadgeText: { fontSize: 8, fontWeight: '700', color: COLORS.secondary, letterSpacing: 1 },
  subControls: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },

  // Optimize card
  optimizeCard: {
    borderRadius: RADIUS.xxl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.primaryContainer + '30',
  },
  optimizeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  optimizeText: { flex: 1, marginRight: SPACING.md },
  optimizeTitle: { fontSize: 16, fontWeight: '800', color: COLORS.onSurface, marginBottom: 6 },
  optimizeSub: { fontSize: 13, color: COLORS.onSurfaceVariant, lineHeight: 18 },
  optimizeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.secondary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Add button
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: '#00000080',
  },
  modalCard: {
    backgroundColor: COLORS.surfaceContainer,
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    padding: SPACING.lg,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: COLORS.outlineVariant + '30',
  },
  modalHandleArea: { alignItems: 'center', paddingTop: SPACING.sm, paddingBottom: SPACING.md, marginBottom: SPACING.sm },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.outlineVariant,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.onSurface,
    marginBottom: SPACING.xl,
    letterSpacing: -0.3,
  },
  inputGroup: { marginBottom: SPACING.lg },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
    letterSpacing: 1.5,
    marginBottom: SPACING.sm,
  },
  input: {
    backgroundColor: COLORS.surfaceContainerHigh,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    fontSize: 15,
    color: COLORS.onSurface,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant + '30',
  },
  freqRow: { flexDirection: 'row', gap: SPACING.sm },
  freqBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surfaceContainerHigh,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.outlineVariant + '30',
  },
  freqBtnActive: {
    backgroundColor: COLORS.primaryContainer,
    borderColor: COLORS.primary + '50',
  },
  freqBtnText: { fontSize: 14, color: COLORS.onSurfaceVariant, fontWeight: '600' },
  freqBtnTextActive: { color: COLORS.primary },
  saveBtn: {
    borderRadius: RADIUS.lg,
    marginTop: SPACING.sm,
    overflow: 'hidden',
  },
  saveBtnInner: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // Empty state
  emptyCard: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
    marginBottom: SPACING.xl,
  },
  emptyIconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primaryContainer + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.onSurface, marginBottom: SPACING.sm },
  emptyHint: { fontSize: 14, color: COLORS.onSurfaceVariant, textAlign: 'center', lineHeight: 20 },
});
