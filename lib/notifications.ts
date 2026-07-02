import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const WATERING_CONTENT = {
  title: 'Time to Water!',
  body:  (name: string) => `${name} is thirsty — water it for +10 XP`,
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
  plantId?: string,
): Promise<string | null> {
  if (Platform.OS === 'web' || taskType !== 'watering') return null;
  try {
    const triggerDate = new Date(`${dueDateStr}T09:00:00`);
    if (triggerDate <= new Date()) return null;
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: WATERING_CONTENT.title,
        body:  WATERING_CONTENT.body(plantName),
        sound: true,
        data: plantId ? { plantId } : undefined,
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

export async function cancelPlantNotifications(plantId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(n => (n.content.data as { plantId?: string } | null)?.plantId === plantId)
        .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {}
}

export async function cancelNotification(id: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {}
}
