import React, { useCallback, useRef, useState } from 'react';
import { View, Modal, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Ionicons from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import api from '../api/client';
import { Txt, Input, Button, formatMoney } from './ui';
import { COLORS, SPACING, RADIUS, FONTS, estilos } from '../theme';

/**
 * Escáner del QR de un comprobante fiscal.
 *
 * POR QUÉ EN VIVO Y NO UNA FOTO DE LA GALERÍA. Se probó leer el QR de fotos ya
 * sacadas: de cuatro recibos reales decodificó UNO — justo el que estaba
 * encuadrado apuntando al código. En otro el QR se salía por el borde inferior
 * de la foto, así que le faltaba un patrón de posición y ningún lector del mundo
 * podía recuperarlo. Nadie encuadra pensando en un código que no sabe que se
 * lee; con la cámara abierta, en cambio, el error se corrige en dos segundos.
 *
 * Además el escáner nativo (Vision en iOS, ML Kit en Android) es bastante mejor
 * que cualquier librería JS sobre papel térmico — jsQR y ZXing fallaron en el
 * mismo código que leyó OpenCV.
 */
const HOST_DGI = 'efactura.dgi.gub.uy';

export default function ReceiptScanner({ visible, onClose, onCargado }) {
  const [permiso, pedirPermiso] = useCameraPermissions();
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);
  // El QR del ultimo escaneo, para poder re-enviarlo con el nombre del comercio
  // sin obligar a escanear otra vez.
  const [ultimoQr, setUltimoQr] = useState(null);
  const [nombre, setNombre] = useState('');
  // El padron es global y nadie lo valida: lo que escribio el primero queda
  // para todos. Asi que tiene que poder corregirse, no solo completarse.
  const [corrigiendo, setCorrigiendo] = useState(false);
  // Un QR se lee MUCHAS veces por segundo mientras esté en cuadro. Sin esto se
  // dispararían decenas de requests por el mismo ticket.
  const yaLeido = useRef(false);

  const cerrar = useCallback(() => {
    yaLeido.current = false;
    setResultado(null);
    setEnviando(false);
    setCorrigiendo(false);
    setNombre('');
    onClose && onClose();
  }, [onClose]);

  const alEscanear = useCallback(async ({ data }) => {
    if (yaLeido.current || enviando) return;

    // Chequeo local antes de molestar al servidor: si el QR no es de la DGI, es
    // el código de una gaseosa o un link cualquiera, y decirlo al instante es
    // mejor que un viaje de ida y vuelta.
    if (!String(data || '').includes(HOST_DGI)) {
      Toast.show({
        type: 'error',
        text1: 'Ese no es el QR del comprobante',
        text2: 'Está al pie del ticket, cerca de "Cód. de Seguridad".',
      });
      return;
    }

    yaLeido.current = true;
    setEnviando(true);
    setUltimoQr(data);
    try {
      const { data: r } = await api.post('/receipts/qr', { qr: data });
      setResultado(r);
      onCargado && onCargado(r);
      Toast.show({
        type: 'success',
        text1: r.nueva ? 'Comprobante cargado' : 'Ese ticket ya estaba cargado',
        text2: r.nueva ? undefined : 'No se duplicó.',
      });
    } catch (e) {
      yaLeido.current = false;   // se puede reintentar sin cerrar la cámara
      Toast.show({
        type: 'error',
        text1: e?.response?.data?.error || 'No se pudo cargar el comprobante',
        text2: e?.response?.data?.detail,
      });
    } finally {
      setEnviando(false);
    }
  }, [enviando, onCargado]);

  // Nombrar el comercio re-envia el MISMO comprobante. Es seguro porque el
  // endpoint es idempotente: actualiza la fila en vez de crear otra. Y el nombre
  // queda en el padron compartido, asi que es la ultima vez que alguien tiene
  // que escribirlo para ese RUT.
  const guardarNombre = useCallback(async () => {
    const n = nombre.trim();
    if (!n || !ultimoQr) return;
    setEnviando(true);
    try {
      const { data: r } = await api.post('/receipts/qr', { qr: ultimoQr, description: n });
      setResultado(r);
      onCargado && onCargado(r);
      setNombre('');
      setCorrigiendo(false);
      Toast.show({ type: 'success', text1: `Guardado como ${n}` });
    } catch (_) {
      Toast.show({ type: 'error', text1: 'No se pudo guardar el nombre' });
    } finally {
      setEnviando(false);
    }
  }, [nombre, ultimoQr, onCargado]);

  const cuerpo = () => {
    if (!permiso) return <ActivityIndicator color={COLORS.primary} />;

    if (!permiso.granted) {
      return (
        <View style={styles.centro}>
          <Ionicons name="camera-outline" size={40} color={COLORS.textLow} />
          <Txt variant="h2" style={styles.titulo}>Necesito la cámara</Txt>
          <Txt variant="body" color={COLORS.textMid} style={styles.texto}>
            Sólo para leer el QR del ticket. Las fotos no se guardan ni se envían:
            lo único que sale del teléfono es el texto del código.
          </Txt>
          <Button label="Permitir cámara" onPress={pedirPermiso} style={{ marginTop: SPACING.m }} />
        </View>
      );
    }

    if (resultado) {
      const c = resultado.comprobante;
      return (
        <View style={styles.centro}>
          <Ionicons name="checkmark-circle" size={44} color={COLORS.success} />
          <Txt style={styles.monto}>{formatMoney(c.total, c.currency)}</Txt>
          {c.emisorNombre ? (
            <Txt variant="h2" style={styles.texto}>{c.emisorNombre}</Txt>
          ) : null}
          <Txt variant="body" color={COLORS.textMid} style={styles.texto}>
            {c.tipo} {c.serie}-{c.numero} · {c.fecha}
          </Txt>

          {/* Se pregunta UNA sola vez por comercio: el nombre entra en el padron
              compartido, asi que el proximo escaneo en ese RUT —tuyo o de
              cualquiera— ya viene nombrado. El QR trae el RUT, nunca el nombre.

              Y SE PUEDE CORREGIR. El padron no lo valida nadie, asi que un
              nombre equivocado —o el de otro comercio, o una nota que no es un
              nombre— se queda ahi para todo el mundo hasta que alguien lo
              arregle. Si solo se pudiera completar cuando esta vacio, el unico
              arreglo posible seria tocar la base a mano. */}
          {!c.emisorConocido || corrigiendo ? (
            <View style={styles.nombrar}>
              <Txt variant="caption" color={COLORS.textLow} style={styles.textoCentrado}>
                {c.emisorConocido ? '¿Cómo se llama en realidad?' : '¿Qué comercio es? Se pregunta una sola vez.'}
              </Txt>
              <Input
                value={nombre}
                onChangeText={setNombre}
                placeholder="Nombre del comercio"
                autoFocus
                style={{ marginTop: SPACING.s }}
              />
              <Button
                label={c.emisorConocido ? 'Corregir nombre' : 'Guardar nombre'}
                onPress={guardarNombre}
                loading={enviando}
                disabled={!nombre.trim() || nombre.trim() === c.emisorNombre}
                fullWidth
                style={{ marginTop: SPACING.s }}
              />
            </View>
          ) : (
            <Pressable
              onPress={() => { setNombre(c.emisorNombre || ''); setCorrigiendo(true); }}
              hitSlop={8}
            >
              <Txt variant="caption" color={COLORS.textLow} style={styles.corregir}>
                No es {c.emisorNombre} · corregir
              </Txt>
            </Pressable>
          )}
          {/* El QR NO trae la moneda: el ticket la imprime pero el código no.
              Se dice, en vez de que el usuario lo descubra por un total 40 veces
              corrido. */}
          {c.monedaAsumida ? (
            <Txt variant="caption" color={COLORS.textLow} style={styles.texto}>
              Se asumió que está en pesos — el QR no indica la moneda.
            </Txt>
          ) : null}
          <Button
            label="Escanear otro"
            variant="secondary"
            onPress={() => { yaLeido.current = false; setResultado(null); setCorrigiendo(false); setNombre(''); }}
            style={{ marginTop: SPACING.m }}
          />
        </View>
      );
    }

    return (
      <>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={alEscanear}
        />
        {/* La mira: no recorta nada —el escáner nativo mira el cuadro entero—
            pero le dice a la persona dónde poner el código, que es justamente
            lo que faltaba cuando el QR quedaba fuera de la foto. */}
        <View style={styles.mira} pointerEvents="none" />
        <View style={styles.ayuda} pointerEvents="none">
          <Txt variant="body" color={COLORS.textHigh} style={styles.textoCentrado}>
            {enviando ? 'Cargando…' : 'Apuntá al QR del ticket'}
          </Txt>
          <Txt variant="caption" color={COLORS.textLow} style={styles.textoCentrado}>
            Está al pie, cerca de "Cód. de Seguridad"
          </Txt>
        </View>
        {enviando ? (
          <View style={styles.velo} pointerEvents="none">
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : null}
      </>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={cerrar}>
      <View style={styles.root}>
        {cuerpo()}
        <Pressable onPress={cerrar} style={styles.cerrar} hitSlop={10}>
          <Ionicons name="close" size={22} color={COLORS.textHigh} />
        </Pressable>
      </View>
    </Modal>
  );
}

// Se declara con `estilos()` y no con `StyleSheet.create` suelto: create COPIA
// los colores al cargar el modulo, asi que un cambio de tema en caliente no
// repintaria nada. Ver theme.js.
const styles = estilos(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center' },
  centro: { alignItems: 'center', paddingHorizontal: SPACING.l },
  titulo: { marginTop: SPACING.m, marginBottom: 6 },
  texto: { textAlign: 'center', marginTop: 4 },
  textoCentrado: { textAlign: 'center' },
  monto: { fontFamily: FONTS.amountBold, fontSize: 30, lineHeight: 36, color: COLORS.textHigh, marginTop: SPACING.s },
  mira: {
    position: 'absolute',
    alignSelf: 'center',
    top: '30%',
    width: 240,
    height: 240,
    borderWidth: 2,
    borderColor: COLORS.textHigh,
    borderRadius: RADIUS.l,
  },
  nombrar: { alignSelf: 'stretch', marginTop: SPACING.m },
  corregir: { textAlign: 'center', marginTop: SPACING.s, textDecorationLine: 'underline' },
  ayuda: { position: 'absolute', left: SPACING.l, right: SPACING.l, bottom: 90, gap: 4 },
  velo: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  cerrar: {
    position: 'absolute',
    top: 56,
    right: SPACING.m,
    width: 38,
    height: 38,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
