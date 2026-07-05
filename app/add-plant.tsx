import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';
import { requestNotificationPermission, scheduleTaskNotification, cancelPlantNotifications } from '../lib/notifications';
import { getScanStatus, incrementScanCount } from '../lib/scanLimits';
import { getWateringLevel, getSunlightLevel, WATER_COLOR } from '../lib/careLevels';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import ToxicitySeverityBar from '../components/ToxicitySeverityBar';
import LevelBar from '../components/LevelBar';

type Phase = 'capture' | 'analyzing' | 'review';

interface DetectedPlant {
  name: string;
  species: string;
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
  human_toxicity_severity: number;
  pet_toxicity_severity: number;
  toxicityNote: string | null;
  isHealthy: boolean;
  healthScore: number;
  healthIssues: string[];
  home_tips: string[];
  pro_tips: string[];
  max_height: string;
  flowering_season: string;
  fruiting_season: string;
  growing_location: 'indoor' | 'outdoor' | 'both';
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
  waterDrop:     require('../assets/icons/water_drop.png'),
  sun:           require('../assets/icons/sun.png'),
  seedling:      require('../assets/icons/seedling.png'),
  thermometer:   require('../assets/icons/thermometer.png'),
  ruler:         require('../assets/icons/ruler.png'),
  cherryBlossom: require('../assets/icons/cherry_blossom.png'),
  redApple:      require('../assets/icons/red_apple.png'),
  house:         require('../assets/icons/house.png'),
  warning:          require('../assets/icons/warning.png'),
  catFace:          require('../assets/icons/cat_face.png'),
} as const;

function addDaysToToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AddPlantScreen() {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('capture');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [compressed, setCompressed] = useState<{ uri: string; base64: string } | null>(null);
  const [detected, setDetected] = useState<DetectedPlant | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [favourited, setFavourited] = useState(false);
  const [favouriting, setFavouriting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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
    setCompressed(null);
    setFavourited(false);
    setToastMessage(null);
    try {
      // Compress: resize to max 1024px wide, 80% JPEG — brings 5-8 MB down to ~200-500 KB
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      const compressedBase64 = result.base64!;
      setCompressed({ uri: result.uri, base64: compressedBase64 });

      const { data, error } = await supabase.functions.invoke('detect-plant', {
        body: { image: compressedBase64, mediaType: 'image/jpeg' },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setDetected(data as DetectedPlant);
      setPhase('review');

      // Meter the scan against the user's tier — fire and forget, not
      // gated on the user later saving/favouriting the result.
      incrementScanCount();
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Detection failed. Please try again.');
      setPhase('capture');
    }
  }, [router]);

  const handleTakePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to take a plant photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 1.0 });
    if (result.canceled || !result.assets?.[0]) return;
    await runAnalysis(result.assets[0].uri);
  }, [runAnalysis]);

  const handlePickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1.0,
    });
    if (result.canceled || !result.assets?.[0]) return;
    await runAnalysis(result.assets[0].uri);
  }, [runAnalysis]);

  const handleSave = useCallback(async () => {
    if (!detected) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const wDays = Math.max(1, Math.round(detected.wateringDays || 7));
      const fDays = Math.max(1, Math.round(detected.fertilizingDays || 14));
      const mDays = detected.mistingDays != null ? Math.max(1, Math.round(detected.mistingDays)) : null;

      // Upload compressed photo to Supabase Storage (non-fatal if it fails)
      let photoUrl: string | null = null;
      if (compressed?.base64) {
        try {
          const bytes = Uint8Array.from(atob(compressed.base64), c => c.charCodeAt(0));
          const storagePath = `${user.id}/${Date.now()}.jpg`;
          const { data: up, error: upErr } = await supabase.storage
            .from('plant-images')
            .upload(storagePath, bytes, { contentType: 'image/jpeg', upsert: false });
          if (!upErr && up) {
            const { data: urlData } = supabase.storage.from('plant-images').getPublicUrl(up.path);
            photoUrl = urlData.publicUrl;
          }
        } catch {
          // Upload failed — plant is still saved, just without a photo
        }
      }

      const { data: plant, error: plantErr } = await supabase
        .from('plants')
        .insert({
          user_id: user.id,
          name: detected.name,
          species: detected.species,
          watering_frequency: detected.wateringFrequency,
          sunlight: detected.sunlight,
          soil_type: detected.soilType,
          temperature_range: detected.temperature,
          care_tip: detected.careTip,
          health_percent: Math.min(100, Math.max(0, Math.round(detected.healthScore ?? (detected.isHealthy ? 100 : 65)))),
          photo_url: photoUrl,
          health_issues: detected.healthIssues.length > 0 ? detected.healthIssues : null,
          health_remedies: detected.home_tips.length > 0 ? detected.home_tips : null,
          health_tips_pro: detected.pro_tips.length > 0 ? detected.pro_tips : null,
          toxic_to_humans: detected.toxicToHumans,
          toxic_to_pets: detected.toxicToPets,
          human_toxicity_severity: detected.human_toxicity_severity,
          pet_toxicity_severity: detected.pet_toxicity_severity,
          toxicity_note: detected.toxicityNote,
          max_height: detected.max_height,
          flowering_season: detected.flowering_season,
          fruiting_season: detected.fruiting_season,
          growing_location: detected.growing_location,
        })
        .select('id')
        .single();

      if (plantErr || !plant) throw new Error(plantErr?.message ?? 'Failed to save plant');

      // Journal entries (fire-and-forget)
      const journalRows: { plant_id: string; user_id: string; entry_type: string; message: string }[] = [
        { plant_id: plant.id, user_id: user.id, entry_type: 'added', message: `Added ${detected.name} to your garden` },
      ];
      if (detected.healthIssues.length > 0) {
        journalRows.push({
          plant_id: plant.id, user_id: user.id, entry_type: 'health_issue',
          message: `${detected.name} showing ${detected.healthIssues[0].toLowerCase()} — check Health Tips`,
        });
      }
      supabase.from('journal_entries').insert(journalRows).then(null, () => {});

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
          scheduleTaskNotification(detected.name, t.task_type, t.due_date, plant.id).catch(() => {});
        }
      }

      supabase.rpc('increment_xp', { xp_amount: 50 }).then(null, () => {});
      router.back();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save plant');
    } finally {
      setSaving(false);
    }
  }, [detected, router]);

  const handleAddFavourite = useCallback(async () => {
    if (!detected || favourited || favouriting) return;
    setFavouriting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const species = detected.species?.trim();
      const nameMatch = detected.name.trim();

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
      if (compressed?.base64) {
        try {
          const bytes = Uint8Array.from(atob(compressed.base64), c => c.charCodeAt(0));
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
        name: detected.name,
        species: detected.species,
        photo_url: photoUrl,
        watering_frequency: detected.wateringFrequency,
        sunlight: detected.sunlight,
        soil_type: detected.soilType,
        temperature: detected.temperature,
        care_tip: detected.careTip,
        health_issues: detected.healthIssues.length > 0 ? detected.healthIssues : null,
        health_remedies: detected.home_tips.length > 0 ? detected.home_tips : null,
        health_tips_pro: detected.pro_tips.length > 0 ? detected.pro_tips : null,
        toxic_to_humans: detected.toxicToHumans,
        toxic_to_pets: detected.toxicToPets,
        human_toxicity_severity: detected.human_toxicity_severity,
        pet_toxicity_severity: detected.pet_toxicity_severity,
        toxicity_note: detected.toxicityNote,
        max_height: detected.max_height,
        flowering_season: detected.flowering_season,
        fruiting_season: detected.fruiting_season,
        growing_location: detected.growing_location,
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
  }, [detected, compressed, favourited, favouriting]);

  // ── Analyzing ────────────────────────────────────────────────────────────────
  if (phase === 'analyzing') {
    return (
      <View style={styles.root}>
        {photoUri && (
          <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        )}
        <View style={styles.analyzingOverlay}>
          <View style={styles.analyzingSpinnerWrap}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
          <Text style={styles.analyzingTitle}>Reading your plant...</Text>
          <Text style={styles.analyzingSubtitle}>AI is detecting species & care needs</Text>
        </View>
      </View>
    );
  }

  // ── Review ───────────────────────────────────────────────────────────────────
  if (phase === 'review' && detected) {
    const wDays = Math.max(1, Math.round(detected.wateringDays || 7));
    const wateringLevel = getWateringLevel(wDays, detected.wateringFrequency);
    const sunlightLevel = getSunlightLevel(detected.sunlight);
    const infoItems = [
      { icon: ICONS.waterDrop,   label: 'Watering',    value: `Every ${wDays} day${wDays === 1 ? '' : 's'}`, level: wateringLevel, barColor: WATER_COLOR },
      { icon: ICONS.sun,         label: 'Sunlight',    value: SUNLIGHT_LABELS[detected.sunlight] ?? detected.sunlight, level: sunlightLevel, barColor: Colors.xp },
      { icon: ICONS.seedling,    label: 'Soil',        value: detected.soilType, level: undefined as number | undefined, barColor: undefined as string | undefined },
      { icon: ICONS.thermometer, label: 'Temperature', value: detected.temperature, level: undefined as number | undefined, barColor: undefined as string | undefined },
    ] as const;
    const detailItems = [
      { icon: ICONS.ruler,         label: 'Max Height',       value: detected.max_height,                                                       muted: false },
      { icon: ICONS.cherryBlossom, label: 'Flowering Season', value: detected.flowering_season === 'N/A' ? 'Not applicable' : detected.flowering_season, muted: detected.flowering_season === 'N/A' },
      { icon: ICONS.redApple,      label: 'Fruiting Season',  value: detected.fruiting_season === 'N/A' ? 'Not applicable' : detected.fruiting_season,   muted: detected.fruiting_season === 'N/A' },
      { icon: ICONS.house,         label: 'Suitability',      value: GROWING_LOCATION_LABELS[detected.growing_location] ?? detected.growing_location,   muted: false },
    ] as const;

    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.reviewScroll} showsVerticalScrollIndicator={false}>
          {photoUri && (
            <View style={styles.reviewImageWrap}>
              <Image source={{ uri: photoUri }} style={styles.reviewImage} resizeMode="cover" />
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
          )}

          {toastMessage ? (
            <View style={styles.toast}>
              <Ionicons name="checkmark-circle" size={15} color={Colors.primary} />
              <Text style={styles.toastText}>{toastMessage}</Text>
            </View>
          ) : null}

          <View style={styles.reviewCard}>
            <Text style={styles.reviewName}>{detected.name}</Text>
            <Text style={styles.reviewSpecies}>{detected.species}</Text>

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

            <View style={styles.toxicityRow}>
              <ToxicitySeverityBar label="Humans" icon={ICONS.warning} severity={detected.human_toxicity_severity ?? 0} />
              <ToxicitySeverityBar label="Pets" icon={ICONS.catFace} severity={detected.pet_toxicity_severity ?? 0} />
            </View>
            {detected.toxicityNote && (
              <Text style={styles.toxicityNote}>{detected.toxicityNote}</Text>
            )}

            <Text style={styles.detailsSectionLabel}>Plant Details</Text>
            <View style={styles.infoGrid}>
              {detailItems.map(({ icon, label, value, muted }) => (
                <View key={label} style={styles.infoItem}>
                  <Image source={icon} style={styles.infoIcon} resizeMode="contain" />
                  <Text style={styles.infoLabel}>{label}</Text>
                  <Text style={[styles.infoValue, muted && styles.infoValueMuted]} numberOfLines={2}>{value}</Text>
                </View>
              ))}
            </View>

            <View style={styles.careTipBox}>
              <Text style={styles.careTipLabel}>Care Tip</Text>
              <Text style={styles.careTipText}>{detected.careTip}</Text>
            </View>

            {(detected.home_tips.length > 0 || detected.pro_tips.length > 0) && (
              <View style={[styles.healthBox, !detected.isHealthy && styles.healthBoxWarning]}>
                <View style={styles.healthBoxLabelRow}>
                  <Ionicons
                    name={detected.isHealthy ? 'checkmark-circle' : 'warning'}
                    size={13}
                    color={detected.isHealthy ? Colors.primary : Colors.warning}
                  />
                  <Text style={[styles.healthBoxLabel, !detected.isHealthy && styles.healthBoxLabelWarning]}>
                    {detected.isHealthy ? 'Prevention Tips' : 'Health Issues Detected'}
                  </Text>
                </View>
                {!detected.isHealthy && detected.healthIssues.length > 0 && (
                  <View style={styles.issuesList}>
                    {detected.healthIssues.map((issue, i) => (
                      <Text key={i} style={styles.issueItem}>• {issue}</Text>
                    ))}
                  </View>
                )}
                {detected.home_tips.length > 0 && (
                  <>
                    <Text style={styles.subLabel}>🏠 Home Remedies</Text>
                    <View style={styles.remediesList}>
                      {detected.home_tips.map((remedy, i) => (
                        <View key={i} style={styles.remedyRow}>
                          <Text style={styles.remedyNum}>{i + 1}</Text>
                          <Text style={styles.remedyText}>{remedy}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
                {detected.pro_tips.length > 0 && (
                  <View style={styles.proTipsSection}>
                    <Text style={styles.subLabel}>🔬 Pro Tips</Text>
                    <View style={styles.remediesList}>
                      {detected.pro_tips.map((tip, i) => (
                        <View key={i} style={styles.remedyRow}>
                          <Text style={styles.proTipNum}>{i + 1}</Text>
                          <Text style={styles.remedyText}>{tip}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}

            {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={Colors.textPrimary} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color={Colors.textPrimary} />
                  <Text style={styles.saveBtnText}>Save to Garden  +50 XP</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.retakeBtn} onPress={() => setPhase('capture')}>
              <Text style={styles.retakeBtnText}>Retake Photo</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Capture ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.captureHeader}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.captureBody}>
        <Ionicons name="leaf" size={64} color={Colors.primary} style={{ marginBottom: Spacing.lg }} />
        <Text style={styles.captureTitle}>Add a Plant</Text>
        <Text style={styles.captureSubtitle}>
          Take a photo and our AI will identify the species and build a personalised care schedule automatically.
        </Text>

        {analyzeError ? (
          <View style={styles.errorBox}>
            <Ionicons name="warning-outline" size={18} color={Colors.danger} />
            <Text style={styles.errorBoxText}>{analyzeError}</Text>
          </View>
        ) : null}

        <TouchableOpacity style={styles.photoBtn} onPress={handleTakePhoto}>
          <Ionicons name="camera" size={28} color={Colors.textPrimary} />
          <Text style={styles.photoBtnText}>Take Photo</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.photoBtn, styles.photoBtnOutline]} onPress={handlePickImage}>
          <Ionicons name="image" size={28} color={Colors.primary} />
          <Text style={[styles.photoBtnText, styles.photoBtnTextOutline]}>Upload from Library</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function getStyles(Colors: ColorPalette, FontSize: FontSizeScale) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  // Analyzing
  analyzingOverlay: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  analyzingSpinnerWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  analyzingTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: Spacing.sm,
  },
  analyzingSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary },

  // Review
  reviewScroll: { paddingBottom: Spacing.xxl },
  reviewImageWrap: { position: 'relative' },
  reviewImage: { width: '100%', height: 260 },
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
    marginTop: Spacing.sm,
  },
  toastText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textPrimary },
  reviewCard: {
    margin: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reviewName: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.textPrimary },
  reviewSpecies: {
    fontSize: FontSize.sm,
    fontStyle: 'italic',
    color: Colors.textSecondary,
    marginTop: -Spacing.sm,
  },
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
  detailsSectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  toxicityRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  toxicityNote: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, marginTop: -Spacing.xs },
  careTipBox: {
    backgroundColor: 'rgba(46,204,113,0.1)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    padding: Spacing.md,
    gap: 6,
  },
  careTipLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  careTipText: { fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 20 },

  // Health tips / troubleshooting box
  healthBox: {
    backgroundColor: 'rgba(46,204,113,0.07)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  healthBoxWarning: {
    backgroundColor: 'rgba(243,156,18,0.08)',
    borderColor: Colors.warning,
  },
  healthBoxLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  healthBoxLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  healthBoxLabelWarning: { color: Colors.warning },
  issuesList: { gap: 3 },
  issueItem: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19 },
  remediesList: { gap: Spacing.sm, marginTop: 2 },
  remedyRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  remedyNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primaryDark,
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 20,
    flexShrink: 0,
  },
  remedyText: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 20 },
  subLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, marginTop: 2 },
  proTipsSection: { gap: Spacing.sm, marginTop: 2 },
  proTipNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.rare,
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 20,
    flexShrink: 0,
  },

  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 14,
    marginTop: Spacing.sm,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  retakeBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  retakeBtnText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textDecorationLine: 'underline',
  },
  errorText: { fontSize: FontSize.sm, color: Colors.danger, textAlign: 'center' },

  // Capture
  captureHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  captureTitle: {
    fontSize: FontSize.hero,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  captureSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 300,
    marginBottom: Spacing.sm,
  },
  errorBox: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: 'rgba(231,76,60,0.1)',
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'flex-start',
    width: '100%',
  },
  errorBoxText: { flex: 1, fontSize: FontSize.sm, color: Colors.danger, lineHeight: 20 },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    width: '100%',
    paddingVertical: 18,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
  },
  photoBtnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  photoBtnText: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  photoBtnTextOutline: { color: Colors.primary },
  });
}
