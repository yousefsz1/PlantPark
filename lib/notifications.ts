import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

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

// Registers this device for remote push (separate from the local, on-device
// scheduling above) and saves the Expo push token to the signed-in user's
// profile — currently only consumed by the planned rain-watering alerts.
// Call once per login/app-start; safe to call repeatedly since it's just an
// upsert of the current token.
export async function registerForPushNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Via RPC — direct client updates to profiles were removed for security
    // (the old policy also allowed writing membership_tier / total_xp).
    await supabase.rpc('set_push_token', { p_token: token });
  } catch {
    // Non-fatal — denied permission, no physical device, or a network hiccup
    // all just mean no token gets saved; push sends will skip this user.
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

// Re-syncs every watering reminder from the database on app start. Needed
// because Smart Watering completes tasks SERVER-side (rain auto-watering):
// the server creates the next task, but local notifications only get
// scheduled on-device — so rain-watered plants (typically the lawn) would
// silently never get another reminder. This heals that, plus reinstalls
// and any other drift, by treating the DB as the source of truth.
export async function syncWateringNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    const { data: tasks } = await supabase
      .from('care_tasks')
      .select('id, plant_id, due_date, plants(name)')
      .eq('task_type', 'watering')
      .is('completed_at', null);
    if (!tasks) return;

    // Cancel all plant-tagged scheduled notifications, then rebuild.
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(n => (n.content.data as { plantId?: string } | null)?.plantId)
        .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );

    const todayStr = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

    for (const t of tasks) {
      const name = (t as { plants?: { name?: string } | null }).plants?.name ?? 'Your plant';
      // Overdue tasks would be skipped (trigger date in the past) — nudge
      // tomorrow at 9am instead so they don't fall silent forever.
      const dueDate = t.due_date <= todayStr ? tomorrowStr : t.due_date;
      await scheduleTaskNotification(name, 'watering', dueDate, t.plant_id ?? undefined);
    }
  } catch {
    // Non-fatal — next app start will retry.
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
