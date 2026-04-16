import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import api from '../api/client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Request push permission, get the Expo push token, and register it
 * with the backend. Call this once after the user logs in.
 */
export async function registerPushToken() {
  if (!Device.isDevice) {
    console.log('[notifications] Push not available on simulator');
    return;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[notifications] Permission denied');
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('bills', {
      name: 'Bill Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: '2cf48df6-d480-42dd-9070-686c91004595',
    });
    await api.post('/push-token', { token });
    console.log('[notifications] Push token registered:', token);
  } catch (err) {
    console.log('[notifications] Token registration failed:', err.message);
  }
}

/** Days until next due date for a bill (pure calc, no async). */
export function daysUntilDue(dueDay) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), parseInt(dueDay));
  const target = thisMonth > today
    ? thisMonth
    : new Date(today.getFullYear(), today.getMonth() + 1, parseInt(dueDay));
  return Math.round((target - today) / 86400000);
}
