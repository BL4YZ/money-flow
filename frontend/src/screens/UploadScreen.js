import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, FlatList,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { COLORS, SPACING, RADIUS } from '../theme';

export default function UploadScreen() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState(null);

  const pickAndUpload = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (picked.canceled) return;

      const file = picked.assets[0];
      setFileName(file.name);
      setUploading(true);
      setResult(null);

      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.mimeType || 'application/pdf',
      });

      const { data } = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });

      setResult(data);
      Toast.show({
        type: 'success',
        text1: `${data.inserted} transacciones importadas`,
        text2: data.subscriptionsDetected > 0
          ? `${data.subscriptionsDetected} suscripciones detectadas`
          : undefined,
      });
    } catch (err) {
      const msg = err.response?.data?.error || 'Error al procesar el archivo';
      Toast.show({ type: 'error', text1: msg });
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Subir Estado de Cuenta</Text>
      <Text style={styles.subtitle}>
        Importá tu PDF bancario y detectamos todas tus transacciones automáticamente.
      </Text>

      {/* Drop zone */}
      <TouchableOpacity
        style={[styles.dropZone, uploading && styles.dropZoneDisabled]}
        onPress={pickAndUpload}
        disabled={uploading}
      >
        {uploading ? (
          <>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.dropZoneText}>Procesando con OCR...</Text>
            <Text style={styles.dropZoneHint}>Esto puede tardar 30-60 segundos</Text>
          </>
        ) : (
          <>
            <Ionicons name="cloud-upload-outline" size={48} color={COLORS.primary} />
            <Text style={styles.dropZoneText}>Tocá para seleccionar PDF</Text>
            <Text style={styles.dropZoneHint}>PDF o imagen · máx. 20MB</Text>
            {fileName && <Text style={styles.fileName}>{fileName}</Text>}
          </>
        )}
      </TouchableOpacity>

      {/* Bancos soportados */}
      <View style={styles.banksCard}>
        <Text style={styles.banksTitle}>Bancos compatibles</Text>
        <View style={styles.banksList}>
          {['BROU', 'Santander', 'BBVA', 'Itaú', 'HSBC', 'Scotiabank'].map(b => (
            <View key={b} style={styles.bankTag}>
              <Text style={styles.bankText}>{b}</Text>
            </View>
          ))}
          <View style={styles.bankTag}>
            <Text style={styles.bankText}>+ más</Text>
          </View>
        </View>
      </View>

      {/* Resultado */}
      {result && (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>Importación completada</Text>
          <View style={styles.statsRow}>
            <Stat label="Importadas" value={result.inserted} color={COLORS.success} />
            <Stat label="Duplicadas" value={result.skipped} color={COLORS.textSecondary} />
            <Stat label="Suscripciones" value={result.subscriptionsDetected} color={COLORS.primary} />
          </View>

          {result.transactions?.length > 0 && (
            <>
              <Text style={styles.previewTitle}>Vista previa</Text>
              {result.transactions.map((tx, i) => (
                <View key={i} style={styles.txRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>
                    <Text style={styles.txDate}>{tx.date} · {tx.category}</Text>
                  </View>
                  <Text style={[styles.txAmount, { color: tx.type === 'debit' ? COLORS.expense : COLORS.income }]}>
                    {tx.type === 'debit' ? '-' : '+'}${tx.amount.toLocaleString()}
                  </Text>
                </View>
              ))}
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function Stat({ label, value, color }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, paddingTop: 56 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.xs },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginBottom: SPACING.xl, lineHeight: 20 },
  dropZone: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    borderRadius: RADIUS.lg,
    padding: SPACING.xxl,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginBottom: SPACING.lg,
  },
  dropZoneDisabled: { opacity: 0.7 },
  dropZoneText: { color: COLORS.text, fontSize: 16, fontWeight: '600', marginTop: SPACING.md },
  dropZoneHint: { color: COLORS.textSecondary, fontSize: 12, marginTop: SPACING.xs },
  fileName: { color: COLORS.primary, fontSize: 13, marginTop: SPACING.sm },
  banksCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  banksTitle: { color: COLORS.textSecondary, fontSize: 12, marginBottom: SPACING.sm, fontWeight: '600' },
  banksList: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  bankTag: { backgroundColor: COLORS.surfaceLight, borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 4 },
  bankText: { color: COLORS.text, fontSize: 12 },
  resultCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  resultTitle: { color: COLORS.text, fontSize: 18, fontWeight: '700', marginBottom: SPACING.md },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: SPACING.lg },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 28, fontWeight: '700' },
  statLabel: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  previewTitle: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: SPACING.sm },
  txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  txDesc: { color: COLORS.text, fontSize: 14 },
  txDate: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: '700' },
});
