import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Animated,
} from 'react-native';
import { useEntrance, usePressScale } from '../utils/animations';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { COLORS, SPACING, RADIUS, GRADIENT } from '../theme';

export default function LoginScreen() {
  const { login, register } = useAuth();
  const { t, lang, toggleLanguage } = useLanguage();
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const brandAnim  = useEntrance({ delay: 0,   fromY: -40, duration: 600 });
  const formAnim   = useEntrance({ delay: 180,  fromY: 40,  duration: 560 });
  const footerAnim = useEntrance({ delay: 350,  fromY: 20,  duration: 500 });
  const btnPress   = usePressScale(0.97);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      return Toast.show({ type: 'error', text1: t('login.errorFields') });
    }
    if (mode === 'register' && !name.trim()) {
      return Toast.show({ type: 'error', text1: t('login.errorName') });
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
    <View style={styles.root}>
      {/* Nebula glow decorativo */}
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Brand ─────────────────────────────────── */}
          <Animated.View style={[styles.brand, brandAnim.style]}>
            <LinearGradient
              colors={GRADIENT.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoBox}
            >
              <Ionicons name="cash" size={32} color={COLORS.onPrimary} />
            </LinearGradient>
            <Text style={styles.appName}>MoneyFlow</Text>
            <Text style={styles.tagline}>{t('login.tagline')}</Text>
          </Animated.View>

          {/* ── Formulario ────────────────────────────── */}
          <Animated.View style={[styles.form, formAnim.style]}>

            {mode === 'register' && (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{t('login.name')}</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="person-outline" size={18} color={COLORS.outlineVariant} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder={t('login.namePlaceholder')}
                    placeholderTextColor={COLORS.textMuted}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                  />
                </View>
              </View>
            )}

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t('login.email')}</Text>
              <View style={styles.inputRow}>
                <Ionicons name="at-outline" size={18} color={COLORS.outlineVariant} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={t('login.emailPlaceholder')}
                  placeholderTextColor={COLORS.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>{t('login.password')}</Text>
                <TouchableOpacity>
                  <Text style={styles.forgot}>{t('login.forgotPassword')}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.inputRow}>
                <Ionicons name="lock-closed-outline" size={18} color={COLORS.outlineVariant} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={COLORS.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
              </View>
            </View>

            {/* Botón Sign In con gradiente */}
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={1}
              onPressIn={btnPress.onPressIn}
              onPressOut={btnPress.onPressOut}
            >
              <Animated.View style={btnPress.style}>
              <LinearGradient
                colors={[COLORS.primaryContainer, COLORS.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.signInBtn}
              >
                {loading
                  ? <ActivityIndicator color={COLORS.onPrimary} />
                  : <Text style={styles.signInText}>
                      {mode === 'login' ? t('login.signIn') : t('login.createAccount')}
                    </Text>
                }
              </LinearGradient>
              </Animated.View>
            </TouchableOpacity>

            {/* Separador OR CONTINUE WITH */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t('login.orContinueWith')}</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Social login */}
            <View style={styles.socialRow}>
              <TouchableOpacity style={styles.socialBtn} activeOpacity={0.8}>
                <Text style={styles.socialIcon}>G</Text>
                <Text style={styles.socialText}>Google</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.socialBtn} activeOpacity={0.8}>
                <Ionicons name="logo-apple" size={18} color={COLORS.onSurface} />
                <Text style={styles.socialText}>Apple</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* ── Footer ────────────────────────────────── */}
          <Animated.View style={[styles.footer, footerAnim.style]}>
            {mode === 'login' ? (
              <Text style={styles.footerText}>
                {t('login.noAccount')}{' '}
                <Text style={styles.footerLink} onPress={() => setMode('register')}>
                  {t('login.signUp')}
                </Text>
              </Text>
            ) : (
              <Text style={styles.footerText}>
                {t('login.hasAccount')}{' '}
                <Text style={styles.footerLink} onPress={() => setMode('login')}>
                  {t('login.signIn')}
                </Text>
              </Text>
            )}
            <TouchableOpacity onPress={toggleLanguage} style={styles.langToggle}>
              <Text style={styles.langToggleText}>{lang === 'es' ? '🌐 English' : '🌐 Español'}</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
    overflow: 'hidden',
  },
  // Nebula glows
  glowTop: {
    position: 'absolute',
    top: -80,
    right: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: COLORS.primaryContainer,
    opacity: 0.12,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -60,
    left: -60,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: COLORS.secondary,
    opacity: 0.06,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xxl,
  },
  // Brand
  brand: {
    alignItems: 'center',
    marginBottom: SPACING.xxl,
  },
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
    shadowColor: COLORS.primaryContainer,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  appName: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.onSurface,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.onSurfaceVariant,
    letterSpacing: 3,
    marginTop: 6,
  },
  // Form
  form: {
    gap: SPACING.md,
  },
  fieldGroup: {
    gap: SPACING.xs,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
    letterSpacing: 2,
    marginLeft: 4,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  forgot: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
  },
  inputIcon: {
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    color: COLORS.onSurface,
    fontSize: 15,
  },
  // Sign In button
  signInBtn: {
    borderRadius: RADIUS.xxl,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: SPACING.sm,
    shadowColor: COLORS.primaryContainer,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  signInText: {
    color: COLORS.onPrimary,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginVertical: SPACING.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.outlineVariant,
    opacity: 0.3,
  },
  dividerText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.onSurfaceVariant,
    letterSpacing: 2,
  },
  // Social
  socialRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surfaceContainerLow,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
  },
  socialIcon: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4285F4',
  },
  socialText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  // Footer
  footer: {
    alignItems: 'center',
    marginTop: SPACING.xl,
  },
  footerText: {
    color: COLORS.onSurfaceVariant,
    fontSize: 14,
  },
  footerLink: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  langToggle: {
    marginTop: SPACING.md,
  },
  langToggleText: {
    color: COLORS.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '600',
  },
});
