import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useAuth } from '../context/AuthContext';
import { COLORS, SPACING, RADIUS } from '../theme';

export default function LoginScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      return Toast.show({ type: 'error', text1: 'Completá todos los campos' });
    }
    if (mode === 'register' && !name.trim()) {
      return Toast.show({ type: 'error', text1: 'Ingresá tu nombre' });
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email.trim().toLowerCase(), password);
      } else {
        await register(name.trim(), email.trim().toLowerCase(), password);
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Error de conexión';
      Toast.show({ type: 'error', text1: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Text style={styles.logoIcon}>💸</Text>
          <Text style={styles.logoText}>MoneyFlow</Text>
          <Text style={styles.logoSub}>Tu plata, bajo control</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          {/* Toggle login/register */}
          <View style={styles.toggle}>
            <TouchableOpacity
              style={[styles.toggleBtn, mode === 'login' && styles.toggleActive]}
              onPress={() => setMode('login')}
            >
              <Text style={[styles.toggleText, mode === 'login' && styles.toggleTextActive]}>
                Entrar
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, mode === 'register' && styles.toggleActive]}
              onPress={() => setMode('register')}
            >
              <Text style={[styles.toggleText, mode === 'register' && styles.toggleTextActive]}>
                Registrarse
              </Text>
            </TouchableOpacity>
          </View>

          {mode === 'register' && (
            <TextInput
              style={styles.input}
              placeholder="Tu nombre"
              placeholderTextColor={COLORS.textMuted}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          )}

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={COLORS.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TextInput
            style={styles.input}
            placeholder="Contraseña"
            placeholderTextColor={COLORS.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>
                {mode === 'login' ? 'Entrar' : 'Crear cuenta'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: SPACING.lg },
  logoContainer: { alignItems: 'center', marginBottom: SPACING.xxl },
  logoIcon: { fontSize: 56 },
  logoText: { fontSize: 36, fontWeight: '700', color: COLORS.text, marginTop: SPACING.sm },
  logoSub: { fontSize: 14, color: COLORS.textSecondary, marginTop: SPACING.xs },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggle: { flexDirection: 'row', backgroundColor: COLORS.surfaceLight, borderRadius: RADIUS.md, marginBottom: SPACING.lg, padding: 4 },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: RADIUS.sm },
  toggleActive: { backgroundColor: COLORS.primary },
  toggleText: { color: COLORS.textSecondary, fontWeight: '600' },
  toggleTextActive: { color: '#fff' },
  input: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    color: COLORS.text,
    fontSize: 16,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
