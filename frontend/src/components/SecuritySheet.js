import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
// Mismo import legacy que utils/encryption.js: en SDK 57 el entrypoint nuevo
// no exporta writeAsStringAsync. Ver la nota en CLAUDE.md.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Txt, Card, Input, Button, BottomSheet } from './ui';
import { COLORS, SPACING, RADIUS, FONTS } from '../theme';

/**
 * Qué pasa con los datos del usuario, en castellano y sin vender humo.
 *
 * Cada línea de acá describe algo que el código realmente hace. La tentación en
 * una pantalla así es escribir "cifrado de extremo a extremo" porque suena
 * mejor — y sería mentira: el servidor descifra el archivo para poder leerlo.
 * Decirlo es lo que hace creíble al resto.
 */
const PUNTOS = [
  {
    icon: 'lock-closed-outline',
    titulo: 'Se cifra en tu teléfono, antes de salir',
    texto: 'El resumen se cifra con AES-256 acá mismo. La clave de ese cifrado viaja aparte, envuelta con una clave pública del servidor: aunque alguien intercepte el envío entero, sin la clave privada no puede abrirlo.',
  },
  {
    icon: 'eye-outline',
    titulo: 'El servidor sí lo abre — no es extremo a extremo',
    texto: 'Para leer tus movimientos hay que descifrarlo, así que el servidor lo abre por unos segundos. Preferimos decírtelo antes que llamarlo "extremo a extremo", que sería falso.',
  },
  {
    icon: 'trash-bin-outline',
    titulo: 'El archivo nunca se guarda',
    texto: 'Se procesa en memoria y se descarta cuando termina el pedido. No queda en disco, ni en una carpeta temporal, ni en un backup.',
  },
  {
    icon: 'document-text-outline',
    titulo: 'Qué queda guardado',
    texto: 'Los movimientos ya procesados: fecha, descripción, monto y categoría. Con eso se arman los gráficos, las suscripciones detectadas y el cruce con los precios.',
  },
  {
    icon: 'key-outline',
    titulo: 'Nunca te pedimos las claves del banco',
    texto: 'La app no se conecta a tu banco ni te pide usuario y contraseña. Vos bajás el resumen y lo subís. Si alguna vez una pantalla te pide esos datos, no es esta app.',
  },
];

export default function SecuritySheet({ visible, onClose }) {
  const { logout } = useAuth();
  const [confirmando, setConfirmando] = useState(false);
  const [password, setPassword] = useState('');
  const [borrando, setBorrando] = useState(false);
  const [exportando, setExportando] = useState(false);

  const cerrar = () => {
    setConfirmando(false);
    setPassword('');
    onClose && onClose();
  };

  const exportar = async () => {
    setExportando(true);
    try {
      const { data } = await api.get('/account/export');
      const ruta = `${FileSystem.cacheDirectory}moneyflow-datos.json`;
      await FileSystem.writeAsStringAsync(ruta, JSON.stringify(data, null, 2));

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(ruta, {
          mimeType: 'application/json',
          dialogTitle: 'Tus datos de MoneyFlow',
        });
      } else {
        Toast.show({ type: 'success', text1: 'Guardado', text2: 'moneyflow-datos.json' });
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: 'No se pudo exportar' });
    } finally {
      setExportando(false);
    }
  };

  const borrar = async () => {
    if (!password.trim()) {
      return Toast.show({ type: 'error', text1: 'Ingresá tu contraseña' });
    }
    setBorrando(true);
    try {
      await api.delete('/account', { data: { password } });
      Toast.show({ type: 'success', text1: 'Cuenta borrada' });
      cerrar();
      await logout();
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: err.response?.data?.error || 'No se pudo borrar la cuenta',
      });
    } finally {
      setBorrando(false);
    }
  };

  const confirmarBorrado = () => {
    Alert.alert(
      'Borrar la cuenta',
      'Se borran tus movimientos, metas, suscripciones y listas. No se puede deshacer.\n\nSi querés quedarte con tus datos, exportalos primero.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Continuar', style: 'destructive', onPress: () => setConfirmando(true) },
      ],
    );
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={cerrar}
      title="Seguridad y datos"
      subtitle="Qué pasa con tu resumen bancario"
    >
      {PUNTOS.map((p) => (
        <View key={p.titulo} style={styles.punto}>
          <View style={styles.iconBox}>
            <Ionicons name={p.icon} size={17} color={COLORS.accent} />
          </View>
          <View style={styles.puntoTxt}>
            <Txt variant="caption" color={COLORS.textHigh} style={styles.puntoTitulo}>
              {p.titulo}
            </Txt>
            <Txt variant="caption" color={COLORS.textMid} style={styles.puntoCuerpo}>
              {p.texto}
            </Txt>
          </View>
        </View>
      ))}

      <View style={styles.separador} />

      <Button
        label="Descargar mis datos"
        variant="secondary"
        icon="download-outline"
        onPress={exportar}
        loading={exportando}
        fullWidth
      />

      {!confirmando ? (
        <Button
          label="Borrar mi cuenta"
          variant="ghost"
          size="sm"
          icon="trash-outline"
          onPress={confirmarBorrado}
          style={{ alignSelf: 'center', marginTop: SPACING.s }}
        />
      ) : (
        <Card variant="partial" label="Confirmar" style={{ marginTop: SPACING.m }}>
          {/* Se pide la contraseña aunque la sesión ya esté abierta: un teléfono
              desbloqueado o un token robado no deberían alcanzar para algo
              irreversible. */}
          <Txt variant="caption" color={COLORS.textMid} style={{ marginBottom: SPACING.s }}>
            Ingresá tu contraseña para confirmar. Esto no se puede deshacer.
          </Txt>
          <Input
            value={password}
            onChangeText={setPassword}
            placeholder="Tu contraseña"
            icon="lock-closed-outline"
            secureTextEntry
            autoFocus
          />
          <Button
            label="Borrar definitivamente"
            variant="destructive"
            icon="trash-outline"
            onPress={borrar}
            loading={borrando}
            fullWidth
            style={{ marginTop: SPACING.s }}
          />
        </Card>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  punto: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.m },
  iconBox: {
    width: 34, height: 34, borderRadius: RADIUS.s,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center', justifyContent: 'center',
    marginRight: SPACING.s,
  },
  puntoTxt: { flex: 1, minWidth: 0 },
  puntoTitulo: { fontFamily: FONTS.bold, marginBottom: 3 },
  puntoCuerpo: { fontSize: 12.5, lineHeight: 18 },
  separador: {
    height: 1, backgroundColor: COLORS.borderSubtle,
    marginTop: SPACING.xs, marginBottom: SPACING.m,
  },
});
