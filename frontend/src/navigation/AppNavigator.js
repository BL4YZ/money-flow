import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { COLORS } from '../theme';

// Auth screens
import LoginScreen from '../screens/LoginScreen';

// App screens
import DashboardScreen from '../screens/DashboardScreen';
import UploadScreen from '../screens/UploadScreen';
import SubscriptionsScreen from '../screens/SubscriptionsScreen';
import GoalsScreen from '../screens/GoalsScreen';
import SuggestionsScreen from '../screens/SuggestionsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: { backgroundColor: COLORS.surface, borderTopColor: COLORS.border },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarIcon: ({ focused, color, size }) => {
          const icons = {
            Dashboard: focused ? 'home' : 'home-outline',
            Upload: focused ? 'cloud-upload' : 'cloud-upload-outline',
            Suscripciones: focused ? 'repeat' : 'repeat-outline',
            Metas: focused ? 'flag' : 'flag-outline',
            Sugerencias: focused ? 'bulb' : 'bulb-outline',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Upload" component={UploadScreen} options={{ tabBarLabel: 'Subir PDF' }} />
      <Tab.Screen name="Suscripciones" component={SubscriptionsScreen} />
      <Tab.Screen name="Metas" component={GoalsScreen} />
      <Tab.Screen name="Sugerencias" component={SuggestionsScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="Main" component={MainTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
