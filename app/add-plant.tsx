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
import { supabase } from '../lib/supabase';
import { requestNotificationPermission, scheduleTaskNotification } from '../lib/notifications';
import { Colors, Spacing, Radius, FontSize } from '../constants/theme';

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
}

const SUNLIGHT_LABELS: Record<string, string> = {
  low: 'Low Light',
  medium: 'Indirect Light',
  bright: 'Bright Direct',
};

function addDaysToToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AddPlantScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('capture');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [detected, setDetected] = useState<DetectedPlant | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const runAnalysis = useCallback(async (uri: string, base64: string, mediaType: string) => {
    setPhotoUri(uri);
    setPhase('analyzing');
    setAnalyzeError(null);
    try {
      const { data, error } = await supabase.functions.invoke('detect-plant', {
        body: { image: base64, mediaType },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setDetected(data as DetectedPlant);
      setPhase('review');
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Detection failed. Please try again.');
      setPhase('capture');
    }
  }, []);

  const handleTakePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to take a plant photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5 });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    const asset = result.assets[0];
    await runAnalysis(asset.uri, asset.base64!, 'image/jpeg');
  }, [runAnalysis]);

  const handlePickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.5,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    const asset = result.assets[0];
    const mt = ['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType ?? '')
      ? asset.mimeType!
      : 'image/jpeg';
    await runAnalysis(asset.uri, asset.base64!, mt);
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
          health_percent: 100,
        })
        .select('id')
        .single();

      if (plantErr || !plant) throw new Error(plantErr?.message ?? 'Failed to save plant');

      const taskInserts = [
        { plant_id: plant.id, user_id: user.id, task_type: 'watering' as const,    due_date: addDaysToToday(wDays), xp_reward: 10, interval_days: wDays },
        { plant_id: plant.id, user_id: user.id, task_type: 'fertilizing' as const, due_date: addDaysToToday(fDays), xp_reward: 25, interval_days: fDays },
        ...(mDays != null
          ? [{ plant_id: plant.id, user_id: user.id, task_type: 'misting' as const, due_date: addDaysToToday(mDays), xp_reward: 5, interval_days: mDays }]
          : []),
      ];

      await supabase.from('care_tasks').insert(taskInserts);

      const hasPermission = await requestNotificationPermission();
      if (hasPermission) {
        for (const t of taskInserts) {
          scheduleTaskNotification(detected.name, t.task_type, t.due_date).catch(() => {});
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
    const infoItems = [
      { icon: 'water-outline',       label: 'Watering',    value: `Every ${wDays} day${wDays === 1 ? '' : 's'}` },
      { icon: 'sunny-outline',       label: 'Sunlight',    value: SUNLIGHT_LABELS[detected.sunlight] ?? detected.sunlight },
      { icon: 'earth-outline',       label: 'Soil',        value: detected.soilType },
      { icon: 'thermometer-outline', label: 'Temperature', value: detected.temperature },
    ] as const;

    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.reviewScroll} showsVerticalScrollIndicator={false}>
          {photoUri && (
            <Image source={{ uri: photoUri }} style={styles.reviewImage} resizeMode="cover" />
          )}

          <View style={styles.reviewCard}>
            <Text style={styles.reviewName}>{detected.name}</Text>
            <Text style={styles.reviewSpecies}>{detected.species}</Text>

            <View style={styles.infoGrid}>
              {infoItems.map(({ icon, label, value }) => (
                <View key={label} style={styles.infoItem}>
                  <Ionicons name={icon as any} size={20} color={Colors.primary} />
                  <Text style={styles.infoLabel}>{label}</Text>
                  <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
                </View>
              ))}
            </View>

            <View style={styles.careTipBox}>
              <Text style={styles.careTipLabel}>Care Tip</Text>
              <Text style={styles.careTipText}>{detected.careTip}</Text>
            </View>

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

const styles = StyleSheet.create({
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
  reviewImage: { width: '100%', height: 260 },
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
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  infoItem: {
    width: '47%',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 4,
  },
  infoLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 4,
  },
  infoValue: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: '600' },
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
