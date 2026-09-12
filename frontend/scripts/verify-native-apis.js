/**
 * Después de tocar versiones de Expo: ¿las APIs nativas siguen donde estaban?
 *
 *   cd frontend && node scripts/verify-native-apis.js
 *
 * POR QUÉ NO ALCANZA CON QUE COMPILE. `expo export` empaqueta igual aunque una
 * función haya desaparecido de su entrypoint: el import sigue siendo válido y
 * lo que queda es `undefined`. Eso no explota al compilar — explota cuando un
 * usuario entra a la pantalla que la usa. Pasó exactamente así al subir a SDK
 * 57: `readAsStringAsync` salió del entrypoint principal de expo-file-system y
 * la subida de resúmenes sólo se rompía al elegir un PDF.
 *
 * No se pueden `require` estos paquetes desde Node —son para el bundler de
 * React Native— así que esto lee sus TIPOS compilados, que son la declaración
 * de lo que cada paquete expone.
 *
 * La lista es de las APIs que la app llama de verdad. Al usar una nueva,
 * agregala acá.
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', 'node_modules');

const CASOS = [
  ['expo-crypto',          'build/Crypto.d.ts',           'getRandomBytesAsync'],
  ['expo-secure-store',    'build/SecureStore.d.ts',      'getItemAsync'],
  ['expo-secure-store',    'build/SecureStore.d.ts',      'setItemAsync'],
  ['expo-secure-store',    'build/SecureStore.d.ts',      'deleteItemAsync'],
  ['expo-localization',    'build/ExpoLocalization.d.ts', 'getLocales'],
  ['expo-device',          'build/Device.d.ts',           'isDevice'],
  ['expo-linear-gradient', 'build/LinearGradient.d.ts',   'LinearGradient'],
  ['expo-web-browser',     'build/WebBrowser.d.ts',       'openBrowserAsync'],
  ['expo-document-picker', 'build/index.d.ts',            'getDocumentAsync'],
  // El frágil: se importa desde 'expo-file-system/legacy' a propósito, porque
  // el entrypoint principal ya no lo trae. Ver CLAUDE.md.
  ['expo-file-system',     'build/legacy/FileSystem.d.ts', 'readAsStringAsync'],
  ['expo-camera',          'build/index.d.ts',            'useCameraPermissions'],
  ['expo-camera',          'build/index.d.ts',            'CameraView'],
  ['expo-camera',          'build/Camera.types.d.ts',     'onBarcodeScanned'],
  ['expo-blur',            'build/index.d.ts',            'BlurView'],
  ['expo-glass-effect',    'build/index.d.ts',            'GlassView'],
  ['expo-glass-effect',    'build/index.d.ts',            'isLiquidGlassAvailable'],
];

// Se exige el archivo EXACTO: encontrar el nombre en cualquier otro lado del
// paquete no prueba nada — puede estar en un archivo de avisos de deprecación,
// que fue justo lo que confundió la primera versión de este chequeo.
function declaradaEn(pkg, archivo, api) {
  const p = path.join(RAIZ, pkg, archivo);
  if (!fs.existsSync(p)) return null;
  const src = fs.readFileSync(p, 'utf8');
  return new RegExp(`(declare (function|const|class) |export (declare )?(function|const|class) )${api}\\b`).test(src)
    || new RegExp(`\\b${api}\\b`).test(src) ? archivo : null;
}

let fallas = 0;
for (const [pkg, archivo, api] of CASOS) {
  const donde = declaradaEn(pkg, archivo, api);
  if (!donde) fallas++;
  console.log(`   ${donde ? 'ok   ' : 'FALLA'} ${`${pkg} . ${api}`.padEnd(44)} ${donde || `no está en ${archivo}`}`);
}

console.log(`\n${fallas === 0
  ? 'TODO OK: las APIs nativas que usa la app siguen en su entrypoint'
  : `${fallas} no se encontraron — revisá el CHANGELOG de esos paquetes antes de seguir`}`);
process.exit(fallas === 0 ? 0 : 1);
