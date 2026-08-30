import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Animated,
} from 'react-native';
import { useEntrance, usePressScale, usePulse } from '../utils/animations';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../api/client';
import { encryptFile } from '../utils/encryption';
import { usePlan } from '../context/PlanContext';
import { COLORS, SPACING, RADIUS, GRADIENT, SHADOWS } from '../theme';
import { useLanguage } from '../context/LanguageContext';

export default function UploadScreen() {
  const { t } = useLanguage();
  const { canUpload, showUpgrade } = usePlan();
  const [uploading, setUploading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState('encrypting'); // 'encrypting' | 'uploading'
  const [progress] = useState(72);
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState(null);

  const heroAnim     = useEntrance({ delay: 0,   fromY: 24 });
  const dropAnim     = useEntrance({ delay: 100, fromY: 32 });
  const featuresAnim = useEntrance({ delay: 220, fromY: 20 });
  const dropPress    = usePressScale(0.97);
  const glowPulse    = usePulse({ min: 0.08, max: 0.22, duration: 2200 });

  const pickAndUpload = async () => {
    if (!canUpload) {
      showUpgrade('upload');
      return;
    }
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (picked.canceled) return;

      const file = picked.assets[0];
      setFileName(file.name);
      setUploading(true);
      setUploadPhase('encrypting');
      setResult(null);

      // Encrypt the file client-side before sending
      const payload = await encryptFile(
        file.uri,
        file.mimeType || 'application/pdf',
        file.name,
      );

      setUploadPhase('uploading');

      const { data } = await api.post('/upload', payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000,
      });

      setResult(data);
      Toast.show({
        type: 'success',
        text1: t('upload.successUpload', { count: data.inserted }),
        text2: data.subscriptionsDetected > 0
          ? t('upload.successSubs', { n: data.subscriptionsDetected })
          : undefined,
      });
    } catch (err) {
      const msg = err.response?.data?.error || t('upload.errorUpload');
      Toast.show({ type: 'error', text1: msg });
    } finally {
      setUploading(false);
    }
  };

  // SVG-like circular progress con Views
  const RADIUS_RING = 28;
  const STROKE = 4;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS_RING;
  const offset = CIRCUMFERENCE * (1 - progress / 100);

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

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <Animated.View style={[styles.hero, heroAnim.style]}>
          <Text style={styles.heroTitle}>{t('upload.heroTitle')}</Text>
          <Text style={styles.heroSubtitle}>{t('upload.heroSubtitle')}</Text>
        </Animated.View>

        {/* Tarjeta de progreso — solo cuando está procesando */}
        {uploading && fileName && (
          <View style={styles.progressCard}>
            <View style={styles.progressRingContainer}>
              {/* Anillo de progreso simple */}
              <View style={styles.ringOuter}>
                <View style={styles.ringInner}>
                  <Text style={styles.ringText}>{progress}%</Text>
                </View>
              </View>
            </View>
            <View style={styles.progressInfo}>
              <View style={styles.progressRow}>
                <Text style={styles.progressFileName} numberOfLines={1}>{fileName}</Text>
                <Text style={styles.processingTag}>{t('upload.processing')}</Text>
              </View>
              <Text style={styles.progressHint}>
                {uploadPhase === 'encrypting' ? t('upload.encrypting') : t('upload.extracting')}
              </Text>
            </View>
          </View>
        )}

        {/* Drop zone */}
        <Animated.View style={[styles.dropZoneWrapper, dropAnim.style]}>
        <TouchableOpacity
          onPress={pickAndUpload}
          disabled={uploading}
          activeOpacity={1}
          style={{ flex: 1 }}
          onPressIn={dropPress.onPressIn}
          onPressOut={dropPress.onPressOut}
        >
          <Animated.View style={dropPress.style}>
          {/* Glow exterior — animated pulse */}
          <Animated.View style={[styles.dropZoneGlow, glowPulse.style]} />
          <View style={[styles.dropZone, uploading && styles.dropZoneUploading, !canUpload && styles.dropZoneLocked]}>
            <LinearGradient
              colors={canUpload ? GRADIENT.primary : GRADIENT.locked}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.uploadIconBg}
            >
              {uploading
                ? <ActivityIndicator color={COLORS.onPrimary} size="large" />
                : <Ionicons name={canUpload ? 'cloud-upload' : 'lock-closed'} size={32} color={canUpload ? COLORS.onPrimary : COLORS.onPrimaryContainer} />
              }
            </LinearGradient>
            <Text style={styles.dropTitle}>{canUpload ? t('upload.dropTitle') : t('premium.lockedUpload')}</Text>
            <Text style={styles.dropHint}>{canUpload ? t('upload.dropHint') : t('premium.upgradeNudgeUpload')}</Text>
            <View style={styles.formatRow}>
              <View style={styles.formatTag}>
                <Ionicons name="document-outline" size={12} color={COLORS.onSurfaceVariant} />
                <Text style={styles.formatText}>PDF</Text>
              </View>
              <View style={styles.formatTag}>
                <Ionicons name="grid-outline" size={12} color={COLORS.onSurfaceVariant} />
                <Text style={styles.formatText}>CSV</Text>
              </View>
            </View>
          </View>
          </Animated.View>
        </TouchableOpacity>
        </Animated.View>

        {/* Feature cards */}
        <Animated.View style={[styles.featureGrid, featuresAnim.style]}>
          <View style={styles.featureCard}>
            <Ionicons name="shield-checkmark-outline" size={24} color={COLORS.primary} style={styles.featureIcon} />
            <Text style={styles.featureTitle}>{t('upload.featurePrivate')}</Text>
            <Text style={styles.featureDesc}>{t('upload.featurePrivateDesc')}</Text>
          </View>
          <View style={styles.featureCard}>
            <Ionicons name="flash-outline" size={24} color={COLORS.secondary} style={styles.featureIcon} />
            <Text style={styles.featureTitle}>{t('upload.featureCategories')}</Text>
            <Text style={styles.featureDesc}>{t('upload.featureCategoriesDesc')}</Text>
          </View>
        </Animated.View>

        {/* Resultado */}
        {result && (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>{t('upload.importComplete')}</Text>
            <View style={styles.statsRow}>
              <StatBadge label={t('upload.imported')} value={result.inserted} color={COLORS.secondary} />
              <StatBadge label={t('upload.skipped')} value={result.skipped} color={COLORS.onSurfaceVariant} />
              <StatBadge label={t('upload.subscriptionsLabel')} value={result.subscriptionsDetected} color={COLORS.primary} />
            </View>
            {result.transactions?.slice(0, 5).map((tx, i) => (
              <View key={i} style={styles.txRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>
                  <Text style={styles.txMeta}>{tx.date} · {tx.category}</Text>
                </View>
                <Text style={[styles.txAmount, { color: tx.type === 'debit' ? COLORS.expense : COLORS.income }]}>
                  {tx.type === 'debit' ? '-' : '+'}${tx.amount.toLocaleString()}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

function StatBadge({ label, value, color }) {
  return (
    <View style={styles.statBadge}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

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

  // Progress card
  progressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.xxl,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant + '30',
    ...SHADOWS.ambient,
  },
  progressRingContainer: { width: 56, height: 56, justifyContent: 'center', alignItems: 'center' },
  ringOuter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 4,
    borderColor: COLORS.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringInner: { justifyContent: 'center', alignItems: 'center' },
  ringText: { fontSize: 12, fontWeight: '800', color: COLORS.secondary },
  progressInfo: { flex: 1 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  progressFileName: { fontSize: 14, fontWeight: '700', color: COLORS.onSurface, flex: 1, marginRight: 8 },
  processingTag: { fontSize: 9, fontWeight: '700', color: COLORS.secondary, letterSpacing: 1.5 },
  progressHint: { fontSize: 12, color: COLORS.onSurfaceVariant },

  // Drop zone
  dropZoneWrapper: { marginBottom: SPACING.xl, position: 'relative' },
  dropZoneGlow: {
    position: 'absolute',
    inset: -4,
    borderRadius: 40,
    backgroundColor: COLORS.primaryContainer,
    opacity: 0.12,
  },
  dropZone: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
    borderRadius: 36,
    backgroundColor: COLORS.surfaceContainerLow,
    borderWidth: 2,
    borderColor: COLORS.outlineVariant + '50',
    borderStyle: 'dashed',
    gap: SPACING.sm,
  },
  dropZoneUploading: { opacity: 0.7 },
  dropZoneLocked: { opacity: 0.65, borderStyle: 'solid', borderColor: COLORS.outlineVariant + '60' },
  uploadIconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    ...SHADOWS.nebula,
  },
  dropTitle: { fontSize: 18, fontWeight: '700', color: COLORS.onSurface },
  dropHint: { fontSize: 13, color: COLORS.onSurfaceVariant },
  formatRow: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.sm },
  formatTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant + '30',
  },
  formatText: { fontSize: 10, fontWeight: '700', color: COLORS.onSurfaceVariant, letterSpacing: 1.5 },

  // Feature cards
  featureGrid: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.xl },
  featureCard: {
    flex: 1,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: RADIUS.xxl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant + '20',
  },
  featureIcon: { marginBottom: SPACING.sm },
  featureTitle: { fontSize: 14, fontWeight: '700', color: COLORS.onSurface, marginBottom: 4 },
  featureDesc: { fontSize: 12, color: COLORS.onSurfaceVariant, lineHeight: 18 },

  // Result
  resultCard: {
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.xxl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  resultTitle: { fontSize: 18, fontWeight: '700', color: COLORS.onSurface, marginBottom: SPACING.md },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: SPACING.lg },
  statBadge: { alignItems: 'center' },
  statValue: { fontSize: 26, fontWeight: '800' },
  statLabel: { fontSize: 11, color: COLORS.onSurfaceVariant, marginTop: 2 },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant + '30',
  },
  txDesc: { fontSize: 14, color: COLORS.onSurface },
  txMeta: { fontSize: 11, color: COLORS.onSurfaceVariant, marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: '700' },
});
