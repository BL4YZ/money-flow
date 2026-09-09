import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Toast from 'react-native-toast-message';
import { useFonts } from 'expo-font';
// Se importa el subpath de CADA peso, no la raíz del paquete: el index.js de
// `@expo-google-fonts/*` hace require de todos los pesos, así que importar de
// ahí empaquetaba las 23 fuentes (2,5 MB) en vez de las 6 que se usan.
import { Manrope_400Regular }   from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium }    from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold }  from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold }      from '@expo-google-fonts/manrope/700Bold';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope/800ExtraBold';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';
import { JetBrainsMono_700Bold }   from '@expo-google-fonts/jetbrains-mono/700Bold';

import { AuthProvider } from './src/context/AuthContext';
import { LanguageProvider } from './src/context/LanguageContext';
import AppNavigator from './src/navigation/AppNavigator';
import { COLORS } from './src/theme';

export default function App() {
  // Los pesos se cargan como familias separadas porque los paquetes de
  // expo-google-fonts no exportan una familia con pesos — ver la nota en
  // theme.js. Son 6 TTF: 4 de Manrope y 2 de JetBrains Mono (montos).
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  // Se renderiza también si la carga FALLA: un fontFamily inexistente cae a la
  // fuente del sistema y la app se ve peor, pero se ve. Quedarse en el guard
  // ante un error de red sería una pantalla en blanco permanente.
  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: COLORS.bg }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LanguageProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <AppNavigator />
          <Toast />
        </AuthProvider>
      </LanguageProvider>
    </GestureHandlerRootView>
  );
}
