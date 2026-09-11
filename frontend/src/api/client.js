import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// PRODUCCIÓN: Render
const BASE_URL = 'https://money-flow-co41.onrender.com/api';

// LOCAL: backend corriendo en tu PC
// const BASE_URL = 'http://192.168.1.3:3000/api';

// EL PLAN GRATUITO DE RENDER DUERME EL SERVICIO A LOS 15 MINUTOS, y levantarlo
// otra vez tarda bastante más de lo que nadie espera: medido contra producción,
// **42,5 segundos**. El timeout estaba en 15 s, así que la primera pantalla
// después de un rato de inactividad fallaba SIEMPRE — y como el error se veía
// igual que un problema de red, parecía que la app estaba rota.
//
// No alcanza con subir el timeout a 60 s: eso haría que cualquier fallo real
// deje al usuario mirando un spinner un minuto entero. La forma que funciona es
// un timeout corto para el caso normal y UN reintento con presupuesto largo
// cuando no llegó ninguna respuesta, que es exactamente la firma de un servicio
// despertándose.
const TIMEOUT_NORMAL = 20000;
const TIMEOUT_DESPERTANDO = 75000;

const api = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT_NORMAL,
  headers: { 'Content-Type': 'application/json' },
});

// Sin `response` no hubo respuesta del servidor: timeout, DNS, o el servicio
// levantándose. Es distinto de un 401 o un 500, y hay que tratarlo distinto —
// un 401 dice que el token no sirve; esto no dice nada sobre el token.
export const esErrorDeRed = (error) => !error?.response;

/**
 * Despertar el servicio sin bloquear al usuario. Se llama al abrir la app, así
 * que para cuando la persona terminó de escribir su contraseña el servidor ya
 * está levantado. Usa /health, que no toca la base y no necesita token.
 *
 * Falla en silencio a propósito: es una optimización, y si no funciona el
 * reintento de abajo cubre igual.
 */
export function despertarServidor() {
  return axios
    .get(`${BASE_URL.replace(/\/api$/, '')}/health`, { timeout: TIMEOUT_DESPERTANDO })
    .then(() => true)
    .catch(() => false);
}

// Interceptor: adjunta JWT a cada request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Qué se puede repetir sin consecuencias. Un GET siempre; login y register
// también, porque volver a pedirlos no crea nada nuevo. El resto de los POST
// NO se reintentan: un timeout no dice si el servidor llegó a procesarlo, y
// repetir un POST que sí entró crearía la meta o el depósito dos veces.
const sePuedeRepetir = (config) =>
  config.method === 'get' || /\/auth\/(login|register)\b/.test(config.url || '');

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;

    if (esErrorDeRed(error) && config && !config.__reintentado && sePuedeRepetir(config)) {
      config.__reintentado = true;
      config.timeout = TIMEOUT_DESPERTANDO;
      return api.request(config);
    }

    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('auth_token');
      // El AuthContext detectará la falta de token y redirigirá al login
    }
    return Promise.reject(error);
  }
);

export default api;
