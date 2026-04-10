import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Cambiá esta URL cuando deploys en Railway
const BASE_URL = 'https://money-flow-co41.onrender.com/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Interceptor: adjunta JWT a cada request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Interceptor: manejo global de errores
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('auth_token');
      // El AuthContext detectará la falta de token y redirigirá al login
    }
    return Promise.reject(error);
  }
);

export default api;
