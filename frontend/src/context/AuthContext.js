import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import api from '../api/client';
import { registerPushToken } from '../utils/notifications';
import { initPurchases } from '../services/purchases';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const token = await SecureStore.getItemAsync('auth_token');
      if (token) {
        const { data } = await api.get('/auth/me');
        setUser(data.user);
      }
    } catch (_) {}
  };

  // Al arrancar la app, verificar si hay token guardado
  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('auth_token');
        if (token) {
          const { data } = await api.get('/auth/me');
          setUser(data.user);
          registerPushToken();            // fire-and-forget
          initPurchases(data.user.id);   // fire-and-forget
        }
      } catch (_) {
        await SecureStore.deleteItemAsync('auth_token');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Re-fetch plan when app comes back to foreground (e.g. after upgrading)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshUser();
    });
    return () => sub.remove();
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    await SecureStore.setItemAsync('auth_token', data.token);
    setUser(data.user);
    registerPushToken();
    initPurchases(data.user.id);
    return data.user;
  };

  const register = async (name, email, password) => {
    const { data } = await api.post('/auth/register', { name, email, password });
    await SecureStore.setItemAsync('auth_token', data.token);
    setUser(data.user);
    registerPushToken();
    initPurchases(data.user.id);
    return data.user;
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('auth_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
