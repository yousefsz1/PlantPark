import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Alert,
  Animated,
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { getLevel, xpToNextLevel } from '../../lib/levels';
import { scheduleTaskNotification, cancelPlantNotifications } from '../../lib/notifications';
import type { Plant, CareTaskWithPlant, Space } from '../../types/database';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import PlantCard from '../../components/PlantCard';
import CreateSpaceModal from '../../components/CreateSpaceModal';

const DELETE_ACTION_WIDTH = 80;

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

function nameFromEmail(email: string): string {
  const part = email.split('@')[0].split(/[._-]/)[0];
  return part.charAt(0).toUpperCase() + part.slice(1);
}

function greetingIcon(): 'sunny-outline' | 'partly-sunny-outline' | 'moon-outline' {
  const h = new Date().getHours();
  if (h < 12) return 'sunny-outline';
  if (h < 17) return 'partly-sunny-outline';
  return 'moon-outline';
}

const LEVEL_ICONS: Record<string, 'leaf-outline' | 'leaf' | 'flower-outline' | 'flower' | 'star-outline' | 'star' | 'ribbon' | 'trophy'> = {
  'Seedling':         'leaf-outline',
  'Sprout':           'leaf',
  'Grower':           'flower-outline',
  'Budding Gardener': 'flower',
  'Green Thumb':      'star-outline',
  'Bloom Keeper':     'star',
  'Garden Sage':      'ribbon',
  'Master Gardener':  'trophy',
};

function extractStoragePath(publicUrl: string): string | null {
  const marker = '/plant-images/';
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return publicUrl.slice(idx + marker.length);
}

const TASK_ICON: Record<string, 'water'> = {
  watering: 'water',
};
const TASK_COLOR: Record<string, string> = {
  watering: '#4A90D9',
};

const TASK_LABEL: Record<string, string> = {
  watering: 'Water',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function LevelBar({ totalXP }: { totalXP: number }) {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const level = getLevel(totalXP);
  const { pct, needed } = xpToNextLevel(totalXP);
  const isMax = needed === 0;

  return (
    <View style={styles.levelBar}>
      <View style={styles.levelBarRow}>
        <View style={styles.levelNameRow}>
          <Ionicons name={LEVEL_ICONS[level.name] ?? 'leaf'} size={15} color={Colors.textPrimary} />
          <Text style={styles.levelName}>{level.name}</Text>
        </View>
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

function SwipeablePlantCard({
  plant,
  pendingTasks,
  deleting,
  onPress,
  onDelete,
}: {
  plant: Plant;
  pendingTasks: CareTaskWithPlant[];
  deleting: boolean;
  onPress: () => void;
  onDelete: () => void;
}) {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const trans = useRef(new Animated.Value(0)).current;
  const openRef = useRef(false);

  const springTo = (val: number) =>
    Animated.spring(trans, { toValue: val, useNativeDriver: true, bounciness: 0, speed: 20 }).start();

  const close = useCallback(() => {
    openRef.current = false;
    springTo(0);
  }, []);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        const base = openRef.current ? -DELETE_ACTION_WIDTH : 0;
        trans.setValue(Math.max(-DELETE_ACTION_WIDTH, Math.min(0, base + g.dx)));
      },
      onPanResponderRelease: (_, g) => {
        const base = openRef.current ? -DELETE_ACTION_WIDTH : 0;
        const final = Math.max(-DELETE_ACTION_WIDTH, Math.min(0, base + g.dx));
        if (final < -(DELETE_ACTION_WIDTH / 2)) {
          openRef.current = true;
          springTo(-DELETE_ACTION_WIDTH);
        } else {
          openRef.current = false;
          springTo(0);
        }
      },
    })
  ).current;

  const today = todayISO();
  const overdueCount = pendingTasks.filter(t => t.plant_id === plant.id && t.due_date < today).length;
  const displayHealth = Math.max(0, plant.health_percent - overdueCount * 10);

  return (
    <View style={styles.swipeRow}>
      {/* Delete action revealed on swipe-left */}
      <TouchableOpacity
        style={[styles.deleteAction, deleting && { opacity: 0.6 }]}
        onPress={() => { close(); onDelete(); }}
        activeOpacity={0.85}
        disabled={deleting}
      >
        {deleting ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
            <Text style={styles.deleteActionText}>Delete</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Card — slides left on swipe */}
      <Animated.View style={{ transform: [{ translateX: trans }] }} {...pan.panHandlers}>
        <TouchableOpacity
          onPress={() => {
            if (openRef.current) { close(); return; }
            onPress();
          }}
          onLongPress={onDelete}
          delayLongPress={500}
          activeOpacity={0.82}
        >
          <PlantCard plant={plant} displayHealth={displayHealth} />
        </TouchableOpacity>
      </Animated.View>
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
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const today = todayISO();
  const isOverdue = task.due_date < today;

  return (
    <View style={[styles.missionCard, isOverdue && styles.missionCardOverdue]}>
      <View style={[styles.missionIconWrap, { backgroundColor: `${TASK_COLOR[task.task_type] ?? Colors.primary}18` }]}>
        <Ionicons name={TASK_ICON[task.task_type] ?? 'leaf'} size={20} color={TASK_COLOR[task.task_type] ?? Colors.primary} />
      </View>
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


function SpaceCard({ space, plants, onPress }: { space: Space; plants: Plant[]; onPress: () => void }) {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const spacePlants = plants.filter(p => p.space_id === space.id);
  const thumbs = spacePlants.slice(0, 4);

  return (
    <TouchableOpacity style={styles.spaceCard} onPress={onPress} activeOpacity={0.82}>
      <View style={styles.spaceThumbGrid}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.spaceThumbTile}>
            {thumbs[i]?.photo_url ? (
              <Image source={{ uri: thumbs[i].photo_url! }} style={styles.spaceThumbImage} resizeMode="cover" />
            ) : (
              <Ionicons name="leaf-outline" size={16} color={Colors.textMuted} style={{ opacity: 0.5 }} />
            )}
          </View>
        ))}
      </View>
      <Text style={styles.spaceName} numberOfLines={1}>{space.name}</Text>
      <Text style={styles.spaceCount}>{spacePlants.length} plant{spacePlants.length === 1 ? '' : 's'}</Text>
    </TouchableOpacity>
  );
}

function NewSpaceCard({ onPress }: { onPress: () => void }) {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  return (
    <TouchableOpacity style={styles.newSpaceCard} onPress={onPress} activeOpacity={0.75}>
      <Ionicons name="add-circle-outline" size={26} color={Colors.primary} />
      <Text style={styles.newSpaceText}>New Space</Text>
    </TouchableOpacity>
  );
}

function EmptyGarden({ onAddFirst }: { onAddFirst: () => void }) {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
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
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const router = useRouter();
  const [plants, setPlants]             = useState<Plant[]>([]);
  const [spaces, setSpaces]             = useState<Space[]>([]);
  const [pendingTasks, setPendingTasks] = useState<CareTaskWithPlant[]>([]);
  const [totalXP, setTotalXP]           = useState(0);
  const [displayName, setDisplayName]   = useState('');
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [completingTask, setCompletingTask] = useState<string | null>(null);
  const [deletingPlant, setDeletingPlant]   = useState<string | null>(null);
  const [showCreateSpace, setShowCreateSpace] = useState(false);
  const hasLoaded = useRef(false);

  const fetchData = useCallback(async () => {
    setError(null);
    const today = todayISO();

    const [plantsRes, spacesRes, tasksRes, profileRes, userRes] = await Promise.all([
      supabase.from('plants').select('*').order('created_at', { ascending: true }),
      supabase.from('spaces').select('*').order('created_at', { ascending: true }),
      supabase
        .from('care_tasks')
        .select('*, plants(id, name)')
        .eq('task_type', 'watering')
        .lte('due_date', today)
        .is('completed_at', null)
        .order('due_date'),
      supabase.from('profiles').select('total_xp').maybeSingle(),
      supabase.auth.getUser(),
    ]);

    if (plantsRes.error) {
      setError(plantsRes.error.message);
    } else {
      setPlants(plantsRes.data ?? []);
    }
    setSpaces(spacesRes.data ?? []);
    setPendingTasks((tasksRes.data ?? []) as CareTaskWithPlant[]);
    setTotalXP(profileRes.data?.total_xp ?? 0);

    const authUser = userRes.data?.user;
    const resolvedName =
      (authUser?.user_metadata?.display_name as string | undefined)?.trim() ||
      (authUser?.email ? nameFromEmail(authUser.email) : '');
    setDisplayName(resolvedName);
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

      const result = data as { next_due_date: string; task_type: string; new_xp: number; xp_reward: number } | null;
      if (result?.next_due_date && task.plants?.name && result.task_type === 'watering') {
        cancelPlantNotifications(task.plant_id).catch(() => {});
        scheduleTaskNotification(
          task.plants.name,
          result.task_type,
          result.next_due_date,
          task.plant_id,
        ).catch(() => {});
      }

      // Journal entries (fire-and-forget)
      if (result && task.plants?.name) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const TASK_ENTRY: Record<string, string> = {
            watering: 'watered', fertilizing: 'fertilized', misting: 'misted',
          };
          const TASK_MSG: Record<string, string> = {
            watering:    `Watered ${task.plants.name} +${result.xp_reward} XP`,
            fertilizing: `Fertilized ${task.plants.name} +${result.xp_reward} XP`,
            misting:     `Misted ${task.plants.name} +${result.xp_reward} XP`,
          };
          const jRows: { plant_id: string; user_id: string; entry_type: string; message: string }[] = [
            {
              plant_id: task.plant_id, user_id: user.id,
              entry_type: TASK_ENTRY[result.task_type] ?? 'note',
              message: TASK_MSG[result.task_type] ?? `Cared for ${task.plants.name}`,
            },
          ];
          if (result.new_xp && getLevel(result.new_xp).name !== getLevel(totalXP).name) {
            jRows.push({
              plant_id: task.plant_id, user_id: user.id, entry_type: 'level_up',
              message: `${task.plants.name} reached ${getLevel(result.new_xp).name} — great work!`,
            });
          }
          supabase.from('journal_entries').insert(jRows).then(null, () => {});
        }
      }

      await fetchData();
    } catch (err) {
      const e = err as Record<string, unknown>;
      console.error('handleCompleteTask error:', {
        message: e?.message,
        code:    e?.code,
        details: e?.details,
        hint:    e?.hint,
      });
      const msg =
        typeof e?.message === 'string' && e.message
          ? e.message
          : JSON.stringify(err);
      Alert.alert('Could not complete task', msg);
    } finally {
      setCompletingTask(null);
    }
  }, [fetchData]);

  const handleDeletePlant = useCallback((plant: Plant) => {
    Alert.alert(
      `Delete ${plant.name}?`,
      "This can't be undone. All care tasks and photos will be removed.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingPlant(plant.id);
            try {
              // Fetch progress photo URLs before cascade-deleting them from DB
              const { data: photos } = await supabase
                .from('plant_photos')
                .select('photo_url')
                .eq('plant_id', plant.id);

              // Cancel any scheduled notifications for this plant
              cancelPlantNotifications(plant.id).catch(() => {});

              // Delete from DB (cascade removes care_tasks + plant_photos rows)
              const { error: delErr } = await supabase
                .from('plants')
                .delete()
                .eq('id', plant.id);
              if (delErr) throw delErr;

              // Clean up Storage objects (best-effort, non-fatal)
              const paths: string[] = [];
              if (plant.photo_url) {
                const p = extractStoragePath(plant.photo_url);
                if (p) paths.push(p);
              }
              for (const ph of photos ?? []) {
                const p = extractStoragePath(ph.photo_url);
                if (p) paths.push(p);
              }
              if (paths.length > 0) {
                supabase.storage.from('plant-images').remove(paths).catch(() => {});
              }

              await fetchData();
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete plant');
            } finally {
              setDeletingPlant(null);
            }
          },
        },
      ],
    );
  }, [fetchData]);

  const openAddPlant = useCallback(() => router.push('/add-plant'), [router]);

  const visibleMissions = pendingTasks.slice(0, 6);
  const extraMissions   = pendingTasks.length - visibleMissions.length;

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
            <View style={styles.greetingRow}>
              <Ionicons name={greetingIcon()} size={14} color={Colors.textSecondary} />
              <Text style={styles.greeting}>{greeting()}</Text>
            </View>
            <Text style={styles.title}>{displayName || 'there'}</Text>
          </View>
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
                <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
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

            {/* Spaces */}
            <Text style={[styles.sectionTitle, { marginTop: Spacing.lg }]}>Spaces</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.spacesRow}
            >
              {spaces.map(s => (
                <SpaceCard
                  key={s.id}
                  space={s}
                  plants={plants}
                  onPress={() => router.push(`/space/${s.id}`)}
                />
              ))}
              <NewSpaceCard onPress={() => setShowCreateSpace(true)} />
            </ScrollView>

            {/* Plants */}
            <Text style={[styles.sectionTitle, { marginTop: Spacing.lg }]}>Your Plants</Text>
            <Text style={styles.swipeHint}>Swipe left or long-press to delete</Text>
            {plants.map(p => (
              <SwipeablePlantCard
                key={p.id}
                plant={p}
                pendingTasks={pendingTasks}
                deleting={deletingPlant === p.id}
                onPress={() => router.push(`/plant/${p.id}`)}
                onDelete={() => handleDeletePlant(p)}
              />
            ))}
          </>
        )}
      </ScrollView>

      {/* Floating action button — always visible once plants exist */}
      {!loading && plants.length > 0 && (
        <TouchableOpacity style={styles.fab} onPress={openAddPlant} activeOpacity={0.85}>
          <Ionicons name="add" size={28} color={Colors.textPrimary} />
        </TouchableOpacity>
      )}

      <CreateSpaceModal
        visible={showCreateSpace}
        onClose={() => setShowCreateSpace(false)}
        onCreated={(space) => setSpaces(prev => [...prev, space])}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function getStyles(Colors: ColorPalette, FontSize: FontSizeScale) {
  return StyleSheet.create({
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
  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  greeting: { fontSize: FontSize.sm, color: Colors.textSecondary },
  title: { fontSize: FontSize.hero, fontWeight: '700', color: Colors.textPrimary },

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
  levelNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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
  swipeHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
    marginTop: -Spacing.xs,
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
  missionCardOverdue: { borderColor: Colors.danger, backgroundColor: 'rgba(231,76,60,0.04)' },
  missionIconWrap: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
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

  // Swipeable plant cards
  swipeRow: {
    marginBottom: Spacing.sm,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: Radius.lg,
  },
  deleteAction: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: DELETE_ACTION_WIDTH,
    backgroundColor: Colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.lg,
  },
  deleteActionText: { fontSize: FontSize.xs, fontWeight: '700', color: '#FFFFFF' },

  // Spaces
  spacesRow: { flexDirection: 'row', gap: Spacing.sm, paddingBottom: Spacing.sm },
  spaceCard: {
    width: 116,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  spaceThumbGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 96,
    height: 96,
    gap: 4,
  },
  spaceThumbTile: {
    width: 46,
    height: 46,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  spaceThumbImage: { width: '100%', height: '100%' },
  spaceName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  spaceCount: { fontSize: FontSize.xs, color: Colors.textMuted },
  newSpaceCard: {
    width: 116,
    minHeight: 148,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  newSpaceText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.primary, textAlign: 'center' },

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

  // Floating action button
  fab: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  });
}
