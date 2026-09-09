import React, { useState } from 'react';
import {
  View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Txt, Input, Button, Segmented } from '../components/ui';
import { COLORS, SPACING, RADIUS, GRADIENTS, FONTS, SHADOWS } from '../theme';

export default function LoginScreen() {
  const { login, register } = useAuth();
  const { t, lang, toggleLanguage } = useLanguage();

  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

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
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Error de conexión' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      {/* Halo decorativo. Es el único gradiente de la pantalla: el resto del
          contraste lo dan las superficies. */}
      <LinearGradient
        colors={GRADIENTS.glow}
        style={styles.glow}
        pointerEvents="none"
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Ionicons name="cash" size={30} color={COLORS.onPrimary} />
            </View>
            <Txt variant="h1" style={styles.appName}>MoneyFlow</Txt>
            <Txt variant="body" color={COLORS.textMid} center>{t('login.tagline')}</Txt>
          </View>

          <Segmented
            options={[
              { value: 'login', label: t('login.signIn') },
              { value: 'register', label: t('login.createAccount') },
            ]}
            value={mode}
            onChange={setMode}
            style={styles.modeToggle}
          />

          <View style={styles.form}>
            {mode === 'register' ? (
              <View style={styles.campo}>
                <Txt variant="overline" color={COLORS.textLow} style={styles.label}>
                  {t('login.name')}
                </Txt>
                <Input
                  icon="person-outline"
                  value={name}
                  onChangeText={setName}
                  placeholder={t('login.namePlaceholder')}
                  autoCapitalize="words"
                />
              </View>
            ) : null}

            <View style={styles.campo}>
              <Txt variant="overline" color={COLORS.textLow} style={styles.label}>
                {t('login.email')}
              </Txt>
              <Input
                icon="at-outline"
                value={email}
                onChangeText={setEmail}
                placeholder={t('login.emailPlaceholder')}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.campo}>
              <View style={styles.labelRow}>
                <Txt variant="overline" color={COLORS.textLow}>{t('login.password')}</Txt>
                <Pressable hitSlop={8}>
                  <Txt variant="caption" color={COLORS.textMid}>{t('login.forgotPassword')}</Txt>
                </Pressable>
              </View>
              <Input
                icon="lock-closed-outline"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry
              />
            </View>

            <Button
              label={mode === 'login' ? t('login.signIn') : t('login.createAccount')}
              onPress={handleSubmit}
              loading={loading}
              size="lg"
              fullWidth
              style={{ marginTop: SPACING.s }}
            />

            <View style={styles.divisor}>
              <View style={styles.divisorLinea} />
              <Txt variant="caption" color={COLORS.textLow} style={styles.divisorTxt}>
                {t('login.orContinueWith')}
              </Txt>
              <View style={styles.divisorLinea} />
            </View>

            <View style={styles.social}>
              <Button label="Google" variant="secondary" onPress={() => {}} style={{ flex: 1 }} />
              <Button label="Apple" variant="secondary" icon="logo-apple" onPress={() => {}} style={{ flex: 1 }} />
            </View>
          </View>

          <View style={styles.footer}>
            <Button
              label={lang === 'es' ? '🌐 English' : '🌐 Español'}
              variant="ghost"
              size="sm"
              onPress={toggleLanguage}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  glow: { position: 'absolute', top: -80, left: -60, right: -60, height: 340 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: SPACING.l, paddingVertical: SPACING.xxl },

  brand: { alignItems: 'center', marginBottom: SPACING.xl },
  logo: {
    width: 64, height: 64, borderRadius: RADIUS.l,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.m,
    ...SHADOWS.glow,
  },
  appName: { marginBottom: 4 },

  modeToggle: { alignSelf: 'center', marginBottom: SPACING.l },
  form: { gap: SPACING.m },
  campo: {},
  label: { marginBottom: SPACING.s },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.s },

  divisor: { flexDirection: 'row', alignItems: 'center', marginVertical: SPACING.s },
  divisorLinea: { flex: 1, height: 1, backgroundColor: COLORS.border },
  divisorTxt: { marginHorizontal: SPACING.s, fontFamily: FONTS.medium },

  social: { flexDirection: 'row', gap: SPACING.s },
  footer: { alignItems: 'center', marginTop: SPACING.xl },
});
