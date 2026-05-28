import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { PlanProvider } from '../context/PlanContext';
import UpgradeModal from '../components/UpgradeModal';
import { COLORS } from '../theme';

import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import UploadScreen from '../screens/UploadScreen';
import SubscriptionsScreen from '../screens/SubscriptionsScreen';
import GoalsScreen from '../screens/GoalsScreen';
import SuggestionsScreen from '../screens/SuggestionsScreen';
import ShoppingScreen from '../screens/ShoppingScreen';
import PaywallScreen from '../screens/PaywallScreen';

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


function FloatingTabBar({ state, descriptors, navigation }) {
  return (
    <View style={styles.floatingBarWrapper} pointerEvents="box-none">
      <View style={styles.floatingBar}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const tab = TABS.find(t => t.name === route.name);
          const color = focused ? COLORS.primary : COLORS.onSurfaceVariant + 'AA';

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          return (
            <FloatingTabItem
              key={route.key}
              tab={tab}
              focused={focused}
              color={color}
              onPress={onPress}
            />
          );
        })}
      </View>
    </View>
  );
}

function FloatingTabItem({ tab, focused, color, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;
  const bgScale = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const prevFocused = useRef(focused);

  useEffect(() => {
    if (focused !== prevFocused.current) {
      if (focused) {
        Animated.parallel([
          Animated.sequence([
            Animated.spring(scale, { toValue: 1.3, damping: 5, stiffness: 500, useNativeDriver: true }),
            Animated.spring(scale, { toValue: 1, damping: 12, stiffness: 280, useNativeDriver: true }),
          ]),
          Animated.spring(bgScale, { toValue: 1, damping: 18, stiffness: 300, useNativeDriver: true }),
        ]).start();
      } else {
        Animated.spring(bgScale, { toValue: 0, damping: 18, stiffness: 300, useNativeDriver: true }).start();
      }
    }
    prevFocused.current = focused;
  }, [focused]);

  return (
    <Animated.View
      style={styles.floatingTabItem}
    >
      {/* Active pill background */}
      <Animated.View style={[styles.activeIndicator, { transform: [{ scale: bgScale }], opacity: bgScale }]} />
      <Animated.View onTouchEnd={onPress} style={[styles.floatingTabTouch, { transform: [{ scale }] }]}>
        <Ionicons name={tab?.icon(focused)} size={22} color={color} />
      </Animated.View>
    </Animated.View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={props => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
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
      <PlanProvider>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {user ? (
            <>
              <Stack.Screen name="Main" component={MainTabs} />
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

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },

  // Floating tab bar
  floatingBarWrapper: {
    position: 'absolute',
    bottom: 28,
    left: 24,
    right: 24,
    alignItems: 'center',
  },
  floatingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: 40,
    paddingVertical: 10,
    paddingHorizontal: 8,
    width: '100%',
    // Border for glass edge
    borderWidth: 1,
    borderColor: COLORS.outlineVariant + '30',
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 24,
  },
  floatingTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
  },
  activeIndicator: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary + '20',
  },
  floatingTabTouch: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
