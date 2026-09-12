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
import { COLORS, SPACING, RADIUS, FONTS, estilos } from '../theme';

/**
 * Qué pasa con el resumen del usuario, contado como un recorrido.
 *
 * La primera versión afirmaba fuerte y después se desdecía ("se cifra… pero no
 * es extremo a extremo"). Reportado como confuso, y con razón: afirmar y
 * retractarse genera desconfianza aunque lo de abajo sea sólido. El error de
 * fondo era discutir un TÉRMINO en vez de contar qué pasa.
 *
 * Además mezclaba dos amenazas distintas que el usuario no tiene por qué
 * separar solo:
 *   · ¿puede leerlo alguien que intercepte el envío?  → no
 *   · ¿puede leerlo el servicio?                      → sí, y tiene que poder
 *
 * La segunda no es una falla de seguridad: sin descifrarlo no hay categorías,
 * ni suscripciones detectadas, ni comparación de precios. Contado en orden
 * —tu teléfono, el camino, el servidor, lo que queda— el dato honesto es parte
 * del recorrido y no una excepción a la letra chica.
 *
 * Las dos cadenas de i18n que prometían "cifrado de punta a punta" se
 * corrigieron: eran falsas, y una de ellas vendía la suscripción premium.
 */
const PUNTOS = [
  {
    paso: '1',
    icon: 'phone-portrait-outline',
    titulo: 'En tu teléfono',
    texto: 'El archivo se cifra acá, antes de salir, con una clave nueva que se genera en ese momento y no se repite.',
  },
  {
    paso: '2',
    icon: 'swap-horizontal-outline',
    titulo: 'En el camino',
    texto: 'Esa clave viaja aparte, envuelta con la clave pública del servidor. Quien intercepte el envío —tu wifi, tu proveedor, cualquiera en el medio— ve sólo ruido.',
  },
  {
    paso: '3',
    icon: 'server-outline',
    titulo: 'En el servidor',
    texto: 'Ahí sí se abre: hay que leer los movimientos para poder categorizarlos y compararlos con los precios. Se hace en memoria, en segundos, y el archivo se descarta. Nunca toca el disco.',
  },
  {
    paso: '4',
    icon: 'document-text-outline',
    titulo: 'Lo que queda',
    texto: 'Los movimientos ya procesados: fecha, descripción, monto y categoría. El archivo original no queda en ningún lado.',
  },
  {
    paso: '5',
    icon: 'key-outline',
    titulo: 'Lo que nunca pasa',
    texto: 'La app no se conecta a tu banco ni te pide usuario y contraseña. Vos bajás el resumen y lo subís. Si alguna pantalla te pide esas claves, no es esta app.',
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
      {/* La respuesta directa, arriba de todo. Es la pregunta que la gente
          realmente se hace, y dejarla implícita entre cinco párrafos fue lo que
          hizo que la versión anterior se sintiera evasiva. */}
      <Card style={styles.resumen}>
        <Txt variant="caption" color={COLORS.textHigh} style={styles.resumenTitulo}>
          ¿Quién puede ver tu resumen?
        </Txt>
        <View style={styles.resumenFila}>
          <Ionicons name="close-circle" size={15} color={COLORS.income} />
          <Txt variant="caption" color={COLORS.textMid} style={styles.resumenTxt}>
            Nadie en el camino: ni tu wifi, ni tu proveedor, ni quien intercepte el envío.
          </Txt>
        </View>
        <View style={styles.resumenFila}>
          <Ionicons name="checkmark-circle" size={15} color={COLORS.textMid} />
          <Txt variant="caption" color={COLORS.textMid} style={styles.resumenTxt}>
            MoneyFlow sí, por unos segundos. Sin leerlo no hay categorías ni comparación de precios.
          </Txt>
        </View>
      </Card>

      {PUNTOS.map((p) => (
        <View key={p.titulo} style={styles.punto}>
          <View style={styles.pasoCol}>
            <View style={styles.iconBox}>
              <Ionicons name={p.icon} size={16} color={COLORS.accent} />
            </View>
            <Txt style={styles.pasoNum}>{p.paso}</Txt>
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

// Se declara con `estilos()` y no con `StyleSheet.create` suelto: create COPIA
// los colores al cargar el modulo, asi que un cambio de tema en caliente no
// repintaria nada. Ver theme.js.
const styles = estilos(() => StyleSheet.create({
  resumen: { marginBottom: SPACING.m },
  resumenTitulo: { fontFamily: FONTS.bold, marginBottom: SPACING.s },
  resumenFila: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 6 },
  resumenTxt: { flex: 1, marginLeft: 7, fontSize: 12.5, lineHeight: 18 },

  punto: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.m },
  pasoCol: { alignItems: 'center', marginRight: SPACING.s },
  iconBox: {
    width: 34, height: 34, borderRadius: RADIUS.s,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  pasoNum: {
    fontFamily: FONTS.amountBold, fontSize: 10, lineHeight: 13,
    color: COLORS.textLow, marginTop: 4,
  },
  puntoTxt: { flex: 1, minWidth: 0 },
  puntoTitulo: { fontFamily: FONTS.bold, marginBottom: 3 },
  puntoCuerpo: { fontSize: 12.5, lineHeight: 18 },
  separador: {
    height: 1, backgroundColor: COLORS.borderSubtle,
    marginTop: SPACING.xs, marginBottom: SPACING.m,
  },
}));
