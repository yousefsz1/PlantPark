import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const TASK_LABELS: Record<string, string> = {
  watering:    'needs watering 💧',
  fertilizing: 'needs fertilizing 🌱',
  misting:     'needs misting 🌿',
};

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

export async function scheduleTaskNotification(
  plantName: string,
  taskType: string,
  dueDateStr: string,
): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    // Fire at 9 AM on the due date
    const triggerDate = new Date(`${dueDateStr}T09:00:00`);
    if (triggerDate <= new Date()) return null;

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'PlantPal Care Reminder',
        body:  `${plantName} ${TASK_LABELS[taskType] ?? 'needs attention'}`,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
    });
    return id;
  } catch {
    return null;
  }
}

export async function cancelNotification(id: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {}
}
