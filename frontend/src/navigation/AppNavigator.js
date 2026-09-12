import React, { useRef } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useTema } from '../context/ThemeContext';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { useAuth } from '../context/AuthContext';
import { PlanProvider } from '../context/PlanContext';
import UpgradeModal from '../components/UpgradeModal';
import { FloatingTabBar } from '../components/ui';
import { COLORS, estilos } from '../theme';

import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import UploadScreen from '../screens/UploadScreen';
import SubscriptionsScreen from '../screens/SubscriptionsScreen';
import GoalsScreen from '../screens/GoalsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SuggestionsScreen from '../screens/SuggestionsScreen';
import ShoppingScreen from '../screens/ShoppingScreen';
import SearchScreen from '../screens/SearchScreen';
import PaywallScreen from '../screens/PaywallScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// El ORDEN no se toca: es navegación aprendida. Las etiquetas sí cambian —
// antes la barra era sólo iconos, y un icono de carrito no distingue "lista de
// compras" de "buscador de precios", que es exactamente el par que convive acá.
const TABS = [
  { name: 'Dashboard',     label: 'Wealth', component: DashboardScreen,     icon: (f) => (f ? 'wallet' : 'wallet-outline') },
  { name: 'Upload',        label: 'Movs',   component: UploadScreen,        icon: (f) => (f ? 'receipt' : 'receipt-outline') },
  { name: 'Metas',         label: 'Metas',  component: GoalsScreen,         icon: (f) => (f ? 'flag' : 'flag-outline') },
  { name: 'Suscripciones', label: 'Subs',   component: SubscriptionsScreen, icon: (f) => (f ? 'repeat' : 'repeat-outline') },
  { name: 'Buscar',        label: 'Buscar', component: SearchScreen,        icon: (f) => (f ? 'search' : 'search-outline') },
  { name: 'Compras',       label: 'Lista',  component: ShoppingScreen,      icon: (f) => (f ? 'cart' : 'cart-outline') },
];

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} tabs={TABS} />}
      screenOptions={{ headerShown: false }}
    >
      {TABS.map((tab) => (
        <Tab.Screen key={tab.name} name={tab.name} component={tab.component} />
      ))}
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();
  const { tema, listo } = useTema();
  // Dónde estabas navegando, para que remontar por el tema no te mueva de lugar.
  const estadoNav = useRef();

  if (loading || !listo) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    // REMONTAR AL CAMBIAR DE TEMA, y no sólo confiar en el re-render.
    //
    // Los colores viven en objetos que se mutan (ver theme.js), así que una
    // pantalla repinta bien en cuanto vuelve a renderizar — pero una pantalla
    // que NO consume el contexto del tema puede no renderizar nunca, y quedaría
    // con los colores viejos hasta que algo más la toque. Con la `key` se
    // remonta todo y no queda nada a medio pintar.
    //
    // `initialState` es lo que hace que eso no se note: sin él, cambiar el tema
    // te devuelve al inicio — es decir, te saca de la pantalla de Configuración
    // en el momento exacto en que estás tocando el interruptor.
    <NavigationContainer
      key={tema}
      initialState={estadoNav.current}
      onStateChange={(estado) => { estadoNav.current = estado; }}
    >
      <PlanProvider>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {user ? (
            <>
              <Stack.Screen name="Main" component={MainTabs} />
              <Stack.Screen name="Sugerencias" component={SuggestionsScreen} />
              <Stack.Screen name="Configuracion" component={SettingsScreen} />
              <Stack.Screen
                name="Paywall"
                component={PaywallScreen}
                options={{ presentation: 'modal' }}
              />
            </>
          ) : (
            <Stack.Screen name="Login" component={LoginScreen} />
          )}
        </Stack.Navigator>
        <UpgradeModal />
      </PlanProvider>
    </NavigationContainer>
  );
}

// Se declara con `estilos()` y no con `StyleSheet.create` suelto: create COPIA
// los colores al cargar el modulo, asi que un cambio de tema en caliente no
// repintaria nada. Ver theme.js.
const styles = estilos(() => StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
  },
}));
