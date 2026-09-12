import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { Appearance } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { aplicarTema, temaActual } from '../theme';

/**
 * Claro u oscuro, o lo que diga el teléfono.
 *
 * POR QUÉ HAY TRES OPCIONES Y NO UN INTERRUPTOR. Alguien que puso su teléfono
 * en claro de día y oscuro de noche ya eligió; obligarlo a elegir otra vez acá,
 * y para siempre, es hacerle mantener a mano algo que el sistema ya hace solo.
 * «Sistema» es el valor por omisión por eso. Pero quien quiere esta app siempre
 * oscura aunque su teléfono esté en claro también tiene razón, y ese es el
 * motivo de las otras dos.
 *
 * SE GUARDA EN EL TELÉFONO, NO EN EL SERVIDOR, y es la diferencia con la moneda
 * o el idioma: mirar la pantalla de noche depende del aparato que tenés en la
 * mano, no de quién sos. La misma cuenta puede querer oscuro en el teléfono y
 * claro en una tablet.
 *
 * `SecureStore` y no AsyncStorage sólo porque es lo que esta app ya tiene
 * instalado para el token; acá no hay nada que proteger.
 */
const CLAVE = 'moneyflow.tema';
const ThemeContext = createContext(null);

const delSistema = () => (Appearance.getColorScheme() === 'light' ? 'claro' : 'oscuro');

export function ThemeProvider({ children }) {
  // 'sistema' | 'claro' | 'oscuro' — lo que la persona eligió.
  const [preferencia, setPreferencia] = useState('sistema');
  // El que efectivamente está pintado. Es lo que hay que mirar para pintar.
  const [tema, setTema] = useState(temaActual());
  const [listo, setListo] = useState(false);

  const poner = useCallback((pref) => {
    const efectivo = pref === 'sistema' ? delSistema() : pref;
    aplicarTema(efectivo);
    setTema(efectivo);
  }, []);

  useEffect(() => {
    (async () => {
      let guardada = 'sistema';
      try { guardada = (await SecureStore.getItemAsync(CLAVE)) || 'sistema'; } catch (_) {}
      setPreferencia(guardada);
      poner(guardada);
      setListo(true);
    })();
  }, [poner]);

  // Si está en «Sistema», seguir al teléfono cuando cambia solo —al atardecer,
  // por ejemplo. Sin esto, «Sistema» sería «lo que el sistema decía cuando
  // abriste la app», que no es lo mismo.
  useEffect(() => {
    if (preferencia !== 'sistema') return undefined;
    const sub = Appearance.addChangeListener(() => poner('sistema'));
    return () => sub.remove();
  }, [preferencia, poner]);

  const cambiarTema = useCallback(async (pref) => {
    setPreferencia(pref);
    poner(pref);
    try { await SecureStore.setItemAsync(CLAVE, pref); } catch (_) {}
  }, [poner]);

  return (
    <ThemeContext.Provider value={{ tema, preferencia, cambiarTema, listo }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTema() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTema debe usarse dentro de ThemeProvider');
  return ctx;
}
