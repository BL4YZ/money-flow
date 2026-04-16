import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Localization from 'expo-localization';
import es from '../i18n/es';
import en from '../i18n/en';

const TRANSLATIONS = { es, en };
const STORE_KEY = 'app_language';

const LanguageContext = createContext(null);

// Resolve dot-notation key and interpolate {{var}} placeholders
function resolve(obj, key, vars) {
  const val = key.split('.').reduce((o, k) => o?.[k], obj);
  if (typeof val !== 'string') return key;
  if (!vars) return val;
  return Object.entries(vars).reduce(
    (str, [k, v]) => str.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v),
    val
  );
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState('es');

  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(STORE_KEY);
        if (stored === 'es' || stored === 'en') {
          setLang(stored);
        } else {
          // Auto-detect from device locale
          const locale = Localization.getLocales?.()?.[0]?.languageCode ?? 'es';
          setLang(locale === 'en' ? 'en' : 'es');
        }
      } catch (_) {}
    })();
  }, []);

  const switchLanguage = useCallback(async (newLang) => {
    setLang(newLang);
    try { await SecureStore.setItemAsync(STORE_KEY, newLang); } catch (_) {}
  }, []);

  const toggleLanguage = useCallback(() => {
    switchLanguage(lang === 'es' ? 'en' : 'es');
  }, [lang, switchLanguage]);

  const t = useCallback((key, vars) => {
    return resolve(TRANSLATIONS[lang] ?? TRANSLATIONS.es, key, vars);
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, t, toggleLanguage, switchLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage debe usarse dentro de LanguageProvider');
  return ctx;
}
