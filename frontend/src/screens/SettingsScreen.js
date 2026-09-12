import React, { useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import api from '../api/client';
import SecuritySheet from '../components/SecuritySheet';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { usePlan } from '../context/PlanContext';
import {
  Txt, Card, Badge, Button, Segmented, Toggle, ScreenHeader, Glow,
} from '../components/ui';
import { COLORS, SPACING, RADIUS, FONTS } from '../theme';

/**
 * Configuración, detrás del perfil.
 *
 * POR QUÉ EXISTE. El cambio de idioma era un botón "EN/ES" en el encabezado del
 * inicio, al lado de salir: dos controles que casi nadie toca ocupando lugar en
 * la pantalla donde hay que entender qué hacer. Pedido textual: que tocar el
 * perfil lleve a una pantalla de configuración y que el idioma viva ahí.
 *
 * LO QUE HAY ACÁ ES LO QUE DE VERDAD HACE ALGO. No hay un interruptor de
 * "modo oscuro" ni de "sonidos" porque no existen: un control que no cambia
 * nada es peor que no tenerlo — se toca, no pasa nada, y a partir de ahí la app
 * entera se vuelve dudosa. Son tres cosas reales: el idioma, los recordatorios
 * de vencimientos y tus datos.
 *
 * DE PASO ARREGLA ALGO ENTERRADO. Exportar tus datos y borrar tu cuenta viven
 * dentro de `SecuritySheet`, y hasta ahora esa hoja se abría desde la pantalla
 * de subir el resumen del banco. Irse de una app con lo tuyo no puede estar
 * escondido detrás del lugar donde se sube un archivo.
 */
export default function SettingsScreen() {
  const navigation = useNavigation();
  const { user, logout } = useAuth();
  const { lang, t, switchLanguage } = useLanguage();
  const { plan, isTrial, trialDays, showUpgrade } = usePlan();

  const [seguridadVisible, setSeguridadVisible] = useState(false);
  // Arranca en lo que dice el servidor. `!== false` y no `=== true`: si la
  // cuenta es vieja y el campo todavía no viajó, el estado real es "encendido".
  const [avisos, setAvisos] = useState(user?.notify_bills !== false);
  const [guardando, setGuardando] = useState(false);

  const iniciales = (user?.name || user?.email || '?')
    .split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase();

  // Optimista, y se vuelve atrás si falla: el interruptor tiene que responder
  // al toque, pero no puede quedar diciendo algo que el servidor no guardó.
  const cambiarAvisos = async (valor) => {
    setAvisos(valor);
    setGuardando(true);
    try {
      await api.patch('/account/preferences', { notify_bills: valor });
    } catch (_) {
      setAvisos(!valor);
      Toast.show({ type: 'error', text1: t('settings.avisosError') });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <View style={styles.root}>
      <Glow />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title={t('settings.title')}
          onBack={() => navigation.goBack()}
          card={false}
        />

        {/* Quién sos, y en qué plan. */}
        <Card variant="raised" style={styles.bloque}>
          <View style={styles.perfil}>
            <View style={styles.avatar}>
              <Txt style={styles.avatarTxt}>{iniciales}</Txt>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="h2" numberOfLines={1}>{user?.name || t('settings.sinNombre')}</Txt>
              <Txt variant="caption" color={COLORS.textLow} numberOfLines={1}>{user?.email}</Txt>
            </View>
            {plan === 'premium' ? (
              <Ionicons name="diamond" size={16} color={COLORS.premium} />
            ) : (
              <Badge
                variant={isTrial ? 'streak' : 'statusMuted'}
                icon={isTrial ? 'timer-outline' : 'lock-closed'}
                label={isTrial ? `${trialDays}d` : t('premium.freeBadge')}
              />
            )}
          </View>
          {plan !== 'premium' ? (
            <Button
              label={t('settings.mejorar')}
              icon="diamond-outline"
              size="sm"
              onPress={() => showUpgrade()}
              style={{ alignSelf: 'flex-start', marginTop: SPACING.s }}
            />
          ) : null}
        </Card>

        <Card label={t('settings.preferencias')} style={styles.bloque}>
          <Txt variant="caption" color={COLORS.textMid} style={styles.etiqueta}>
            {t('settings.idioma')}
          </Txt>
          {/* Segmented y no un botón que alterna: con dos idiomas, un botón que
              dice "EN" no aclara si ese es el idioma actual o el que se va a
              poner. Acá se ve cuál está puesto. */}
          <Segmented
            options={[
              { value: 'es', label: 'Español' },
              { value: 'en', label: 'English' },
            ]}
            value={lang}
            onChange={switchLanguage}
          />

          <View style={styles.separador} />

          <View style={styles.filaToggle}>
            <View style={{ flex: 1, marginRight: SPACING.m }}>
              <Txt variant="caption" color={COLORS.textHigh} style={styles.filaTitulo}>
                {t('settings.avisos')}
              </Txt>
              <Txt variant="caption" color={COLORS.textLow}>{t('settings.avisosAyuda')}</Txt>
            </View>
            <Toggle value={avisos} onValueChange={cambiarAvisos} disabled={guardando} />
          </View>
        </Card>

        {/* Exportar y borrar la cuenta viven dentro de esta hoja. */}
        <Card label={t('settings.datos')} style={styles.bloque} onPress={() => setSeguridadVisible(true)}>
          <View style={styles.filaToggle}>
            <Ionicons name="shield-checkmark-outline" size={22} color={COLORS.primary} />
            <View style={{ flex: 1, marginLeft: SPACING.s }}>
              <Txt variant="caption" color={COLORS.textHigh} style={styles.filaTitulo}>
                {t('settings.seguridad')}
              </Txt>
              <Txt variant="caption" color={COLORS.textLow}>{t('settings.seguridadAyuda')}</Txt>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textLow} />
          </View>
        </Card>

        <Button
          label={t('common.logout')}
          variant="secondary"
          icon="log-out-outline"
          fullWidth
          onPress={logout}
          style={{ marginTop: SPACING.l }}
        />

        <View style={{ height: 40 }} />
      </ScrollView>
      <SecuritySheet visible={seguridadVisible} onClose={() => setSeguridadVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: SPACING.m, paddingTop: 60 },
  bloque: { marginTop: SPACING.m },

  perfil: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 46, height: 46, borderRadius: RADIUS.full,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1.5, borderColor: COLORS.primaryBorderSoft,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  avatarTxt: { fontFamily: FONTS.extrabold, fontSize: 15, lineHeight: 18, color: COLORS.textHigh },

  etiqueta: { marginBottom: 6 },
  separador: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.m },
  filaToggle: { flexDirection: 'row', alignItems: 'center' },
  filaTitulo: { fontFamily: FONTS.semibold, marginBottom: 2 },
});
