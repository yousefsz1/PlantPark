import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import type { CareTaskWithPlantPhoto } from '../../types/database';
import { Colors, Spacing, Radius, FontSize } from '../../constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskType = CareTaskWithPlantPhoto['task_type'];
type ScheduleGroup = { label: string; tasks: CareTaskWithPlantPhoto[] };

// ─── Config ───────────────────────────────────────────────────────────────────

const TASK_CONFIG: Record<TaskType, { icon: string; color: string; label: string }> = {
  watering:    { icon: 'water',          color: '#4A90D9', label: 'Water' },
  fertilizing: { icon: 'leaf',           color: '#E67E22', label: 'Fertilize' },
  misting:     { icon: 'cloudy-outline', color: '#6BB5C5', label: 'Mist' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysToToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDueDate(due_date: string): string {
  // Parse as local date, not UTC, to avoid off-by-one day shifts
  const [y, m, d] = due_date.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function groupBySchedule(tasks: CareTaskWithPlantPhoto[]): ScheduleGroup[] {
  const today = todayISO();
  const tomorrow = addDaysToToday(1);
  const weekEnd = addDaysToToday(7);

  const buckets: Record<'Today' | 'Tomorrow' | 'This Week' | 'Later', CareTaskWithPlantPhoto[]> = {
    'Today': [],
    'Tomorrow': [],
    'This Week': [],
    'Later': [],
  };

  for (const task of tasks) {
    if (task.due_date <= today) buckets['Today'].push(task);
    else if (task.due_date === tomorrow) buckets['Tomorrow'].push(task);
    else if (task.due_date <= weekEnd) buckets['This Week'].push(task);
    else buckets['Later'].push(task);
  }

  return (['Today', 'Tomorrow', 'This Week', 'Later'] as const)
    .filter(label => buckets[label].length > 0)
    .map(label => ({ label, tasks: buckets[label] }));
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ScheduleScreen() {
  const router = useRouter();
  const [tasks, setTasks]           = useState<CareTaskWithPlantPhoto[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoaded = useRef(false);

  const fetchTasks = useCallback(async () => {
    const { data } = await supabase
      .from('care_tasks')
      .select('*, plants(id, name, photo_url)')
      .is('completed_at', null)
      .order('due_date', { ascending: true });
    setTasks((data ?? []) as CareTaskWithPlantPhoto[]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!hasLoaded.current) setLoading(true);
      fetchTasks().finally(() => {
        setLoading(false);
        hasLoaded.current = true;
      });
    }, [fetchTasks]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTasks();
    setRefreshing(false);
  }, [fetchTasks]);

  const groups = groupBySchedule(tasks);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Schedule</Text>
          <Text style={styles.subtitle}>Upcoming plant care</Text>
        </View>

        {/* Body */}
        {loading ? (
          <ActivityIndicator size="large" color={Colors.primary} style={styles.loader} />
        ) : tasks.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="checkmark-circle-outline" size={40} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>All caught up! 🌱</Text>
            <Text style={styles.emptySubtitle}>
              No upcoming care tasks — check back later or add a new plant.
            </Text>
          </View>
        ) : (
          groups.map(group => (
            <View key={group.label}>
              <Text style={styles.dateLabel}>{group.label}</Text>
              {group.tasks.map(task => {
                const cfg = TASK_CONFIG[task.task_type] ?? TASK_CONFIG.watering;

                return (
                  <TouchableOpacity
                    key={task.id}
                    style={styles.taskCard}
                    activeOpacity={0.8}
                    onPress={() => task.plants && router.push(`/plant/${task.plants.id}`)}
                  >
                    {/* Left: photo or icon */}
                    <View style={styles.avatarWrap}>
                      {task.plants?.photo_url ? (
                        <>
                          <Image
                            source={{ uri: task.plants.photo_url }}
                            style={styles.plantThumb}
                            resizeMode="cover"
                          />
                          <View style={[styles.iconBadge, { backgroundColor: cfg.color }]}>
                            <Ionicons name={cfg.icon as any} size={10} color="#FFFFFF" />
                          </View>
                        </>
                      ) : (
                        <View style={[styles.iconCircle, { backgroundColor: `${cfg.color}26` }]}>
                          <Ionicons name={cfg.icon as any} size={22} color={cfg.color} />
                        </View>
                      )}
                    </View>

                    {/* Middle: task + plant name + due date */}
                    <View style={styles.taskBody}>
                      <Text style={styles.taskMessage}>
                        {cfg.label} {task.plants?.name ?? 'plant'}
                      </Text>
                      <Text style={styles.taskDueDate}>{formatDueDate(task.due_date)}</Text>
                    </View>

                    {/* Right: XP badge */}
                    <View style={styles.xpBadge}>
                      <Text style={styles.xpBadgeText}>+{task.xp_reward} XP</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  loader:  { marginTop: 80 },

  // Header
  header: { marginBottom: Spacing.lg },
  title:    { fontSize: FontSize.hero, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(46,204,113,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(46,204,113,0.25)',
  },
  emptyTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
  },

  // Section labels
  dateLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },

  // Task cards
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  // Avatar (photo or icon)
  avatarWrap: { position: 'relative', flexShrink: 0 },
  plantThumb: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceElevated,
  },
  iconBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Task body
  taskBody:    { flex: 1, gap: 3 },
  taskMessage: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary, lineHeight: 19 },
  taskDueDate: { fontSize: FontSize.xs, color: Colors.textMuted },

  // XP badge
  xpBadge: {
    backgroundColor: 'rgba(244,208,63,0.12)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(244,208,63,0.3)',
    flexShrink: 0,
  },
  xpBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.xp,
  },
});
