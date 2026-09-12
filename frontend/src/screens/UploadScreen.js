import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import api from '../api/client';
import { encryptFile } from '../utils/encryption';
import ReceiptScanner from '../components/ReceiptScanner';
import SecuritySheet from '../components/SecuritySheet';
import { usePlan } from '../context/PlanContext';
import { useLanguage } from '../context/LanguageContext';
import {
  Txt, Card, Badge, Button, Segmented, ProgressBar, ScreenHeader, Glow, formatUYU,
} from '../components/ui';
import { COLORS, SPACING, RADIUS, FONTS, SHADOWS, estilos } from '../theme';

/**
 * Movimientos: por dónde entran.
 *
 * ANTES ESTA PANTALLA SE LLAMABA "Movs" Y NO MOSTRABA NINGÚN MOVIMIENTO. Era
 * una pantalla de carga con el encabezado "Sincronizar", y las tres formas de
 * cargar plata en la app estaban repartidas sin relación: el escáner acá abajo,
 * el resumen del banco arriba, y la carga a mano en otra pestaña sin que nada
 * lo dijera. Un selector de moneda flotaba suelto entre las dos, sin aclarar
 * que sólo afecta al archivo del banco. Y el botón que BORRA lo importado era
 * un botoncito gris en el medio que no decía cuántos movimientos se llevaba.
 *
 * Ahora la pantalla está ordenada por la única jerarquía que importa acá, que
 * es **exactitud contra trabajo**: el QR del ticket da el importe exacto y sale
 * de un toque; el resumen del banco trae el mes entero pero hay que ir a
 * buscarlo; a mano es lo último porque es lo único que puede equivocarse.
 * El comentario del código ya decía "el escáner va primero" — y estaba segundo.
 *
 * Arriba va DE DÓNDE SALIERON los movimientos que ya tenés. Es lo que convierte
 * tres botones sueltos en un modelo: se ve que hay tres puertas, cuál usaste, y
 * cuánto entró por cada una. También es lo que le da un número al borrado, que
 * hasta ahora era a ciegas.
 */

// Pasos reales del proceso. Antes el anillo mostraba un 72% fijo escrito a
// mano: un porcentaje inventado es peor que no mostrar ninguno, porque el
// usuario lo lee como información. Esto sí se sabe.
const PASOS = { encrypting: 1, uploading: 2 };
const TOTAL_PASOS = 2;

export default function UploadScreen() {
  const { t } = useLanguage();
  const { canUpload, showUpgrade } = usePlan();
  const navigation = useNavigation();

  const [uploading, setUploading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState('encrypting');
  // De que cuenta es el resumen. El backend la detecta sola del preambulo del
  // archivo; esto es el override para cuando el archivo no la dice, porque
  // adivinar entre pesos y dolares es multiplicar o dividir por 40 los
  // importes de alguien. 'auto' deja decidir al preambulo.
  const [moneda, setMoneda] = useState('auto');
  const [escanerVisible, setEscanerVisible] = useState(false);
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [seguridadVisible, setSeguridadVisible] = useState(false);
  const [limpiando, setLimpiando] = useState(false);
  const [origenes, setOrigenes] = useState(null);

  const cargarOrigenes = useCallback(async () => {
    try {
      const { data } = await api.get('/transactions/origenes');
      setOrigenes(data);
    } catch (_) {
      // Es contexto, no el contenido de la pantalla: si falla, las tres formas
      // de cargar siguen estando y se usan igual.
    }
  }, []);

  // Al volver a la pestaña, no sólo al montarla: si cargaste algo desde Wealth
  // o escaneaste y volviste, el conteo tiene que estar al día.
  useFocusEffect(useCallback(() => { cargarOrigenes(); }, [cargarOrigenes]));

  const pickAndUpload = async () => {
    if (!canUpload) { showUpgrade('upload'); return; }
    try {
      // El badge de abajo prometía CSV desde siempre y el selector no lo
      // dejaba elegir: el usuario veía "CSV" y no podía seleccionar el CSV que
      // le da el banco. Windows manda los .csv como application/vnd.ms-excel,
      // así que va el MIME real y el que manda el sistema. Del CSV salen 16
      // movimientos donde el mismo resumen en PDF da 0.
      const picked = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'image/*',
          'text/csv',
          'text/comma-separated-values',
          'application/csv',
          'application/vnd.ms-excel',
        ],
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

      const { data } = await api.post('/upload', {
        ...payload,
        ...(moneda === 'auto' ? {} : { currency: moneda }),
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000,
      });

      setResult(data);
      cargarOrigenes();
      // Se dice EN QUE MONEDA entro, y si la detecto el archivo o se asumio.
      // Sin esto, un resumen en dolares que entre como pesos solo se descubre
      // cuando los totales quedan cuarenta veces mas chicos.
      const detalleMoneda = data.currency === 'USD'
        ? 'Leido como cuenta en dolares'
        : (data.currencyDetected ? 'Leido como cuenta en pesos' : 'Se asumio cuenta en pesos');
      Toast.show({
        type: 'success',
        text1: t('upload.successUpload', { count: data.inserted }),
        text2: data.subscriptionsDetected > 0
          ? `${detalleMoneda} · ${t('upload.successSubs', { n: data.subscriptionsDetected })}`
          : detalleMoneda,
      });
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || t('upload.errorUpload') });
    } finally {
      setUploading(false);
    }
  };

  // Borra lo que vino de un resumen anterior. Existe porque un import previo
  // pudo guardar importes equivocados, y volver a subir sólo corrige las filas
  // que ya tienen identificador del banco — las de antes de esa columna
  // quedarían al lado de las nuevas.
  //
  // AHORA DICE CUÁNTAS. Una acción destructiva que no dice cuánto se lleva se
  // toca con miedo o no se toca nunca, y las dos son la misma pérdida.
  const limpiarImportado = () => {
    const n = origenes?.banco?.movimientos || 0;
    Alert.alert(
      t('upload.arreglarBorrar', { n }),
      t('upload.arreglarAviso'),
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            setLimpiando(true);
            try {
              const { data } = await api.delete('/transactions/imported');
              Toast.show({
                type: 'success',
                text1: data.borradas === 1 ? '1 movimiento borrado' : `${data.borradas} movimientos borrados`,
                text2: 'Volvé a subir el resumen',
              });
              cargarOrigenes();
            } catch (_) {
              Toast.show({ type: 'error', text1: 'No se pudo borrar' });
            } finally {
              setLimpiando(false);
            }
          },
        },
      ],
    );
  };

  const delBanco = origenes?.banco?.movimientos || 0;

  return (
    <View style={styles.root}>
      <Glow />
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

        {/* DE DÓNDE SALIERON. Tres botones sueltos no son un modelo; esto sí:
            se ve que hay tres puertas, cuál usaste y cuánto entró por cada una.
            Se muestran las tres aunque alguna esté en cero, porque el cero
            también enseña —"a mano: 0" dice que se puede. */}
        <Card label={t('upload.origenTitulo')} style={styles.bloque}>
          {origenes && origenes.total === 0 ? (
            <Txt variant="body" color={COLORS.textMid}>{t('upload.origenVacio')}</Txt>
          ) : (
            <>
              <Origen icon="business-outline" tono={COLORS.primary}
                label={t('upload.origenBanco')} n={origenes?.banco?.movimientos} />
              <Origen icon="qr-code-outline" tono={COLORS.accent}
                label={t('upload.origenTicket')} n={origenes?.ticket?.movimientos} />
              <Origen icon="create-outline" tono={COLORS.textMid}
                label={t('upload.origenManual')} n={origenes?.manual?.movimientos} />
              <Button
                label={t('upload.verTodos')}
                variant="ghost"
                size="sm"
                icon="arrow-forward-outline"
                iconRight
                onPress={() => navigation.navigate('Dashboard')}
                style={{ alignSelf: 'flex-start', marginTop: SPACING.xs }}
              />
            </>
          )}
        </Card>

        {/* 1 — EL ESCÁNER. Va primero y no es orden alfabético: el QR da el
            importe exacto del comprobante y se hace en el momento de pagar,
            mientras que un resumen hay que bajarlo del banco y acordarse. Es a
            la vez el camino más confiable y el de menos fricción. */}
        <Card style={styles.bloque}>
          <Paso n="1" icon="qr-code" tono={COLORS.accent} titulo={t('upload.scanTitulo')} />
          <Txt variant="body" color={COLORS.textMid} style={styles.porQue}>
            {t('upload.scanPorQue')}
          </Txt>
          <Button
            label={t('upload.scanCta')}
            icon="qr-code-outline"
            size="lg"
            fullWidth
            onPress={() => setEscanerVisible(true)}
            style={{ marginTop: SPACING.s }}
          />
          <Txt variant="caption" color={COLORS.textLow} style={styles.nota}>
            {t('upload.scanNota')}
          </Txt>
        </Card>

        {/* 2 — EL RESUMEN DEL BANCO. La moneda y el resultado viven ACÁ ADENTRO,
            no sueltos en la pantalla: la moneda sólo afecta a este archivo, y el
            resultado es de esta acción. Antes el resultado aparecía al final,
            debajo de dos tarjetas de marketing. */}
        <Card style={styles.bloque}>
          <Paso n="2" icon="document-text" tono={COLORS.primary} titulo={t('upload.bancoTitulo')} />
          <Txt variant="body" color={COLORS.textMid} style={styles.porQue}>
            {t('upload.bancoPorQue')}
          </Txt>

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
                size={24}
                color={canUpload ? COLORS.onPrimary : COLORS.onPremium}
              />
            </View>
            <Txt variant="h2" center style={styles.dropTitle}>
              {canUpload ? t('upload.dropTitle') : t('premium.lockedUpload')}
            </Txt>
            <Txt variant="caption" color={COLORS.textMid} center style={styles.dropHint}>
              {canUpload ? t('upload.dropHint') : t('premium.upgradeNudgeUpload')}
            </Txt>
            <View style={styles.formatos}>
              <Badge variant="status" icon="grid-outline" label="CSV" />
              <Badge variant="statusMuted" icon="document-outline" label="PDF" />
            </View>
          </Pressable>

          {/* Medido contra un resumen real del Santander: del CSV salen 16
              movimientos y del MISMO resumen en PDF, 0. Decirlo antes de elegir
              el archivo ahorra el viaje entero. */}
          <Txt variant="caption" color={COLORS.textLow} style={styles.nota}>
            {t('upload.bancoCsv')}
          </Txt>

          {/* En Uruguay una persona tiene cuenta en pesos y cuenta en dolares, y
              cada resumen es de UNA de las dos. Normalmente la moneda esta en el
              preambulo del archivo y esto queda en "Detectar"; el override existe
              porque los bancos no siempre la escriben, y asumir mal multiplica o
              divide por cuarenta todos los importes. */}
          <View style={styles.moneda}>
            <Txt variant="overline" color={COLORS.textLow} style={{ marginBottom: SPACING.xs }}>
              {t('upload.monedaTitulo')}
            </Txt>
            <Segmented
              options={[
                { value: 'auto', label: 'Detectar' },
                { value: 'UYU', label: '$ Pesos' },
                { value: 'USD', label: 'US$ Dólares' },
              ]}
              value={moneda}
              onChange={setMoneda}
            />
            <Txt variant="caption" color={COLORS.textLow} style={styles.nota}>
              {t('upload.monedaAyuda')}
            </Txt>
          </View>

          {/* Acá es donde uno se pregunta qué pasa con el archivo, así que la
              explicación entera está a un toque. */}
          <Button
            label={t('upload.privacidadLink')}
            variant="ghost"
            size="sm"
            icon="shield-checkmark-outline"
            onPress={() => setSeguridadVisible(true)}
            style={{ alignSelf: 'flex-start', marginTop: SPACING.s }}
          />

          {result ? (
            <Card variant="best" label={t('upload.importComplete')} style={{ marginTop: SPACING.s }}>
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
        </Card>

        {/* 3 — A MANO. Va último porque es el único que puede equivocarse, pero
            tiene que estar: el efectivo no aparece en ningún resumen. Estaba en
            otra pestaña sin que nada lo dijera, así que para quien pagaba en
            efectivo la app simplemente no tenía respuesta. */}
        <Card style={styles.bloque} onPress={() => navigation.navigate('Dashboard')}>
          <Paso n="3" icon="create" tono={COLORS.textMid} titulo={t('upload.manualTitulo')} />
          <Txt variant="body" color={COLORS.textMid} style={styles.porQue}>
            {t('upload.manualPorQue')}
          </Txt>
          <Txt variant="caption" color={COLORS.primary} style={{ marginTop: 6 }}>
            {t('upload.manualCta')} →
          </Txt>
        </Card>

        {/* SI ALGO SALIÓ MAL. El miedo real acá es "si vuelvo a subir el mismo
            archivo, ¿me quedan todos duplicados?" — la respuesta es que no, y
            nadie la sabía. Decirla primero convierte el borrado en el último
            recurso que es, en vez de la primera reacción. */}
        <Card label={t('upload.arreglarTitulo')} style={styles.bloque}>
          <Txt variant="body" color={COLORS.textMid}>{t('upload.arreglarReSubir')}</Txt>
          <Button
            label={delBanco > 0
              ? t('upload.arreglarBorrar', { n: delBanco })
              : t('upload.arreglarBorrarVacio')}
            variant="destructive"
            size="sm"
            icon="trash-outline"
            disabled={delBanco === 0 || limpiando}
            onPress={limpiarImportado}
            loading={limpiando}
            style={{ alignSelf: 'flex-start', marginTop: SPACING.s }}
          />
        </Card>

        {/* Aire para la tab bar flotante. */}
        <View style={{ height: 110 }} />
      </ScrollView>
      <SecuritySheet visible={seguridadVisible} onClose={() => setSeguridadVisible(false)} />
      <ReceiptScanner
        visible={escanerVisible}
        onClose={() => setEscanerVisible(false)}
        onCargado={cargarOrigenes}
      />
    </View>
  );
}

/** Encabezado de cada camino: el número ordena, el icono lo hace reconocible. */
function Paso({ n, icon, tono, titulo }) {
  return (
    <View style={styles.pasoHead}>
      <View style={[styles.pasoIcon, { borderColor: tono }]}>
        <Ionicons name={icon} size={17} color={tono} />
      </View>
      <Txt variant="overline" color={COLORS.textLow} style={styles.pasoN}>{n}</Txt>
      <Txt variant="h2" style={styles.pasoTitulo}>{titulo}</Txt>
    </View>
  );
}

/** Una puerta de entrada, con lo que entró por ella. */
function Origen({ icon, tono, label, n }) {
  return (
    <View style={styles.origenRow}>
      <Ionicons name={icon} size={15} color={tono} style={{ width: 22 }} />
      <Txt variant="caption" color={COLORS.textMid} style={{ flex: 1 }}>{label}</Txt>
      <Txt style={[styles.origenN, { color: n ? COLORS.textHigh : COLORS.textLow }]}>{n ?? '—'}</Txt>
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

// Se declara con `estilos()` y no con `StyleSheet.create` suelto: create COPIA
// los colores al cargar el modulo, asi que un cambio de tema en caliente no
// repintaria nada. Ver theme.js.
const styles = estilos(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: SPACING.m, paddingTop: 60 },
  bloque: { marginTop: SPACING.m },
  pressed: { opacity: 0.85 },

  progHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  fileName: { fontFamily: FONTS.semibold, flex: 1, marginRight: SPACING.s },

  pasoHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  pasoIcon: {
    width: 32, height: 32, borderRadius: RADIUS.m, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginRight: SPACING.s,
  },
  pasoN: { marginRight: 6 },
  pasoTitulo: { flex: 1, fontSize: 17 },
  porQue: { marginBottom: SPACING.s },
  nota: { marginTop: 6 },

  origenRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  origenN: { fontFamily: FONTS.amountBold, fontSize: 15, lineHeight: 18 },

  drop: {
    alignItems: 'center',
    backgroundColor: COLORS.surfaceSunken,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    borderRadius: RADIUS.l,
    paddingVertical: SPACING.l,
    paddingHorizontal: SPACING.m,
  },
  dropLocked: { borderColor: COLORS.premiumBorder, borderStyle: 'solid' },
  dropIcon: {
    width: 52, height: 52, borderRadius: RADIUS.m,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.s,
    ...SHADOWS.glow,
  },
  dropIconLocked: { backgroundColor: COLORS.premium, ...SHADOWS.gold },
  dropTitle: { marginBottom: 4, fontSize: 16 },
  dropHint: { marginBottom: SPACING.s },
  formatos: { flexDirection: 'row', gap: SPACING.s },

  moneda: { marginTop: SPACING.m },

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
}));
