import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import api from '../api/client';
import { encryptFile } from '../utils/encryption';
import { usePlan } from '../context/PlanContext';
import { useLanguage } from '../context/LanguageContext';
import {
  Txt, Card, Badge, Button, ProgressBar, ScreenHeader, formatUYU,
} from '../components/ui';
import { COLORS, SPACING, RADIUS, FONTS, SHADOWS } from '../theme';

// Pasos reales del proceso. Antes el anillo mostraba un 72% fijo escrito a
// mano: un porcentaje inventado es peor que no mostrar ninguno, porque el
// usuario lo lee como información. Esto sí se sabe.
const PASOS = { encrypting: 1, uploading: 2 };
const TOTAL_PASOS = 2;

export default function UploadScreen() {
  const { t } = useLanguage();
  const { canUpload, showUpgrade } = usePlan();

  const [uploading, setUploading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState('encrypting');
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState(null);

  const pickAndUpload = async () => {
    if (!canUpload) { showUpgrade('upload'); return; }
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

      // Se cifra en el cliente ANTES de enviar: el servidor recibe el archivo
      // ya cifrado y la clave AES envuelta con su RSA pública.
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
      Toast.show({ type: 'error', text1: err.response?.data?.error || t('upload.errorUpload') });
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title={t('upload.heroTitle')} subtitle={t('upload.heroSubtitle')} />

        {uploading && fileName ? (
          <Card variant="raised" style={styles.bloque}>
            <View style={styles.progHead}>
              <Txt variant="caption" color={COLORS.textHigh} style={styles.fileName} numberOfLines={1}>
                {fileName}
              </Txt>
              <Badge variant="status" label={t('upload.processing')} />
            </View>
            <Txt variant="caption" color={COLORS.textMid} style={{ marginBottom: 10 }}>
              {uploadPhase === 'encrypting' ? t('upload.encrypting') : t('upload.extracting')}
              {` · paso ${PASOS[uploadPhase]} de ${TOTAL_PASOS}`}
            </Txt>
            <ProgressBar value={PASOS[uploadPhase]} max={TOTAL_PASOS} />
          </Card>
        ) : null}

        {/* Zona de subida */}
        <Pressable
          onPress={pickAndUpload}
          disabled={uploading}
          style={({ pressed }) => [
            styles.drop,
            !canUpload && styles.dropLocked,
            pressed && styles.pressed,
          ]}
        >
          <View style={[styles.dropIcon, !canUpload && styles.dropIconLocked]}>
            <Ionicons
              name={canUpload ? 'cloud-upload' : 'lock-closed'}
              size={30}
              color={canUpload ? COLORS.onPrimary : COLORS.onPremium}
            />
          </View>
          <Txt variant="h2" center style={styles.dropTitle}>
            {canUpload ? t('upload.dropTitle') : t('premium.lockedUpload')}
          </Txt>
          <Txt variant="body" color={COLORS.textMid} center style={styles.dropHint}>
            {canUpload ? t('upload.dropHint') : t('premium.upgradeNudgeUpload')}
          </Txt>
          <View style={styles.formatos}>
            <Badge variant="statusMuted" icon="document-outline" label="PDF" />
            <Badge variant="statusMuted" icon="grid-outline" label="CSV" />
          </View>
        </Pressable>

        <View style={styles.features}>
          <Card style={styles.featureCard}>
            <Ionicons name="shield-checkmark-outline" size={24} color={COLORS.primary} />
            <Txt variant="h2" style={styles.featureTitle}>{t('upload.featurePrivate')}</Txt>
            <Txt variant="caption" color={COLORS.textMid}>{t('upload.featurePrivateDesc')}</Txt>
          </Card>
          <Card style={styles.featureCard}>
            <Ionicons name="flash-outline" size={24} color={COLORS.accent} />
            <Txt variant="h2" style={styles.featureTitle}>{t('upload.featureCategories')}</Txt>
            <Txt variant="caption" color={COLORS.textMid}>{t('upload.featureCategoriesDesc')}</Txt>
          </Card>
        </View>

        {result ? (
          <Card variant="best" label={t('upload.importComplete')} style={styles.bloque}>
            <View style={styles.stats}>
              <Stat label={t('upload.imported')} value={result.inserted} color={COLORS.income} />
              <Stat label={t('upload.skipped')} value={result.skipped} color={COLORS.textMid} />
              <Stat label={t('upload.subscriptionsLabel')} value={result.subscriptionsDetected} color={COLORS.accent} />
            </View>
            {result.transactions?.slice(0, 5).map((tx, i) => (
              <View key={i} style={styles.txRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="caption" color={COLORS.textHigh} style={styles.txDesc} numberOfLines={1}>
                    {tx.description}
                  </Txt>
                  <Txt variant="caption" color={COLORS.textLow} style={styles.txMeta}>
                    {tx.date} · {tx.category}
                  </Txt>
                </View>
                <Txt style={[styles.txAmount, { color: tx.type === 'debit' ? COLORS.expense : COLORS.income }]}>
                  {tx.type === 'debit' ? '−' : '+'}{formatUYU(tx.amount)}
                </Txt>
              </View>
            ))}
          </Card>
        ) : null}

        {/* Aire para la tab bar flotante. */}
        <View style={{ height: 110 }} />
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, color }) {
  return (
    <View style={styles.stat}>
      <Txt style={[styles.statValue, { color }]}>{value}</Txt>
      <Txt variant="caption" color={COLORS.textLow}>{label}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: SPACING.m, paddingTop: 60 },
  bloque: { marginTop: SPACING.m },
  pressed: { opacity: 0.85 },

  progHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  fileName: { fontFamily: FONTS.semibold, flex: 1, marginRight: SPACING.s },

  drop: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.l,
    marginTop: SPACING.m,
  },
  dropLocked: { borderColor: COLORS.premiumBorder, borderStyle: 'solid' },
  dropIcon: {
    width: 68, height: 68, borderRadius: RADIUS.l,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.m,
    ...SHADOWS.glow,
  },
  dropIconLocked: { backgroundColor: COLORS.premium, ...SHADOWS.gold },
  dropTitle: { marginBottom: 6 },
  dropHint: { marginBottom: SPACING.m },
  formatos: { flexDirection: 'row', gap: SPACING.s },

  features: { flexDirection: 'row', gap: SPACING.s, marginTop: SPACING.m },
  featureCard: { flex: 1 },
  featureTitle: { fontSize: 15, marginTop: SPACING.s, marginBottom: 4 },

  stats: { flexDirection: 'row', gap: SPACING.s, marginBottom: SPACING.s },
  stat: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: COLORS.surfaceSunken,
    borderRadius: RADIUS.m,
    paddingVertical: 12,
  },
  statValue: { fontFamily: FONTS.amountBold, fontSize: 20, lineHeight: 24, marginBottom: 2 },

  txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  txDesc: { fontFamily: FONTS.semibold },
  txMeta: { fontSize: 12, marginTop: 2 },
  txAmount: { fontFamily: FONTS.amountBold, fontSize: 13, lineHeight: 16, marginLeft: SPACING.s },
});
