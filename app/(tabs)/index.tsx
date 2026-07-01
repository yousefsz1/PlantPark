import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { getLevel, xpToNextLevel } from '../../lib/levels';
import { scheduleTaskNotification } from '../../lib/notifications';
import type { Plant, CareTaskWithPlant } from '../../types/database';
import { Colors, Spacing, Radius, FontSize } from '../../constants/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getMood(health: number): { emoji: string; color: string } {
  if (health >= 80) return { emoji: '😊', color: Colors.primary };
  if (health >= 50) return { emoji: '😐', color: Colors.warning };
  return { emoji: '🥺', color: Colors.danger };
}

const TASK_ICON: Record<string, string> = {
  watering:    '💧',
  fertilizing: '🌱',
  misting:     '🌿',
};
const TASK_LABEL: Record<string, string> = {
  watering:    'Water',
  fertilizing: 'Fertilize',
  misting:     'Mist',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function LevelBar({ totalXP }: { totalXP: number }) {
  const level = getLevel(totalXP);
  const { current, pct, needed } = xpToNextLevel(totalXP);
  const isMax = needed === 0;

  return (
    <View style={styles.levelBar}>
      <View style={styles.levelBarRow}>
        <Text style={styles.levelName}>{level.emoji} {level.name}</Text>
        <Text style={styles.levelXP}>{totalXP.toLocaleString()} XP</Text>
      </View>
      <View style={styles.levelProgressBg}>
        <View style={[styles.levelProgressFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.levelNextText}>
        {isMax ? 'Max level reached!' : `${needed} XP to next level`}
      </Text>
    </View>
  );
}

function PlantCard({ plant, pendingTasks }: { plant: Plant; pendingTasks: CareTaskWithPlant[] }) {
  const today = todayISO();
  const overdueCount = pendingTasks.filter(t => t.plant_id === plant.id && t.due_date < today).length;
  const displayHealth = Math.max(0, plant.health_percent - overdueCount * 10);
  const { emoji, color } = getMood(displayHealth);

  return (
    <View style={styles.plantCard}>
      <View style={styles.plantMoodWrap}>
        <Text style={styles.plantMood}>{emoji}</Text>
      </View>
      <View style={styles.plantInfo}>
        <View style={styles.plantRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.plantName}>{plant.name}</Text>
            {plant.species ? <Text style={styles.plantSpecies}>{plant.species}</Text> : null}
          </View>
          <View style={styles.levelBadge}>
            <Text style={styles.levelBadgeText}>Lv {plant.level}</Text>
          </View>
        </View>
        <View style={styles.healthRow}>
          <View style={styles.healthBarBg}>
            <View style={[styles.healthBarFill, { width: `${displayHealth}%`, backgroundColor: color }]} />
          </View>
          <Text style={[styles.healthPct, { color }]}>{displayHealth}%</Text>
        </View>
      </View>
    </View>
  );
}

function MissionCard({
  task,
  isCompleting,
  onComplete,
}: {
  task: CareTaskWithPlant;
  isCompleting: boolean;
  onComplete: () => void;
}) {
  const today = todayISO();
  const isOverdue = task.due_date < today;

  return (
    <View style={[styles.missionCard, isOverdue && styles.missionCardOverdue]}>
      <Text style={styles.missionEmoji}>{TASK_ICON[task.task_type] ?? '🌿'}</Text>
      <View style={styles.missionInfo}>
        <Text style={styles.missionAction}>
          {TASK_LABEL[task.task_type]} {task.plants?.name ?? 'plant'}
        </Text>
        {isOverdue && <Text style={styles.missionOverdue}>Overdue</Text>}
      </View>
      <View style={styles.missionXPBadge}>
        <Text style={styles.missionXPText}>+{task.xp_reward} XP</Text>
      </View>
      <TouchableOpacity
        style={[styles.doneBtn, isCompleting && styles.doneBtnBusy]}
        onPress={onComplete}
        disabled={isCompleting}
      >
        {isCompleting ? (
          <ActivityIndicator size="small" color={Colors.textPrimary} />
        ) : (
          <Text style={styles.doneBtnText}>Done</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function EmptyGarden({ onAddFirst }: { onAddFirst: () => void }) {
  return (
    <View style={styles.emptyContainer}>
      <Ionicons name="leaf-outline" size={72} color={Colors.textMuted} />
      <Text style={styles.emptyTitle}>Your garden is empty</Text>
      <Text style={styles.emptySubtitle}>
        Add your first plant to start earning XP and levelling up your garden.
      </Text>
      <TouchableOpacity style={styles.addFirstBtn} onPress={onAddFirst}>
        <Ionicons name="add" size={20} color={Colors.textPrimary} />
        <Text style={styles.addFirstBtnText}>Add First Plant</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function GardenScreen() {
  const router = useRouter();
  const [plants, setPlants]             = useState<Plant[]>([]);
  const [pendingTasks, setPendingTasks] = useState<CareTaskWithPlant[]>([]);
  const [totalXP, setTotalXP]           = useState(0);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [completingTask, setCompletingTask] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const fetchData = useCallback(async () => {
    setError(null);
    const today = todayISO();

    const [plantsRes, tasksRes, profileRes] = await Promise.all([
      supabase.from('plants').select('*').order('created_at', { ascending: true }),
      supabase
        .from('care_tasks')
        .select('*, plants(id, name)')
        .lte('due_date', today)
        .is('completed_at', null)
        .order('due_date'),
      supabase.from('profiles').select('total_xp').maybeSingle(),
    ]);

    if (plantsRes.error) {
      setError(plantsRes.error.message);
    } else {
      setPlants(plantsRes.data ?? []);
    }
    setPendingTasks((tasksRes.data ?? []) as CareTaskWithPlant[]);
    setTotalXP(profileRes.data?.total_xp ?? 0);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!hasLoaded.current) setLoading(true);
      fetchData().finally(() => {
        setLoading(false);
        hasLoaded.current = true;
      });
    }, [fetchData]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleCompleteTask = useCallback(async (task: CareTaskWithPlant) => {
    setCompletingTask(task.id);
    try {
      const { data, error: rpcErr } = await supabase.rpc('complete_care_task', { task_id: task.id });
      if (rpcErr) throw rpcErr;

      const result = data as { next_due_date: string; task_type: string } | null;
      if (result?.next_due_date && task.plants?.name) {
        scheduleTaskNotification(task.plants.name, result.task_type, result.next_due_date).catch(() => {});
      }

      await fetchData();
    } catch {
      // silently ignore — list refreshes on next focus
    } finally {
      setCompletingTask(null);
    }
  }, [fetchData]);

  const openAddPlant = useCallback(() => router.push('/add-plant'), [router]);

  const visibleMissions = pendingTasks.slice(0, 3);
  const extraMissions = pendingTasks.length - visibleMissions.length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          !loading && plants.length === 0 && styles.contentCentered,
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting()} 🌱</Text>
            <Text style={styles.title}>My Garden</Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={openAddPlant}>
            <Ionicons name="add" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Level bar */}
        <LevelBar totalXP={totalXP} />

        {/* Content */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="warning-outline" size={32} color={Colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchData}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : plants.length === 0 ? (
          <EmptyGarden onAddFirst={openAddPlant} />
        ) : (
          <>
            {/* Today's Missions */}
            <Text style={styles.sectionTitle}>Today's Missions</Text>
            {visibleMissions.length === 0 ? (
              <View style={styles.noMissions}>
                <Text style={styles.noMissionsText}>All plants are happy today!</Text>
              </View>
            ) : (
              <>
                {visibleMissions.map(task => (
                  <MissionCard
                    key={task.id}
                    task={task}
                    isCompleting={completingTask === task.id}
                    onComplete={() => handleCompleteTask(task)}
                  />
                ))}
                {extraMissions > 0 && (
                  <Text style={styles.extraMissions}>+{extraMissions} more task{extraMissions > 1 ? 's' : ''}</Text>
                )}
              </>
            )}

            {/* Plants */}
            <Text style={[styles.sectionTitle, { marginTop: Spacing.lg }]}>Your Plants</Text>
            {plants.map(p => (
              <PlantCard key={p.id} plant={p} pendingTasks={pendingTasks} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  contentCentered: { flexGrow: 1 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  greeting: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: 2 },
  title: { fontSize: FontSize.hero, fontWeight: '700', color: Colors.textPrimary },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Level bar
  levelBar: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  levelBarRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  levelName: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  levelXP: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.xp },
  levelProgressBg: {
    height: 8,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  levelProgressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
  },
  levelNextText: { fontSize: FontSize.xs, color: Colors.textMuted },

  // Sections
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },

  // Missions
  noMissions: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  noMissionsText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  missionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  missionCardOverdue: { borderColor: Colors.danger },
  missionEmoji: { fontSize: 22, width: 30, textAlign: 'center' },
  missionInfo: { flex: 1, gap: 2 },
  missionAction: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  missionOverdue: { fontSize: FontSize.xs, color: Colors.danger, fontWeight: '600' },
  missionXPBadge: {
    backgroundColor: 'rgba(244,208,63,0.15)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  missionXPText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.xp },
  doneBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnBusy: { opacity: 0.6 },
  doneBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textPrimary },
  extraMissions: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },

  // Plant cards
  plantCard: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  plantMoodWrap: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  plantMood: { fontSize: 26 },
  plantInfo: { flex: 1, gap: 6 },
  plantRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  plantName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  plantSpecies: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },
  levelBadge: {
    backgroundColor: Colors.primaryDark,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  levelBadgeText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textPrimary },
  healthRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  healthBarBg: {
    flex: 1,
    height: 5,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  healthBarFill: { height: '100%', borderRadius: Radius.full },
  healthPct: { fontSize: FontSize.xs, fontWeight: '700', minWidth: 32, textAlign: 'right' },

  // States
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  errorContainer: { flex: 1, alignItems: 'center', paddingTop: 80, gap: Spacing.sm },
  errorText: { fontSize: FontSize.sm, color: Colors.danger, textAlign: 'center' },
  retryBtn: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
  },
  retryText: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: '600' },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: 40,
    gap: Spacing.md,
  },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  emptySubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  addFirstBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
  },
  addFirstBtnText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
});
