import { useState, useRef, useCallback } from 'react';
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
import { Colors, Spacing, Radius, FontSize } from '../../constants/theme';

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
  // Health diagnosis
  isHealthy: boolean;
  healthScore: number;
  healthIssues: string[];
  remedies: string[];
}

type Phase = 'camera' | 'analyzing' | 'result';

const STATUS_CONFIG: Record<HealthStatus, { label: string; color: string; bg: string }> = {
  healthy:  { label: 'Healthy',  color: Colors.primary, bg: '#0B2A14' },
  mild:     { label: 'Mild',     color: Colors.warning, bg: '#2E1E00' },
  serious:  { label: 'Serious',  color: Colors.serious, bg: '#2E1200' },
  critical: { label: 'Critical', color: Colors.danger,  bg: '#2E0808' },
};

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
  const [permission, requestPermission] = useCameraPermissions();
  const isFocused = useIsFocused();
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);

  const [phase, setPhase]               = useState<Phase>('camera');
  const [photoUri, setPhotoUri]         = useState<string | null>(null);
  const [photoBase64, setPhotoBase64]   = useState<string | null>(null);
  const [result, setResult]             = useState<ScanResult | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [xpTotal, setXpTotal]           = useState<number | null>(null);
  const [saved, setSaved]               = useState(false);
  const [saving, setSaving]             = useState(false);

  const runAnalysis = useCallback(async (uri: string) => {
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
        name: string; species: string;
        wateringFrequency: 'daily' | 'weekly' | 'monthly'; wateringDays: number;
        sunlight: 'low' | 'medium' | 'bright'; soilType: string;
        temperature: string; careTip: string;
        fertilizingDays: number; mistingDays: number | null;
        isHealthy: boolean; healthScore: number; healthIssues: string[]; remedies: string[];
      };

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
        isHealthy: d.isHealthy,
        healthScore: d.healthScore ?? (d.isHealthy ? 100 : 65),
        healthIssues: d.healthIssues ?? [],
        remedies: d.remedies ?? [],
      });
      setPhase('result');

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
  }, []);

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
          health_remedies: result.remedies.length > 0 ? result.remedies : null,
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
  }, [result, photoBase64, router]);

  const resetScan = useCallback(() => {
    setPhase('camera');
    setPhotoUri(null);
    setPhotoBase64(null);
    setResult(null);
    setAnalyzeError(null);
    setXpTotal(null);
    setSaved(false);
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
            PlantPal needs camera access to scan and identify your plants.
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

  // ─── Result ────────────────────────────────────────────────────────────────
  if (phase === 'result' && result) {
    const cfg = STATUS_CONFIG[result.status];
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.resultContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Photo + XP banner */}
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
          </View>

          {/* Identity */}
          <View style={styles.identityCard}>
            <Text style={styles.plantName}>{result.name}</Text>
            <Text style={styles.plantSpecies}>{result.species}</Text>
            <View style={[styles.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.color }]}>
              <View style={[styles.statusDot, { backgroundColor: cfg.color }]} />
              <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
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

          {/* Remedies / care tips */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {result.isHealthy ? 'Prevention Tips' : 'Home Remedies'}
            </Text>
            {result.remedies.map((step, i) => (
              <View key={i} style={styles.fixRow}>
                <View style={styles.fixNum}>
                  <Text style={styles.fixNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.fixText}>{step}</Text>
              </View>
            ))}
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

const styles = StyleSheet.create({
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
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  listIcon: { marginTop: 1 },
  listText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },

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
