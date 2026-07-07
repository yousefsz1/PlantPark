import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useRouter, useIsFocused } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { requestNotificationPermission, scheduleTaskNotification, cancelPlantNotifications } from '../../lib/notifications';
import { getScanStatus, incrementScanCount } from '../../lib/scanLimits';
import { getWateringLevel, getSunlightLevel, WATER_COLOR } from '../../lib/careLevels';
import type { Space } from '../../types/database';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import ToxicitySeverityBar from '../../components/ToxicitySeverityBar';
import LevelBar from '../../components/LevelBar';
import CreateSpaceModal from '../../components/CreateSpaceModal';

type HealthStatus = 'healthy' | 'mild' | 'serious' | 'critical';

interface ScanResult {
  name: string;
  species: string;
  status: HealthStatus;
  // Care data from detect-plant
  wateringFrequency: 'daily' | 'weekly' | 'monthly';
  wateringDays: number;
  sunlight: 'low' | 'medium' | 'bright';
  soilType: string;
  temperature: string;
  careTip: string;
  fertilizingDays: number;
  mistingDays: number | null;
  toxicToHumans: boolean;
  toxicToPets: boolean;
  humanToxicitySeverity: number;
  petToxicitySeverity: number;
  toxicityNote: string | null;
  // Health diagnosis
  isHealthy: boolean;
  healthScore: number;
  healthIssues: string[];
  homeTips: string[];
  proTips: string[];
  // Plant characteristics
  maxHeight: string;
  floweringSeason: string;
  fruitingSeason: string;
  growingLocation: 'indoor' | 'outdoor' | 'both';
  // AI visual health diagnosis (separate from status/healthScore above)
  healthDiagnosisStatus: 'healthy' | 'needs_attention' | 'critical';
  healthDiagnosisIssues: string | null;
  healthRecommendation: string | null;
}

type Phase = 'camera' | 'analyzing' | 'result' | 'grass';

function getStatusConfig(Colors: ColorPalette): Record<HealthStatus, { label: string; color: string; bg: string }> {
  return {
    healthy:  { label: 'Healthy',  color: Colors.primary, bg: '#0B2A14' },
    mild:     { label: 'Mild',     color: Colors.warning, bg: '#2E1E00' },
    serious:  { label: 'Serious',  color: Colors.serious, bg: '#2E1200' },
    critical: { label: 'Critical', color: Colors.danger,  bg: '#2E0808' },
  };
}

const SUNLIGHT_LABELS: Record<string, string> = {
  low: 'Low Light',
  medium: 'Indirect Light',
  bright: 'Bright Direct',
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

const HEALTH_MAP: Record<HealthStatus, number> = {
  healthy: 100,
  mild: 70,
  serious: 40,
  critical: 15,
};

function addDaysToToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ScanScreen() {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const [permission, requestPermission] = useCameraPermissions();
  const isFocused = useIsFocused();
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);

  const [phase, setPhase]               = useState<Phase>('camera');
  const [photoUri, setPhotoUri]         = useState<string | null>(null);
  const [photoBase64, setPhotoBase64]   = useState<string | null>(null);
  const [result, setResult]             = useState<ScanResult | null>(null);
  const [grassName, setGrassName]       = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [xpTotal, setXpTotal]           = useState<number | null>(null);
  const [saved, setSaved]               = useState(false);
  const [saving, setSaving]             = useState(false);
  const [favourited, setFavourited]     = useState(false);
  const [favouriting, setFavouriting]   = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [spaces, setSpaces]             = useState<Space[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [showCreateSpace, setShowCreateSpace] = useState(false);

  useEffect(() => {
    supabase.from('spaces').select('*').order('created_at', { ascending: true }).then(({ data }) => {
      setSpaces(data ?? []);
    });
  }, []);

  const runAnalysis = useCallback(async (uri: string) => {
    const scanStatus = await getScanStatus();
    if (scanStatus?.hasScansRemaining === false) {
      Alert.alert(
        'Scan limit reached',
        `You've reached your ${scanStatus.tier} plan's limit of ${scanStatus.limit} scans this month.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'View Plans', onPress: () => router.push('/membership') },
        ],
      );
      return;
    }

    setPhotoUri(uri);
    setPhase('analyzing');
    setAnalyzeError(null);
    setResult(null);
    setSaved(false);
    setXpTotal(null);
    setPhotoBase64(null);

    try {
      // Compress to 1024px / 80% JPEG — same as add-plant flow
      const compressed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      const base64 = compressed.base64!;
      setPhotoBase64(base64);

      const { data, error } = await supabase.functions.invoke('detect-plant', {
        body: { image: base64, mediaType: 'image/jpeg' },
      });
      if (error) throw new Error(error.message ?? 'Edge function error');
      if (!data || typeof data !== 'object') throw new Error('Invalid response from analysis service');
      if ('error' in data) throw new Error((data as { error: string }).error);

      const d = data as {
        name: string; species: string; is_grass: boolean;
        wateringFrequency: 'daily' | 'weekly' | 'monthly'; wateringDays: number;
        sunlight: 'low' | 'medium' | 'bright'; soilType: string;
        temperature: string; careTip: string;
        fertilizingDays: number; mistingDays: number | null;
        toxicToHumans: boolean; toxicToPets: boolean; toxicityNote: string | null;
        human_toxicity_severity: number; pet_toxicity_severity: number;
        isHealthy: boolean; healthScore: number; healthIssues: string[];
        home_tips: string[]; pro_tips: string[];
        max_height: string; flowering_season: string; fruiting_season: string;
        growing_location: 'indoor' | 'outdoor' | 'both';
        health_status: 'healthy' | 'needs_attention' | 'critical';
        health_diagnosis_issues: string | null;
        health_recommendation: string | null;
      };

      if (d.is_grass) {
        setGrassName(d.name ?? null);
        setPhase('grass');
      } else {
        setResult({
          name: d.name,
          species: d.species,
          status: d.healthScore >= 80 ? 'healthy' : d.healthScore >= 55 ? 'mild' : d.healthScore >= 30 ? 'serious' : 'critical',
          wateringFrequency: d.wateringFrequency,
          wateringDays: d.wateringDays,
          sunlight: d.sunlight,
          soilType: d.soilType,
          temperature: d.temperature,
          careTip: d.careTip,
          fertilizingDays: d.fertilizingDays,
          mistingDays: d.mistingDays,
          toxicToHumans: d.toxicToHumans,
          toxicToPets: d.toxicToPets,
          humanToxicitySeverity: d.human_toxicity_severity,
          petToxicitySeverity: d.pet_toxicity_severity,
          toxicityNote: d.toxicityNote ?? null,
          isHealthy: d.isHealthy,
          healthScore: d.healthScore ?? (d.isHealthy ? 100 : 65),
          healthIssues: d.healthIssues ?? [],
          homeTips: d.home_tips ?? [],
          proTips: d.pro_tips ?? [],
          maxHeight: d.max_height,
          floweringSeason: d.flowering_season,
          fruitingSeason: d.fruiting_season,
          growingLocation: d.growing_location,
          healthDiagnosisStatus: d.health_status,
          healthDiagnosisIssues: d.health_diagnosis_issues ?? null,
          healthRecommendation: d.health_recommendation ?? null,
        });
        setPhase('result');
      }

      // Meter the scan against the user's tier — fire and forget, not
      // gated on the user later saving/favouriting the result.
      incrementScanCount();

      // Award +30 XP — fire and forget
      supabase
        .rpc('increment_xp', { xp_amount: 30 })
        .then(({ data: xp }) => setXpTotal(typeof xp === 'number' ? xp : 30))
        .catch(() => setXpTotal(30));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis failed. Please try again.';
      setAnalyzeError(msg);
      setPhase('camera');
    }
  }, [router]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 1.0 });
      if (!photo?.uri) {
        setAnalyzeError('Failed to capture photo. Please try again.');
        return;
      }
      await runAnalysis(photo.uri);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not capture photo.';
      setAnalyzeError(msg);
    }
  }, [runAnalysis]);

  const handlePickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission needed',
        'Please allow photo library access in Settings to pick a plant photo.',
      );
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as ImagePicker.MediaType[],
      quality: 1.0,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    await runAnalysis(picked.assets[0].uri);
  }, [runAnalysis]);

  const handleSaveToGarden = useCallback(async () => {
    if (!result) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const wDays = Math.max(1, Math.round(result.wateringDays || 7));
      const fDays = Math.max(1, Math.round(result.fertilizingDays || 14));
      const mDays = result.mistingDays != null ? Math.max(1, Math.round(result.mistingDays)) : null;

      // Upload compressed photo to Supabase Storage (non-fatal if it fails)
      let photoUrl: string | null = null;
      if (photoBase64) {
        try {
          const bytes = Uint8Array.from(atob(photoBase64), c => c.charCodeAt(0));
          const storagePath = `${user.id}/${Date.now()}.jpg`;
          const { data: up, error: upErr } = await supabase.storage
            .from('plant-images')
            .upload(storagePath, bytes, { contentType: 'image/jpeg', upsert: false });
          if (!upErr && up) {
            const { data: urlData } = supabase.storage.from('plant-images').getPublicUrl(up.path);
            photoUrl = urlData.publicUrl;
          }
        } catch {
          // Upload failed — plant saved without photo
        }
      }

      // Save plant with all detected fields — identical to add-plant flow
      const { data: plant, error: plantErr } = await supabase
        .from('plants')
        .insert({
          user_id: user.id,
          name: result.name,
          species: result.species,
          watering_frequency: result.wateringFrequency,
          sunlight: result.sunlight,
          soil_type: result.soilType,
          temperature_range: result.temperature,
          care_tip: result.careTip,
          health_percent: Math.min(100, Math.max(0, Math.round(result.healthScore))),
          photo_url: photoUrl,
          health_issues: result.healthIssues.length > 0 ? result.healthIssues : null,
          health_remedies: result.homeTips.length > 0 ? result.homeTips : null,
          health_tips_pro: result.proTips.length > 0 ? result.proTips : null,
          toxic_to_humans: result.toxicToHumans,
          toxic_to_pets: result.toxicToPets,
          human_toxicity_severity: result.humanToxicitySeverity,
          pet_toxicity_severity: result.petToxicitySeverity,
          toxicity_note: result.toxicityNote,
          max_height: result.maxHeight,
          flowering_season: result.floweringSeason,
          fruiting_season: result.fruitingSeason,
          growing_location: result.growingLocation,
          space_id: selectedSpaceId,
          health_status: result.healthDiagnosisStatus,
          health_diagnosis_issues: result.healthDiagnosisIssues,
          health_recommendation: result.healthRecommendation,
          health_checked_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (plantErr || !plant) throw new Error(plantErr?.message ?? 'Failed to save plant');

      // Journal entries (fire-and-forget)
      const journalRows: { plant_id: string; user_id: string; entry_type: string; message: string }[] = [
        { plant_id: plant.id, user_id: user.id, entry_type: 'added', message: `Added ${result.name} to your garden` },
      ];
      if (result.healthIssues.length > 0) {
        journalRows.push({
          plant_id: plant.id, user_id: user.id, entry_type: 'health_issue',
          message: `${result.name} showing ${result.healthIssues[0].toLowerCase()} — check Health Tips`,
        });
      }
      supabase.from('journal_entries').insert(journalRows).then(null, () => {});

      // Create care tasks — identical to add-plant flow
      const taskInserts = [
        { plant_id: plant.id, user_id: user.id, task_type: 'watering' as const,    due_date: addDaysToToday(wDays), xp_reward: 10, interval_days: wDays },
        { plant_id: plant.id, user_id: user.id, task_type: 'fertilizing' as const, due_date: addDaysToToday(fDays), xp_reward: 25, interval_days: fDays },
        ...(mDays != null
          ? [{ plant_id: plant.id, user_id: user.id, task_type: 'misting' as const, due_date: addDaysToToday(mDays), xp_reward: 5, interval_days: mDays }]
          : []),
      ];

      const { error: taskErr } = await supabase.from('care_tasks').insert(taskInserts);
      if (taskErr) throw new Error(`care_tasks: ${taskErr.message}`);

      const hasPermission = await requestNotificationPermission();
      if (hasPermission) {
        await cancelPlantNotifications(plant.id);
        for (const t of taskInserts) {
          if (t.task_type !== 'watering') continue;
          scheduleTaskNotification(result.name, t.task_type, t.due_date, plant.id).catch(() => {});
        }
      }

      setSaved(true);
      setTimeout(() => router.replace('/(tabs)'), 1200);
    } catch (err) {
      Alert.alert(
        'Save failed',
        err instanceof Error ? err.message : 'Could not save plant. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }, [result, photoBase64, router, selectedSpaceId]);

  const handleAddFavourite = useCallback(async () => {
    if (!result || favourited || favouriting) return;
    setFavouriting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const species = result.species?.trim();
      const nameMatch = result.name.trim();

      // Check if this species (or name, if species is unknown) is already
      // discovered anywhere for this user — either an actual garden plant or
      // a prior favourite — to decide whether the XP bonus applies.
      const [plantsRes, favouritesRes] = await Promise.all([
        species
          ? supabase.from('plants').select('id', { count: 'exact', head: true }).eq('user_id', user.id).ilike('species', species)
          : supabase.from('plants').select('id', { count: 'exact', head: true }).eq('user_id', user.id).ilike('name', nameMatch),
        species
          ? supabase.from('favourites').select('id', { count: 'exact', head: true }).eq('user_id', user.id).ilike('species', species)
          : supabase.from('favourites').select('id', { count: 'exact', head: true }).eq('user_id', user.id).ilike('name', nameMatch),
      ]);
      const isNewSpecies = (plantsRes.count ?? 0) === 0 && (favouritesRes.count ?? 0) === 0;

      // Upload compressed photo to Supabase Storage (non-fatal if it fails)
      let photoUrl: string | null = null;
      if (photoBase64) {
        try {
          const bytes = Uint8Array.from(atob(photoBase64), c => c.charCodeAt(0));
          const storagePath = `${user.id}/${Date.now()}-fav.jpg`;
          const { data: up, error: upErr } = await supabase.storage
            .from('plant-images')
            .upload(storagePath, bytes, { contentType: 'image/jpeg', upsert: false });
          if (!upErr && up) {
            const { data: urlData } = supabase.storage.from('plant-images').getPublicUrl(up.path);
            photoUrl = urlData.publicUrl;
          }
        } catch {
          // Upload failed — favourite saved without photo
        }
      }

      const { error: favErr } = await supabase.from('favourites').insert({
        user_id: user.id,
        name: result.name,
        species: result.species,
        photo_url: photoUrl,
        watering_frequency: result.wateringFrequency,
        sunlight: result.sunlight,
        soil_type: result.soilType,
        temperature: result.temperature,
        care_tip: result.careTip,
        health_issues: result.healthIssues.length > 0 ? result.healthIssues : null,
        health_remedies: result.homeTips.length > 0 ? result.homeTips : null,
        health_tips_pro: result.proTips.length > 0 ? result.proTips : null,
        toxic_to_humans: result.toxicToHumans,
        toxic_to_pets: result.toxicToPets,
        human_toxicity_severity: result.humanToxicitySeverity,
        pet_toxicity_severity: result.petToxicitySeverity,
        toxicity_note: result.toxicityNote,
        max_height: result.maxHeight,
        flowering_season: result.floweringSeason,
        fruiting_season: result.fruitingSeason,
        growing_location: result.growingLocation,
      });
      if (favErr) throw new Error(favErr.message);

      if (isNewSpecies) {
        supabase.rpc('increment_xp', { xp_amount: 10 }).then(null, () => {});
      }

      setFavourited(true);
      setToastMessage(isNewSpecies ? 'Added to Favourites  +10 XP' : 'Added to Favourites');
      setTimeout(() => setToastMessage(null), 2200);
    } catch (err) {
      Alert.alert(
        'Could not add favourite',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setFavouriting(false);
    }
  }, [result, photoBase64, favourited, favouriting]);

  const resetScan = useCallback(() => {
    setPhase('camera');
    setPhotoUri(null);
    setPhotoBase64(null);
    setResult(null);
    setGrassName(null);
    setAnalyzeError(null);
    setXpTotal(null);
    setSaved(false);
    setFavourited(false);
    setToastMessage(null);
  }, []);

  // ─── Permission loading ────────────────────────────────────────────────────
  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  // ─── Permission denied ─────────────────────────────────────────────────────
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.permissionWrap}>
          <Ionicons name="camera-outline" size={64} color={Colors.primary} style={{ opacity: 0.8 }} />
          <Text style={styles.permissionTitle}>Camera access needed</Text>
          <Text style={styles.permissionBody}>
            Plant Park needs camera access to scan and identify your plants.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>Grant Access</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Analyzing ─────────────────────────────────────────────────────────────
  if (phase === 'analyzing') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.analyzingWrap}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.analyzingPhoto} resizeMode="cover" />
          ) : null}
          <View style={styles.analyzingOverlay}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.analyzingTitle}>Analyzing your plant…</Text>
            <Text style={styles.analyzingSubtitle}>Powered by Claude AI</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Grass detected ────────────────────────────────────────────────────────
  if (phase === 'grass') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.permissionWrap}>
          <Ionicons name="leaf" size={64} color={Colors.primary} style={{ opacity: 0.8 }} />
          <Text style={styles.permissionTitle}>Grass detected!</Text>
          <Text style={styles.permissionBody}>
            Lawns get a different care plan than potted plants — mowing and fertilizing on their own schedule instead of watering and sunlight.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push({
              pathname: '/grass-planner',
              params: { photoUri: photoUri ?? '', name: grassName ?? '' },
            })}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Set up lawn care plan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={resetScan} activeOpacity={0.7}>
            <Text style={styles.secondaryBtnText}>This isn't grass, rescan</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Result ────────────────────────────────────────────────────────────────
  if (phase === 'result' && result) {
    const cfg = getStatusConfig(Colors)[result.status];
    const wDays = Math.max(1, Math.round(result.wateringDays || 7));
    const wateringLevel = getWateringLevel(wDays, result.wateringFrequency);
    const sunlightLevel = getSunlightLevel(result.sunlight);
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.resultContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Photo + XP banner + favourite button */}
          <View style={styles.resultPhotoWrap}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.resultPhoto} resizeMode="cover" />
            ) : null}
            {xpTotal !== null ? (
              <View style={styles.xpBanner}>
                <Ionicons name="star" size={13} color={Colors.xp} />
                <Text style={styles.xpBannerText}>+30 XP earned!</Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={styles.favouriteBtn}
              onPress={handleAddFavourite}
              disabled={favouriting || favourited}
              activeOpacity={0.8}
            >
              {favouriting ? (
                <ActivityIndicator size="small" color={Colors.danger} />
              ) : (
                <Ionicons
                  name={favourited ? 'heart' : 'heart-outline'}
                  size={20}
                  color={favourited ? Colors.danger : '#FFFFFF'}
                />
              )}
            </TouchableOpacity>
          </View>

          {toastMessage ? (
            <View style={styles.toast}>
              <Ionicons name="checkmark-circle" size={15} color={Colors.primary} />
              <Text style={styles.toastText}>{toastMessage}</Text>
            </View>
          ) : null}

          {/* Identity */}
          <View style={styles.identityCard}>
            <Text style={styles.plantName}>{result.name}</Text>
            <Text style={styles.plantSpecies}>{result.species}</Text>
            <View style={[styles.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.color }]}>
              <View style={[styles.statusDot, { backgroundColor: cfg.color }]} />
              <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>

          {/* Care Requirements */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Care Requirements</Text>
            <View style={styles.infoGrid}>
              {[
                { icon: ICONS.waterDrop,   label: 'Watering',    value: `Every ${wDays} day${wDays === 1 ? '' : 's'}`, level: wateringLevel, barColor: WATER_COLOR },
                { icon: ICONS.sun,         label: 'Sunlight',    value: SUNLIGHT_LABELS[result.sunlight] ?? result.sunlight, level: sunlightLevel, barColor: Colors.xp },
                { icon: ICONS.seedling,    label: 'Soil',        value: result.soilType, level: undefined as number | undefined, barColor: undefined as string | undefined },
                { icon: ICONS.thermometer, label: 'Temperature', value: result.temperature, level: undefined as number | undefined, barColor: undefined as string | undefined },
              ].map(({ icon, label, value, level, barColor }) => (
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

          {/* Toxicity */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Toxicity</Text>
            <View style={styles.toxicityRow}>
              <ToxicitySeverityBar label="Humans" icon={ICONS.warning} severity={result.humanToxicitySeverity} />
              <ToxicitySeverityBar label="Pets" icon={ICONS.catFace} severity={result.petToxicitySeverity} />
            </View>
            {result.toxicityNote && (
              <Text style={styles.toxicityNote}>{result.toxicityNote}</Text>
            )}
          </View>

          {/* Plant details */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Plant Details</Text>
            <View style={styles.infoGrid}>
              {[
                { icon: ICONS.ruler,         label: 'Max Height',       value: result.maxHeight,                                                       muted: false },
                { icon: ICONS.cherryBlossom, label: 'Flowering Season', value: result.floweringSeason === 'N/A' ? 'Not applicable' : result.floweringSeason, muted: result.floweringSeason === 'N/A' },
                { icon: ICONS.redApple,      label: 'Fruiting Season',  value: result.fruitingSeason === 'N/A' ? 'Not applicable' : result.fruitingSeason,   muted: result.fruitingSeason === 'N/A' },
                { icon: ICONS.house,         label: 'Suitability',      value: GROWING_LOCATION_LABELS[result.growingLocation] ?? result.growingLocation,   muted: false },
              ].map(({ icon, label, value, muted }) => (
                <View key={label} style={styles.infoItem}>
                  <Image source={icon} style={styles.infoIcon} resizeMode="contain" />
                  <Text style={styles.infoLabel}>{label}</Text>
                  <Text style={[styles.infoValue, muted && styles.infoValueMuted]} numberOfLines={2}>{value}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Issues / health */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {result.healthIssues.length > 0 ? 'Issues Detected' : 'Plant Health'}
            </Text>
            {result.healthIssues.length > 0 ? (
              result.healthIssues.map((issue, i) => (
                <View key={i} style={styles.listRow}>
                  <Ionicons name="alert-circle" size={15} color={Colors.warning} style={styles.listIcon} />
                  <Text style={styles.listText}>{issue}</Text>
                </View>
              ))
            ) : (
              <View style={styles.listRow}>
                <Ionicons name="checkmark-circle" size={15} color={Colors.primary} style={styles.listIcon} />
                <Text style={[styles.listText, { color: Colors.primary }]}>
                  No issues detected — your plant is thriving!
                </Text>
              </View>
            )}
          </View>

          {/* Home remedies */}
          {result.homeTips.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                {result.isHealthy ? '🏠 Prevention Tips' : '🏠 Home Remedies'}
              </Text>
              {result.homeTips.map((step, i) => (
                <View key={i} style={styles.fixRow}>
                  <View style={styles.fixNum}>
                    <Text style={styles.fixNumText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.fixText}>{step}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Pro tips */}
          {result.proTips.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>🔬 Pro Tips</Text>
              {result.proTips.map((step, i) => (
                <View key={i} style={styles.fixRow}>
                  <View style={[styles.fixNum, styles.fixNumPro]}>
                    <Text style={styles.fixNumText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.fixText}>{step}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Which Space? */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Which Space?</Text>
            <View style={styles.spaceChipsRow}>
              <TouchableOpacity
                style={[styles.spaceChip, selectedSpaceId === null && styles.spaceChipSelected]}
                onPress={() => setSelectedSpaceId(null)}
                activeOpacity={0.75}
              >
                <Text style={[styles.spaceChipText, selectedSpaceId === null && styles.spaceChipTextSelected]}>
                  No Space
                </Text>
              </TouchableOpacity>
              {spaces.map((s) => {
                const selected = selectedSpaceId === s.id;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.spaceChip, selected && styles.spaceChipSelected]}
                    onPress={() => setSelectedSpaceId(s.id)}
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

          {/* Actions */}
          <TouchableOpacity
            style={[styles.primaryBtn, styles.saveBtn, saved && styles.saveBtnDone]}
            onPress={handleSaveToGarden}
            disabled={saving || saved}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={Colors.textPrimary} />
            ) : saved ? (
              <>
                <Ionicons name="checkmark-circle" size={19} color={Colors.textPrimary} />
                <Text style={styles.primaryBtnText}>Saved to Garden!</Text>
              </>
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={19} color={Colors.textPrimary} />
                <Text style={styles.primaryBtnText}>Save to Garden</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={resetScan} activeOpacity={0.7}>
            <Ionicons name="scan-outline" size={17} color={Colors.primary} />
            <Text style={styles.secondaryBtnText}>Scan Another Plant</Text>
          </TouchableOpacity>
        </ScrollView>

        <CreateSpaceModal
          visible={showCreateSpace}
          onClose={() => setShowCreateSpace(false)}
          onCreated={(space) => {
            setSpaces(prev => [...prev, space]);
            setSelectedSpaceId(space.id);
          }}
        />
      </SafeAreaView>
    );
  }

  // ─── Camera viewfinder ─────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.cameraWrap}>
        <Text style={styles.title}>Scan Plant</Text>
        <Text style={styles.subtitle}>Point at a plant and tap the button to identify it</Text>

        {analyzeError ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={15} color={Colors.danger} />
            <Text style={styles.errorText}>{analyzeError}</Text>
          </View>
        ) : null}

        <View style={styles.viewfinder}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            active={isFocused}
          />
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>

        <TouchableOpacity style={styles.captureBtn} onPress={handleCapture} activeOpacity={0.85}>
          <View style={styles.captureBtnInner} />
        </TouchableOpacity>

        <Text style={styles.orText}>— or —</Text>

        <TouchableOpacity style={styles.libraryBtn} onPress={handlePickImage} activeOpacity={0.7}>
          <Ionicons name="image-outline" size={19} color={Colors.primary} />
          <Text style={styles.libraryBtnText}>Choose from Library</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function getStyles(Colors: ColorPalette, FontSize: FontSizeScale) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  centered: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Permission screen ──────────────────────────────────────────────────────
  permissionWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  permissionTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  permissionBody: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Analyzing screen ──────────────────────────────────────────────────────
  analyzingWrap: { flex: 1 },
  analyzingPhoto: { width: '100%', height: '100%' },
  analyzingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13,40,24,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  analyzingTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  analyzingSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary },

  // ── Result screen ─────────────────────────────────────────────────────────
  resultContent: { padding: Spacing.md, paddingBottom: Spacing.xxl },

  resultPhotoWrap: {
    width: '100%',
    height: 220,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface,
    position: 'relative',
  },
  resultPhoto: { width: '100%', height: '100%' },
  xpBanner: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.xp,
  },
  xpBannerText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.xp },
  favouriteBtn: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    marginBottom: Spacing.md,
  },
  toastText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textPrimary },

  identityCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.xs,
  },
  plantName: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  plantSpecies: { fontSize: FontSize.sm, color: Colors.textMuted, fontStyle: 'italic' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: FontSize.sm, fontWeight: '600' },

  section: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  sectionLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  spaceChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
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
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  listIcon: { marginTop: 1 },
  listText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },

  toxicityRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  toxicityNote: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, marginTop: Spacing.xs },

  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: Spacing.sm },
  infoItem: {
    width: '47%',
    minHeight: 104,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 4,
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

  fixRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  fixNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  fixNumPro: { backgroundColor: Colors.rare },
  fixNumText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.background },
  fixText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },

  saveBtn: { marginTop: Spacing.sm },
  saveBtnDone: { backgroundColor: Colors.primaryDark },

  // ── Camera screen ─────────────────────────────────────────────────────────
  cameraWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: '#2D1010',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.danger,
    width: '100%',
    marginBottom: Spacing.sm,
  },
  errorText: { flex: 1, fontSize: FontSize.sm, color: Colors.danger },

  viewfinder: {
    width: '100%',
    flex: 1,
    maxHeight: 340,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.primary,
    position: 'relative',
    backgroundColor: Colors.surface,
    marginBottom: Spacing.lg,
  },
  corner: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderColor: Colors.primary,
    borderWidth: 3,
  },
  cornerTL: { top: 10, left: 10, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  cornerTR: { top: 10, right: 10, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  cornerBL: { bottom: 10, left: 10, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 10, right: 10, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },

  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  captureBtnInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
  },
  orText: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.md },

  // ── Shared ────────────────────────────────────────────────────────────────
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    width: '100%',
  },
  primaryBtnText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },

  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: Spacing.sm,
    width: '100%',
  },
  secondaryBtnText: { fontSize: FontSize.md, color: Colors.primary, fontWeight: '600' },

  libraryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  libraryBtnText: { fontSize: FontSize.md, color: Colors.primary, fontWeight: '600' },
  });
}
