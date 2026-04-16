import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { COLORS, RADIUS } from '../theme';

import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import UploadScreen from '../screens/UploadScreen';
import SubscriptionsScreen from '../screens/SubscriptionsScreen';
import GoalsScreen from '../screens/GoalsScreen';
import SuggestionsScreen from '../screens/SuggestionsScreen';
import ShoppingScreen from '../screens/ShoppingScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TABS = [
  {
    name: 'Dashboard',
    label: 'Wealth',
    component: DashboardScreen,
    icon: (focused) => focused ? 'wallet' : 'wallet-outline',
  },
  {
    name: 'Upload',
    label: 'Transactions',
    component: UploadScreen,
    icon: (focused) => focused ? 'receipt' : 'receipt-outline',
  },
  {
    name: 'Metas',
    label: 'Goals',
    component: GoalsScreen,
    icon: (focused) => focused ? 'flag' : 'flag-outline',
  },
  {
    name: 'Suscripciones',
    label: 'Subs',
    component: SubscriptionsScreen,
    icon: (focused) => focused ? 'repeat' : 'repeat-outline',
  },
  {
    name: 'Sugerencias',
    label: 'Advice',
    component: SuggestionsScreen,
    icon: (focused) => focused ? 'sparkles' : 'sparkles-outline',
  },
  {
    name: 'Compras',
    label: 'Shopping',
    component: ShoppingScreen,
    icon: (focused) => focused ? 'cart' : 'cart-outline',
  },
];

function AnimatedTabIcon({ iconName, size, color, focused }) {
  const scale = useRef(new Animated.Value(1)).current;
  const prevFocused = useRef(focused);

  useEffect(() => {
    if (focused && !prevFocused.current) {
      Animated.sequence([
        Animated.spring(scale, {
          toValue: 1.45,
          damping: 5,
          stiffness: 500,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          damping: 12,
          stiffness: 280,
          useNativeDriver: true,
        }),
      ]).start();
    }
    prevFocused.current = focused;
  }, [focused]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Ionicons name={iconName} size={size} color={color} />
    </Animated.View>
  );
}

function TabLabel({ label, focused }) {
  return (
    <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>
      {label}
    </Text>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => {
        const tab = TABS.find(t => t.name === route.name);
        return {
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarBackground: () => <View style={styles.tabBarBg} />,
          tabBarShowLabel: false,
          tabBarActiveTintColor: COLORS.primary,
          tabBarInactiveTintColor: COLORS.onSurfaceVariant,
          tabBarIcon: ({ focused, color }) => (
            <AnimatedTabIcon iconName={tab?.icon(focused)} size={24} color={color} focused={focused} />
          ),
        };
      }}
    >
      {TABS.map(tab => (
        <Tab.Screen key={tab.name} name={tab.name} component={tab.component} />
      ))}
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loading}>
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

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  tabBar: {
    position: 'absolute',
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    elevation: 0,
    height: 60,
    paddingBottom: 8,
    paddingTop: 8,
  },
  tabBarBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.surfaceContainer + 'CC', // 80% opacity
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 20,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.onSurfaceVariant,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  tabLabelActive: {
    color: COLORS.primary,
  },
});
