import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Dimensions,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Calendar from 'expo-calendar';
import { supabase } from '../../lib/supabase';
import { scheduleTaskNotification, cancelPlantNotifications } from '../../lib/notifications';
import { getLevel, xpToNextLevel } from '../../lib/levels';
import { getWateringLevel, getSunlightLevel, WATER_COLOR } from '../../lib/careLevels';
import type { Plant, CareTask, PlantPhoto, Space } from '../../types/database';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import ToxicitySeverityBar from '../../components/ToxicitySeverityBar';
import LevelBar from '../../components/LevelBar';
import CreateSpaceModal from '../../components/CreateSpaceModal';

const SCREEN_WIDTH = Dimensions.get('window').width;
const PHOTO_COL_SIZE = (SCREEN_WIDTH - Spacing.md * 2 - Spacing.sm * 2) / 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMood(health: number, Colors: ColorPalette): { icon: 'happy' | 'remove-circle-outline' | 'sad-outline'; color: string } {
  if (health >= 80) return { icon: 'happy',                 color: Colors.primary };
  if (health >= 50) return { icon: 'remove-circle-outline', color: Colors.warning };
  return               { icon: 'sad-outline',               color: Colors.danger  };
}

// AI visual health diagnosis (health_status) — separate from the mood/happiness
// bar above, which tracks watering-adherence, not visual condition.
type HealthDiagnosisStatus = 'healthy' | 'needs_attention' | 'critical';

function getHealthStatusConfig(Colors: ColorPalette): Record<HealthDiagnosisStatus, { label: string; icon: string; color: string; bg: string }> {
  return {
    healthy:         { label: 'Healthy',         icon: 'checkmark-circle', color: Colors.primary, bg: 'rgba(46,204,113,0.1)' },
    needs_attention: { label: 'Needs Attention',  icon: 'warning',          color: Colors.warning, bg: 'rgba(243,156,18,0.1)' },
    critical:        { label: 'Critical',         icon: 'alert-circle',     color: Colors.danger,  bg: 'rgba(231,76,60,0.1)' },
  };
}

function getWateringStatus(task: CareTask | null, Colors: ColorPalette): {
  text: string;
  color: string;
  urgent: boolean;
} {
  if (!task) return { text: 'No watering reminder set', color: Colors.textMuted, urgent: false };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${task.due_date}T00:00:00`);
  const diff = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) {
    const n = Math.abs(diff);
    return { text: `Overdue by ${n} day${n !== 1 ? 's' : ''} — water now!`, color: Colors.danger, urgent: true };
  }
  if (diff === 0) return { text: 'Water today!', color: Colors.warning, urgent: true };
  if (diff === 1) return { text: 'Water tomorrow', color: Colors.primary, urgent: false };
  return { text: `Water in ${diff} days`, color: Colors.primary, urgent: false };
}

function getWateringProgress(task: CareTask | null, Colors: ColorPalette): { pct: number; color: string } | null {
  if (!task) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due   = new Date(`${task.due_date}T00:00:00`);
  const start = new Date(due);
  start.setDate(start.getDate() - task.interval_days);
  const total   = due.getTime() - start.getTime();
  const elapsed = today.getTime() - start.getTime();
  const ratio   = total > 0 ? elapsed / total : 0;
  const color =
    ratio <= 0.6 ? Colors.primary :
    ratio <= 0.85 ? Colors.warning :
    ratio <= 1.0  ? Colors.serious :
    Colors.danger;
  return { pct: Math.min(ratio, 1) * 100, color };
}

const SUNLIGHT_LABELS: Record<string, string> = {
  low: 'Low Light',
  medium: 'Indirect Light',
  bright: 'Bright Direct',
};

const WATERING_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

const GROWING_LOCATION_LABELS: Record<string, string> = {
  indoor: 'Indoor',
  outdoor: 'Outdoor',
  both: 'Both',
};

const ICONS = {
  waterDrop:     require('../../assets/icons/water_drop.png'),
  sun:           require('../../assets/icons/sun.png'),
  seedling:      require('../../assets/icons/seedling.png'),
  thermometer:   require('../../assets/icons/thermometer.png'),
  ruler:         require('../../assets/icons/ruler.png'),
  cherryBlossom: require('../../assets/icons/cherry_blossom.png'),
  redApple:      require('../../assets/icons/red_apple.png'),
  house:         require('../../assets/icons/house.png'),
  warning:          require('../../assets/icons/warning.png'),
  catFace:          require('../../assets/icons/cat_face.png'),
} as const;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PlantDetailScreen() {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const params = useLocalSearchParams<{ id: string }>();
  const plantId = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();

  const [plant, setPlant]                 = useState<Plant | null>(null);
  const [wateringTask, setWateringTask]   = useState<CareTask | null>(null);
  const [progressPhotos, setProgressPhotos] = useState<PlantPhoto[]>([]);
  const [totalXP, setTotalXP]             = useState(0);
  const [spaces, setSpaces]               = useState<Space[]>([]);
  const [loading, setLoading]             = useState(true);
  const [markingWatered, setMarkingWatered] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [deleting, setDeleting]             = useState(false);
  const [addingToCalendar, setAddingToCalendar] = useState(false);
  const [showSpacePicker, setShowSpacePicker] = useState(false);
  const [showCreateSpace, setShowCreateSpace] = useState(false);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const hasLoaded = useRef(false);

  const fetchData = useCallback(async () => {
    if (!plantId) return;

    const [plantRes, taskRes, photosRes, profileRes, spacesRes] = await Promise.all([
      supabase.from('plants').select('*').eq('id', plantId).single(),
      supabase
        .from('care_tasks')
        .select('*')
        .eq('plant_id', plantId)
        .eq('task_type', 'watering')
        .is('completed_at', null)
        .order('due_date')
        .limit(1),
      supabase
        .from('plant_photos')
        .select('*')
        .eq('plant_id', plantId)
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('total_xp').maybeSingle(),
      supabase.from('spaces').select('*').order('created_at', { ascending: true }),
    ]);

    if (plantRes.data)  setPlant(plantRes.data);
    setWateringTask(taskRes.data?.[0] ?? null);
    setProgressPhotos((photosRes.data ?? []) as PlantPhoto[]);
    setTotalXP(profileRes.data?.total_xp ?? 0);
    setSpaces(spacesRes.data ?? []);
  }, [plantId]);

  useFocusEffect(
    useCallback(() => {
      if (!hasLoaded.current) setLoading(true);
      fetchData().finally(() => {
        setLoading(false);
        hasLoaded.current = true;
      });
    }, [fetchData]),
  );

  // ── Delete plant ─────────────────────────────────────────────────────────────
  const handleDeletePlant = useCallback(() => {
    if (!plant) return;
    Alert.alert(
      `Delete ${plant.name}?`,
      "This can't be undone. All care tasks and photos will be removed.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              cancelPlantNotifications(plantId).catch(() => {});

              // Collect Storage paths before cascade-delete removes DB rows
              const paths: string[] = [];
              if (plant.photo_url) {
                const marker = '/plant-images/';
                const idx = plant.photo_url.indexOf(marker);
                if (idx !== -1) paths.push(plant.photo_url.slice(idx + marker.length));
              }
              for (const ph of progressPhotos) {
                const marker = '/plant-images/';
                const idx = ph.photo_url.indexOf(marker);
                if (idx !== -1) paths.push(ph.photo_url.slice(idx + marker.length));
              }

              const { error: delErr } = await supabase
                .from('plants')
                .delete()
                .eq('id', plantId);
              if (delErr) throw delErr;

              if (paths.length > 0) {
                supabase.storage.from('plant-images').remove(paths).catch(() => {});
              }

              router.replace('/(tabs)');
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete plant');
              setDeleting(false);
            }
          },
        },
      ],
    );
  }, [plant, plantId, progressPhotos, router]);

  // ── Assign Space ──────────────────────────────────────────────────────────────
  const handleAssignSpace = useCallback(async (spaceId: string | null) => {
    if (!plant) return;
    try {
      const { error } = await supabase.from('plants').update({ space_id: spaceId }).eq('id', plant.id);
      if (error) throw error;
      setPlant(prev => (prev ? { ...prev, space_id: spaceId } : prev));
      setShowSpacePicker(false);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update Space');
    }
  }, [plant]);

  // ── Re-check health ──────────────────────────────────────────────────────────
  // Sends a fresh photo to detect-plant and updates only this plant's health
  // diagnosis fields — never creates a new plant row or touches happiness/
  // watering-adherence (health_percent) or the existing health_issues/
  // health_remedies arrays from the initial scan.
  const handleRecheckHealth = useCallback(async (uri: string) => {
    if (!plant) return;
    setCheckingHealth(true);
    try {
      const compressed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );

      const { data, error } = await supabase.functions.invoke('detect-plant', {
        body: { image: compressed.base64!, mediaType: 'image/jpeg' },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const result = data as {
        health_status: 'healthy' | 'needs_attention' | 'critical';
        health_diagnosis_issues: string | null;
        health_recommendation: string | null;
      };
      const checkedAt = new Date().toISOString();

      const { error: updateErr } = await supabase
        .from('plants')
        .update({
          health_status: result.health_status,
          health_diagnosis_issues: result.health_diagnosis_issues,
          health_recommendation: result.health_recommendation,
          health_checked_at: checkedAt,
        })
        .eq('id', plant.id);
      if (updateErr) throw updateErr;

      setPlant(prev => (prev ? {
        ...prev,
        health_status: result.health_status,
        health_diagnosis_issues: result.health_diagnosis_issues,
        health_recommendation: result.health_recommendation,
        health_checked_at: checkedAt,
      } : prev));
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to check health');
    } finally {
      setCheckingHealth(false);
    }
  }, [plant]);

  const handleRecheckPress = useCallback(() => {
    Alert.alert(
      'Re-check Health',
      "Take or choose a new photo of this plant for a fresh health assessment.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Take Photo',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission needed', 'Camera access is required.');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({ quality: 1.0 });
            if (result.canceled || !result.assets?.[0]) return;
            handleRecheckHealth(result.assets[0].uri);
          },
        },
        {
          text: 'Choose from Library',
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission needed', 'Photo library access is required.');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1.0 });
            if (result.canceled || !result.assets?.[0]) return;
            handleRecheckHealth(result.assets[0].uri);
          },
        },
      ],
    );
  }, [handleRecheckHealth]);

  // ── Mark as watered ──────────────────────────────────────────────────────────
  const handleMarkWatered = useCallback(async () => {
    if (!wateringTask) return;
    setMarkingWatered(true);
    try {
      const { data, error } = await supabase.rpc('complete_care_task', { task_id: wateringTask.id });
      if (error) throw error;

      const result = data as { next_due_date: string; new_xp: number; xp_reward: number } | null;
      if (result?.next_due_date && plant?.name) {
        scheduleTaskNotification(plant.name, 'watering', result.next_due_date, plantId).catch(() => {});
      }

      // Journal entries (fire-and-forget)
      if (plant) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const xp = result?.xp_reward ?? 10;
          const jRows: { plant_id: string; user_id: string; entry_type: string; message: string }[] = [
            { plant_id: plantId, user_id: user.id, entry_type: 'watered', message: `Watered ${plant.name} +${xp} XP` },
          ];
          if (result?.new_xp && getLevel(result.new_xp).name !== getLevel(totalXP).name) {
            jRows.push({
              plant_id: plantId, user_id: user.id, entry_type: 'level_up',
              message: `${plant.name} reached ${getLevel(result.new_xp).name} — great work!`,
            });
          }
          supabase.from('journal_entries').insert(jRows).then(null, () => {});
        }
      }

      await fetchData();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update watering');
    } finally {
      setMarkingWatered(false);
    }
  }, [wateringTask, plant, fetchData]);

  // ── Add progress photo ───────────────────────────────────────────────────────
  const handleAddProgressPhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1.0 });
    if (picked.canceled || !picked.assets?.[0]) return;

    setUploadingPhoto(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const compressed = await ImageManipulator.manipulateAsync(
        picked.assets[0].uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );

      const bytes = Uint8Array.from(atob(compressed.base64!), c => c.charCodeAt(0));
      const storagePath = `${user.id}/progress/${plantId}/${Date.now()}.jpg`;

      const { data: up, error: upErr } = await supabase.storage
        .from('plant-images')
        .upload(storagePath, bytes, { contentType: 'image/jpeg', upsert: false });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from('plant-images').getPublicUrl(up.path);

      const { error: insertErr } = await supabase.from('plant_photos').insert({
        plant_id: plantId,
        user_id: user.id,
        photo_url: urlData.publicUrl,
      });
      if (insertErr) throw insertErr;

      await fetchData();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to upload photo');
    } finally {
      setUploadingPhoto(false);
    }
  }, [plantId, fetchData]);

  // ── Add to native calendar ───────────────────────────────────────────────────
  const handleAddToCalendar = useCallback(async () => {
    if (!plant || !wateringTask) return;
    setAddingToCalendar(true);
    try {
      const permission = await Calendar.requestCalendarPermissions();
      if (!permission.granted) {
        Alert.alert(
          'Calendar access needed',
          'Enable calendar access for Plant Park in your device Settings to add watering reminders.',
        );
        return;
      }

      const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
      let targetCalendar = calendars.find(c => c.allowsModifications);

      if (!targetCalendar) {
        if (Platform.OS === 'ios') {
          const defaultCalendar = Calendar.getDefaultCalendarSync();
          targetCalendar = await Calendar.createCalendar({
            title: 'Plant Park',
            color: '#2ECC71',
            entityType: Calendar.EntityTypes.EVENT,
            sourceId: defaultCalendar.sourceId,
            name: 'Plant Park',
            ownerAccount: 'Plant Park',
            accessLevel: Calendar.CalendarAccessLevel.OWNER,
          });
        } else {
          targetCalendar = await Calendar.createCalendar({
            title: 'Plant Park',
            color: '#2ECC71',
            entityType: Calendar.EntityTypes.EVENT,
            source: { isLocalAccount: true, name: 'Plant Park', type: Calendar.SourceType.LOCAL },
            name: 'Plant Park',
            ownerAccount: 'Plant Park',
            accessLevel: Calendar.CalendarAccessLevel.OWNER,
          });
        }
      }

      const [year, month, day] = wateringTask.due_date.split('-').map(Number);
      const startDate = new Date(year, month - 1, day, 9, 0, 0);
      const endDate = new Date(year, month - 1, day, 9, 30, 0);

      const event = await targetCalendar.createEvent({
        title: `Water ${plant.name}`,
        startDate,
        endDate,
        recurrenceRule: {
          frequency: Calendar.Frequency.DAILY,
          interval: wateringTask.interval_days,
        },
        alarms: [{ relativeOffset: 0 }],
      });

      const { error: updateErr } = await supabase
        .from('plants')
        .update({ calendar_event_id: event.id })
        .eq('id', plantId);
      if (updateErr) throw updateErr;

      setPlant(prev => (prev ? { ...prev, calendar_event_id: event.id } : prev));
      Alert.alert('Added to your calendar', `A recurring watering reminder for ${plant.name} has been added.`);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to add calendar reminder.');
    } finally {
      setAddingToCalendar(false);
    }
  }, [plant, wateringTask, plantId]);

  // ── Loading / not found ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!plant) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.notFoundText}>Plant not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>← Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Derived state ────────────────────────────────────────────────────────────
  const level = getLevel(totalXP);
  const { pct: xpPct, needed: xpNeeded } = xpToNextLevel(totalXP);
  const { icon: moodIcon, color: moodColor } = getMood(plant.health_percent, Colors);
  const watering         = getWateringStatus(wateringTask, Colors);
  const wateringProgress = getWateringProgress(wateringTask, Colors);

  const wateringLevel = getWateringLevel(wateringTask?.interval_days, plant.watering_frequency);
  const sunlightLevel = getSunlightLevel(plant.sunlight);
  const currentSpaceName = plant.space_id
    ? (spaces.find(s => s.id === plant.space_id)?.name ?? 'Unknown Space')
    : 'No Space';
  const healthStatusConfig = plant.health_status
    ? getHealthStatusConfig(Colors)[plant.health_status]
    : { label: 'Not Checked Yet', icon: 'help-circle-outline', color: Colors.textMuted, bg: Colors.surfaceElevated };

  const infoItems = [
    { icon: ICONS.waterDrop,   label: 'Watering',     value: plant.watering_frequency ? WATERING_LABELS[plant.watering_frequency] : '—', level: wateringLevel, barColor: WATER_COLOR },
    { icon: ICONS.sun,         label: 'Sunlight',     value: plant.sunlight ? SUNLIGHT_LABELS[plant.sunlight] : '—', level: sunlightLevel, barColor: Colors.xp },
    { icon: ICONS.seedling,    label: 'Soil',         value: plant.soil_type ?? '—', level: undefined as number | undefined, barColor: undefined as string | undefined },
    { icon: ICONS.thermometer, label: 'Temperature',  value: plant.temperature_range ?? '—', level: undefined as number | undefined, barColor: undefined as string | undefined },
  ] as const;

  const detailItems = [
    { icon: ICONS.ruler,         label: 'Max Height',       value: plant.max_height ?? '—',                                              muted: false },
    { icon: ICONS.cherryBlossom, label: 'Flowering Season', value: plant.flowering_season === 'N/A' ? 'Not applicable' : (plant.flowering_season ?? '—'), muted: plant.flowering_season === 'N/A' },
    { icon: ICONS.redApple,      label: 'Fruiting Season', value: plant.fruiting_season === 'N/A' ? 'Not applicable' : (plant.fruiting_season ?? '—'),   muted: plant.fruiting_season === 'N/A' },
    { icon: ICONS.house,         label: 'Suitability',      value: plant.growing_location ? (GROWING_LOCATION_LABELS[plant.growing_location] ?? plant.growing_location) : '—', muted: false },
  ] as const;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero ── */}
        <View style={styles.hero}>
          {plant.photo_url ? (
            <Image source={{ uri: plant.photo_url }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]}>
              <Ionicons name="leaf-outline" size={80} color={Colors.primary} style={{ opacity: 0.45 }} />
            </View>
          )}
          {/* Dark gradient overlay at bottom of hero */}
          <View style={styles.heroGradient} />
          {/* Back button */}
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          {/* Delete button */}
          <TouchableOpacity
            style={[styles.trashBtn, deleting && styles.disabled]}
            onPress={handleDeletePlant}
            disabled={deleting}
          >
            {deleting ? (
              <ActivityIndicator size="small" color={Colors.danger} />
            ) : (
              <Ionicons name="trash-outline" size={20} color={Colors.danger} />
            )}
          </TouchableOpacity>
          {/* Name / species over photo */}
          <View style={styles.heroMeta}>
            <Text style={styles.heroName}>{plant.name}</Text>
            {plant.species ? <Text style={styles.heroSpecies}>{plant.species}</Text> : null}
          </View>
        </View>

        {/* ── Stats card (floats over hero bottom) ── */}
        <View style={styles.statsCard}>
          <View style={styles.statsRow}>
            <View style={styles.levelChip}>
              <Ionicons name="leaf" size={11} color={Colors.textPrimary} />
              <Text style={styles.levelChipText}>{level.name}</Text>
            </View>
            <Text style={styles.xpLabel}>{totalXP.toLocaleString()} XP</Text>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, styles.xpFill, { width: `${xpPct}%` }]} />
          </View>
          {xpNeeded > 0 && (
            <Text style={styles.xpNext}>{xpNeeded} XP to next level</Text>
          )}

          <View style={[styles.statsRow, { marginTop: Spacing.sm }]}>
            <View style={styles.healthLabelRow}>
              <Ionicons name={moodIcon} size={13} color={moodColor} />
              <Text style={styles.healthLabel}>Health</Text>
            </View>
            <Text style={[styles.healthPct, { color: moodColor }]}>{plant.health_percent}%</Text>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${plant.health_percent}%`, backgroundColor: moodColor }]} />
          </View>
        </View>

        {/* ── Critical health alert ── */}
        {plant.health_status === 'critical' && (
          <View style={styles.criticalBanner}>
            <Ionicons name="alert-circle" size={24} color="#FFFFFF" />
            <View style={styles.criticalBannerTextWrap}>
              <Text style={styles.criticalBannerTitle}>Critical Health Alert</Text>
              {plant.health_diagnosis_issues ? (
                <Text style={styles.criticalBannerText}>{plant.health_diagnosis_issues}</Text>
              ) : null}
              {plant.health_recommendation ? (
                <Text style={styles.criticalBannerText}>{plant.health_recommendation}</Text>
              ) : null}
            </View>
          </View>
        )}

        {/* ── Space ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Space</Text>
          <TouchableOpacity
            style={styles.spaceRow}
            onPress={() => setShowSpacePicker(true)}
            activeOpacity={0.75}
          >
            <Ionicons name="location-outline" size={20} color={Colors.primary} />
            <Text style={styles.spaceRowText}>{currentSpaceName}</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ── Next watering ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Next Watering</Text>
          <View style={[styles.waterCard, watering.urgent && styles.waterCardUrgent]}>
            <Ionicons name="water" size={36} color={watering.color} style={{ marginBottom: 4 }} />
            <Text style={[styles.waterText, { color: watering.color }]}>{watering.text}</Text>
            {wateringProgress !== null && (
              <View style={styles.waterProgressTrack}>
                <View
                  style={[
                    styles.waterProgressFill,
                    {
                      width:           `${wateringProgress.pct}%` as any,
                      backgroundColor: wateringProgress.color,
                    },
                  ]}
                />
              </View>
            )}
            {wateringTask ? (
              watering.urgent ? (
                <TouchableOpacity
                  style={[styles.wateredBtn, markingWatered && styles.disabled]}
                  onPress={handleMarkWatered}
                  disabled={markingWatered}
                >
                  {markingWatered ? (
                    <ActivityIndicator size="small" color={Colors.textPrimary} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color={Colors.textPrimary} />
                      <Text style={styles.wateredBtnText}>Mark as Watered  +10 XP</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <View style={styles.wateredBtnLocked}>
                  <Ionicons name="lock-closed-outline" size={15} color={Colors.textMuted} />
                  <Text style={styles.wateredBtnLockedText}>Available when due</Text>
                </View>
              )
            ) : (
              <Text style={styles.noTaskHint}>
                Add this plant via the new flow to auto-create watering reminders.
              </Text>
            )}

            {wateringTask ? (
              plant.calendar_event_id ? (
                <View style={styles.calendarAddedRow}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                  <Text style={styles.calendarAddedText}>Reminder added ✓</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.calendarBtn, addingToCalendar && styles.disabled]}
                  onPress={handleAddToCalendar}
                  disabled={addingToCalendar}
                >
                  {addingToCalendar ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <>
                      <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
                      <Text style={styles.calendarBtnText}>Add to Calendar</Text>
                    </>
                  )}
                </TouchableOpacity>
              )
            ) : null}
          </View>
        </View>

        {/* ── Toxicity ── */}
        {plant.toxic_to_humans !== null && plant.toxic_to_pets !== null && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Toxicity</Text>
            <View style={styles.toxicityRow}>
              <ToxicitySeverityBar label="Humans" icon={ICONS.warning} severity={plant.human_toxicity_severity ?? 0} />
              <ToxicitySeverityBar label="Pets" icon={ICONS.catFace} severity={plant.pet_toxicity_severity ?? 0} />
            </View>
            {plant.toxicity_note && (
              <Text style={styles.toxicityNote}>{plant.toxicity_note}</Text>
            )}
          </View>
        )}

        {/* ── Plant details ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Plant Details</Text>
          <View style={styles.infoGrid}>
            {detailItems.map(({ icon, label, value, muted }) => (
              <View key={label} style={styles.infoItem}>
                <Image source={icon} style={styles.infoIcon} resizeMode="contain" />
                <Text style={styles.infoLabel}>{label}</Text>
                <Text style={[styles.infoValue, muted && styles.infoValueMuted]} numberOfLines={2}>{value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Care requirements ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Care Requirements</Text>
          <View style={styles.infoGrid}>
            {infoItems.map(({ icon, label, value, level, barColor }) => (
              <View key={label} style={styles.infoItem}>
                <Image source={icon} style={styles.infoIcon} resizeMode="contain" />
                <Text style={styles.infoLabel}>{label}</Text>
                <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
                {level !== undefined && barColor !== undefined && (
                  <LevelBar level={level} color={barColor} />
                )}
              </View>
            ))}
          </View>
        </View>

        {/* ── AI care tip ── */}
        {plant.care_tip ? (
          <View style={styles.section}>
            <View style={styles.tipBox}>
              <Text style={styles.tipBoxLabel}>AI Care Tip</Text>
              <Text style={styles.tipBoxText}>{plant.care_tip}</Text>
            </View>
          </View>
        ) : null}

        {/* ── Health Check (AI visual diagnosis — separate from happiness %) ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Health Check</Text>
          <View style={[styles.healthCheckCard, { borderColor: healthStatusConfig.color, backgroundColor: healthStatusConfig.bg }]}>
            <View style={styles.healthCheckHeader}>
              <Ionicons name={healthStatusConfig.icon as any} size={22} color={healthStatusConfig.color} />
              <Text style={[styles.healthCheckStatusLabel, { color: healthStatusConfig.color }]}>
                {healthStatusConfig.label}
              </Text>
            </View>

            {plant.health_diagnosis_issues ? (
              <Text style={styles.healthCheckText}>{plant.health_diagnosis_issues}</Text>
            ) : null}

            {plant.health_recommendation ? (
              <View style={styles.healthCheckRecommendationBox}>
                <Text style={styles.healthCheckRecommendationLabel}>Recommendation</Text>
                <Text style={styles.healthCheckText}>{plant.health_recommendation}</Text>
              </View>
            ) : null}

            <Text style={styles.healthCheckDate}>
              {plant.health_checked_at
                ? `Last checked: ${new Date(plant.health_checked_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                : 'Not checked yet'}
            </Text>

            <TouchableOpacity
              style={[styles.recheckBtn, checkingHealth && styles.disabled]}
              onPress={handleRecheckPress}
              disabled={checkingHealth}
            >
              {checkingHealth ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={18} color={Colors.primary} />
                  <Text style={styles.recheckBtnText}>Re-check Health</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Health tips & troubleshooting ── */}
        {plant.health_remedies && plant.health_remedies.length > 0 ? (() => {
          const hasIssues = (plant.health_issues?.length ?? 0) > 0;
          const hasProTips = (plant.health_tips_pro?.length ?? 0) > 0;
          return (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Health Tips & Troubleshooting</Text>
              <View style={[styles.healthCard, hasIssues && styles.healthCardWarning]}>
                <View style={styles.healthCardHeader}>
                  <Ionicons
                    name={hasIssues ? 'warning' : 'shield-checkmark'}
                    size={26}
                    color={hasIssues ? Colors.warning : Colors.primary}
                    style={{ marginTop: 2 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.healthCardTitle, hasIssues && styles.healthCardTitleWarning]}>
                      {hasIssues ? 'Issues Detected' : 'Looking Healthy!'}
                    </Text>
                    <Text style={styles.healthCardSubtitle}>
                      {hasIssues ? 'Try these home remedies' : 'Prevention tips to keep it thriving'}
                    </Text>
                  </View>
                </View>

                {hasIssues && (
                  <View style={styles.issueChips}>
                    {plant.health_issues!.map((issue, i) => (
                      <View key={i} style={styles.issueChip}>
                        <Text style={styles.issueChipText}>{issue}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <Text style={styles.subLabel}>🏠 Home Remedies</Text>
                <View style={styles.remediesList}>
                  {plant.health_remedies!.map((remedy, i) => (
                    <View key={i} style={[styles.remedyRow, hasIssues && styles.remedyRowWarning]}>
                      <View style={[styles.remedyBadge, hasIssues && styles.remedyBadgeWarning]}>
                        <Text style={styles.remedyBadgeText}>{i + 1}</Text>
                      </View>
                      <Text style={styles.remedyText}>{remedy.replace(/️/g, '')}</Text>
                    </View>
                  ))}
                </View>

                {hasProTips && (
                  <View style={styles.proTipsSection}>
                    <Text style={styles.subLabel}>🔬 Pro Tips</Text>
                    <View style={styles.remediesList}>
                      {plant.health_tips_pro!.map((tip, i) => (
                        <View key={i} style={styles.remedyRow}>
                          <View style={styles.remedyBadgePro}>
                            <Text style={styles.remedyBadgeText}>{i + 1}</Text>
                          </View>
                          <Text style={styles.remedyText}>{tip.replace(/️/g, '')}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            </View>
          );
        })() : null}

        {/* ── Growth timeline ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Growth Timeline</Text>
          {progressPhotos.length > 0 ? (
            <View style={styles.photoGrid}>
              {progressPhotos.map(photo => (
                <View key={photo.id} style={styles.photoCell}>
                  <Image
                    source={{ uri: photo.photo_url }}
                    style={styles.photoCellImg}
                    resizeMode="cover"
                  />
                  <Text style={styles.photoCellDate}>
                    {new Date(photo.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.noPhotosText}>
              No progress photos yet — add one to start your growth timeline.
            </Text>
          )}

          <TouchableOpacity
            style={[styles.addPhotoBtn, uploadingPhoto && styles.disabled]}
            onPress={handleAddProgressPhoto}
            disabled={uploadingPhoto}
          >
            {uploadingPhoto ? (
              <>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.addPhotoBtnText}>Uploading...</Text>
              </>
            ) : (
              <>
                <Ionicons name="camera-outline" size={20} color={Colors.primary} />
                <Text style={styles.addPhotoBtnText}>Add Progress Photo</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

      </ScrollView>

      <Modal
        visible={showSpacePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSpacePicker(false)}
      >
        <View style={styles.backdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowSpacePicker(false)}
          />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Which Space?</Text>
            <View style={styles.spaceChipsRow}>
              <TouchableOpacity
                style={[styles.spaceChip, !plant.space_id && styles.spaceChipSelected]}
                onPress={() => handleAssignSpace(null)}
                activeOpacity={0.75}
              >
                <Text style={[styles.spaceChipText, !plant.space_id && styles.spaceChipTextSelected]}>
                  No Space
                </Text>
              </TouchableOpacity>
              {spaces.map((s) => {
                const selected = plant.space_id === s.id;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.spaceChip, selected && styles.spaceChipSelected]}
                    onPress={() => handleAssignSpace(s.id)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.spaceChipText, selected && styles.spaceChipTextSelected]} numberOfLines={1}>
                      {s.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={styles.spaceChipNew}
                onPress={() => setShowCreateSpace(true)}
                activeOpacity={0.75}
              >
                <Ionicons name="add" size={16} color={Colors.primary} />
                <Text style={styles.spaceChipNewText}>New Space</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CreateSpaceModal
        visible={showCreateSpace}
        onClose={() => setShowCreateSpace(false)}
        onCreated={(space) => {
          setSpaces(prev => [...prev, space]);
          handleAssignSpace(space.id);
        }}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function getStyles(Colors: ColorPalette, FontSize: FontSizeScale) {
  return StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
  scroll:  { paddingBottom: Spacing.xxl },
  notFoundText: { fontSize: FontSize.lg, color: Colors.textPrimary },
  backLink:     { marginTop: Spacing.md },
  backLinkText: { fontSize: FontSize.sm, color: Colors.primary },

  // Hero
  hero: { height: 280, position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  heroPlaceholder: {
    backgroundColor: Colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroGradient: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 130,
    backgroundColor: 'rgba(13,40,24,0.72)',
  },
  backBtn: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trashBtn: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(231,76,60,0.4)',
  },
  heroMeta: {
    position: 'absolute',
    bottom: Spacing.md,
    left: Spacing.md,
    right: Spacing.md,
  },
  heroName: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  heroSpecies: {
    fontSize: FontSize.sm,
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.82)',
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // Stats card
  statsCard: {
    marginHorizontal: Spacing.md,
    marginTop: -Spacing.xl,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  levelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.primaryDark,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  levelChipText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary },
  xpLabel:  { fontSize: FontSize.sm, fontWeight: '600', color: Colors.xp },
  xpNext:   { fontSize: FontSize.xs, color: Colors.textMuted },
  healthLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  barTrack: {
    height: 6,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: Radius.full },
  xpFill:  { backgroundColor: Colors.xp },
  healthLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  healthPct:   { fontSize: FontSize.xs, fontWeight: '700' },

  // Sections
  section: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },

  // Space
  spaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  spaceRowText: { flex: 1, fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },

  // Space picker modal
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: Spacing.xs,
  },
  sheetTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  spaceChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  spaceChip: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  spaceChipSelected: { backgroundColor: 'rgba(46,204,113,0.15)', borderColor: Colors.primary },
  spaceChipText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  spaceChipTextSelected: { color: Colors.primary },
  spaceChipNew: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
  },
  spaceChipNewText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.primary },

  // Info grid
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: Spacing.sm },
  infoItem: {
    width: '47%',
    minHeight: 104,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoIcon: { width: 20, height: 20 },
  infoLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 4,
  },
  infoValue: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: '600' },
  infoValueMuted: { color: Colors.textMuted },

  // Toxicity
  toxicityRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  toxicityNote: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, marginTop: Spacing.sm },

  // Care tip
  tipBox: {
    backgroundColor: 'rgba(46,204,113,0.1)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    padding: Spacing.md,
    gap: 6,
  },
  tipBoxLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  tipBoxText: { fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 20 },

  // Critical health alert banner
  criticalBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    backgroundColor: Colors.danger,
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  criticalBannerTextWrap: { flex: 1, gap: 2 },
  criticalBannerTitle: { fontSize: FontSize.md, fontWeight: '700', color: '#FFFFFF' },
  criticalBannerText: { fontSize: FontSize.sm, color: '#FFFFFF', lineHeight: 19 },

  // Health Check (AI visual diagnosis — separate from happiness % and from
  // the existing Health Tips & Troubleshooting card below)
  healthCheckCard: {
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  healthCheckHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  healthCheckStatusLabel: { fontSize: FontSize.md, fontWeight: '700' },
  healthCheckText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  healthCheckRecommendationBox: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    gap: 4,
  },
  healthCheckRecommendationLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  healthCheckDate: { fontSize: FontSize.xs, color: Colors.textMuted },
  recheckBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 10,
    backgroundColor: 'rgba(46,204,113,0.06)',
    marginTop: Spacing.xs,
  },
  recheckBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },

  // Health tips & troubleshooting
  healthCard: {
    backgroundColor: 'rgba(46,204,113,0.07)',
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  healthCardWarning: {
    backgroundColor: 'rgba(243,156,18,0.08)',
    borderColor: Colors.warning,
  },
  healthCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  healthCardTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.primary,
  },
  healthCardTitleWarning: { color: Colors.warning },
  healthCardSubtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  issueChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  issueChip: {
    backgroundColor: 'rgba(243,156,18,0.15)',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.warning,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  issueChipText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.warning },
  remediesList: { gap: Spacing.sm },
  remedyRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(46,204,113,0.07)',
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  remedyRowWarning: { backgroundColor: 'rgba(243,156,18,0.07)' },
  remedyBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  remedyBadgeWarning: { backgroundColor: Colors.warning },
  remedyBadgePro: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.rare,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  remedyBadgeText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.background },
  remedyText: { flex: 1, fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary, lineHeight: 20 },
  subLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted, marginTop: Spacing.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  proTipsSection: { gap: Spacing.sm, marginTop: 2 },

  // Watering
  waterCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  waterCardUrgent: {
    borderColor: Colors.warning,
    backgroundColor: 'rgba(243,156,18,0.07)',
  },
  waterText:  { fontSize: FontSize.lg, fontWeight: '700', textAlign: 'center' },
  waterProgressTrack: {
    width: '100%',
    height: 7,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    overflow: 'hidden',
    marginTop: Spacing.sm,
  },
  waterProgressFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  wateredBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 12,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    width: '100%',
  },
  wateredBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary },
  wateredBtnLocked: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    paddingVertical: 12,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  wateredBtnLockedText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textMuted },
  noTaskHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: Spacing.xs,
  },
  disabled: { opacity: 0.6 },

  calendarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 12,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    width: '100%',
    backgroundColor: 'rgba(46,204,113,0.06)',
  },
  calendarBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },
  calendarAddedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    paddingVertical: 12,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  calendarAddedText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textMuted },

  // Progress photos
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  photoCell: { width: PHOTO_COL_SIZE, gap: 4 },
  photoCellImg: {
    width: PHOTO_COL_SIZE,
    height: PHOTO_COL_SIZE,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceElevated,
  },
  photoCellDate: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center' },
  noPhotosText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  addPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    backgroundColor: 'rgba(46,204,113,0.06)',
  },
  addPhotoBtnText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.primary },
  });
}
