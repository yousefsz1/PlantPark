import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Slider from '@react-native-community/slider';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';
import { getWateringPlan, getFertilizingPlan, getMowingPlan, type SunExposure, type LawnCondition } from '../lib/grassCare';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

function addDaysToToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Step = 1 | 2 | 3;

const SUN_OPTIONS: { value: SunExposure; label: string; icon: string }[] = [
  { value: 'full_sun', label: 'Full Sun', icon: 'sunny' },
  { value: 'partial_shade', label: 'Partial Shade', icon: 'partly-sunny-outline' },
  { value: 'full_shade', label: 'Full Shade', icon: 'cloudy-outline' },
];

const CONDITION_OPTIONS: { value: LawnCondition; label: string; icon: string }[] = [
  { value: 'healthy', label: 'Looks Healthy', icon: 'checkmark-circle-outline' },
  { value: 'patchy', label: 'Patchy or Bare Spots', icon: 'ellipse-outline' },
  { value: 'yellowing', label: 'Yellowing', icon: 'alert-circle-outline' },
  { value: 'unsure', label: 'Not Sure', icon: 'help-circle-outline' },
];

const PREVIEW_MAX = 200;

export default function GrassPlannerScreen() {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const router = useRouter();
  const params = useLocalSearchParams<{ photoUri?: string }>();

  const [step, setStep] = useState<Step>(1);
  const [lengthM, setLengthM] = useState(5);
  const [widthM, setWidthM] = useState(5);
  const [sunExposure, setSunExposure] = useState<SunExposure | null>(null);
  const [lawnCondition, setLawnCondition] = useState<LawnCondition | null>(null);
  const [saving, setSaving] = useState(false);

  const areaM2 = lengthM * widthM;
  const previewW = lengthM >= widthM ? PREVIEW_MAX : PREVIEW_MAX * (lengthM / widthM);
  const previewH = widthM >= lengthM ? PREVIEW_MAX : PREVIEW_MAX * (widthM / lengthM);

  const handleCreatePlan = useCallback(async () => {
    if (!sunExposure || !lawnCondition) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let photoUrl: string | null = null;
      if (params.photoUri) {
        try {
          const compressed = await ImageManipulator.manipulateAsync(
            params.photoUri,
            [{ resize: { width: 1024 } }],
            { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
          );
          const bytes = Uint8Array.from(atob(compressed.base64!), c => c.charCodeAt(0));
          const storagePath = `${user.id}/${Date.now()}.jpg`;
          const { data: up, error: upErr } = await supabase.storage
            .from('plant-images')
            .upload(storagePath, bytes, { contentType: 'image/jpeg', upsert: false });
          if (!upErr && up) {
            const { data: urlData } = supabase.storage.from('plant-images').getPublicUrl(up.path);
            photoUrl = urlData.publicUrl;
          }
        } catch {
          // Upload failed — lawn still saved, just without a photo
        }
      }

      const { data: plant, error } = await supabase
        .from('plants')
        .insert({
          user_id: user.id,
          name: 'My Lawn',
          is_grass: true,
          lawn_length_m: lengthM,
          lawn_width_m: widthM,
          lawn_area_m2: Math.round(areaM2 * 100) / 100,
          sun_exposure: sunExposure,
          lawn_condition: lawnCondition,
          photo_url: photoUrl,
          fertilizing_frequency_days: getFertilizingPlan(areaM2).intervalDays,
          mowing_frequency_days: getMowingPlan(lawnCondition).intervalDays,
        })
        .select('id')
        .single();

      if (error || !plant) throw new Error(error?.message ?? 'Failed to save lawn');

      const wateringIntervalDays = getWateringPlan(sunExposure, lawnCondition, areaM2).intervalDays;
      await supabase.from('care_tasks').insert({
        plant_id: plant.id,
        user_id: user.id,
        task_type: 'watering',
        due_date: addDaysToToday(wateringIntervalDays),
        xp_reward: 10,
        interval_days: wateringIntervalDays,
      });

      router.replace(`/grass/${plant.id}`);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create lawn care plan');
    } finally {
      setSaving(false);
    }
  }, [sunExposure, lawnCondition, lengthM, widthM, areaM2, params.photoUri, router]);

  const handleBack = useCallback(() => {
    if (step === 1) {
      router.back();
    } else {
      setStep((s) => (s - 1) as Step);
    }
  }, [step, router]);

  const handleContinue = useCallback(() => {
    if (step === 1) setStep(2);
    else if (step === 2) setStep(3);
    else handleCreatePlan();
  }, [step, handleCreatePlan]);

  const canContinue = step === 1 || (step === 2 ? sunExposure !== null : lawnCondition !== null);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Lawn Care Setup</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.progressRow}>
        {[1, 2, 3].map((n) => (
          <View key={n} style={[styles.progressSegment, n <= step && styles.progressSegmentActive]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {step === 1 && (
          <View>
            <Text style={styles.stepTitle}>How big is your lawn?</Text>
            <Text style={styles.stepSubtitle}>Drag the sliders to match your lawn's approximate size.</Text>

            <View style={styles.previewWrap}>
              <View style={[styles.previewRect, { width: previewW, height: previewH }]} />
            </View>
            <Text style={styles.areaText}>{areaM2.toFixed(1)} m²</Text>

            <View style={styles.sliderBlock}>
              <View style={styles.sliderLabelRow}>
                <Text style={styles.sliderLabel}>Length</Text>
                <Text style={styles.sliderValue}>{lengthM.toFixed(1)} m</Text>
              </View>
              <Slider
                style={styles.slider}
                minimumValue={1}
                maximumValue={15}
                step={0.5}
                value={lengthM}
                minimumTrackTintColor={Colors.primary}
                maximumTrackTintColor={Colors.surfaceElevated}
                thumbTintColor={Colors.primary}
                onValueChange={setLengthM}
              />
            </View>

            <View style={styles.sliderBlock}>
              <View style={styles.sliderLabelRow}>
                <Text style={styles.sliderLabel}>Width</Text>
                <Text style={styles.sliderValue}>{widthM.toFixed(1)} m</Text>
              </View>
              <Slider
                style={styles.slider}
                minimumValue={1}
                maximumValue={15}
                step={0.5}
                value={widthM}
                minimumTrackTintColor={Colors.primary}
                maximumTrackTintColor={Colors.surfaceElevated}
                thumbTintColor={Colors.primary}
                onValueChange={setWidthM}
              />
            </View>
          </View>
        )}

        {step === 2 && (
          <View>
            <Text style={styles.stepTitle}>How much sun does it get?</Text>
            <Text style={styles.stepSubtitle}>This helps us tune watering and fertilizing timing.</Text>
            <View style={styles.optionList}>
              {SUN_OPTIONS.map((opt) => {
                const selected = sunExposure === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.optionCard, selected && styles.optionCardSelected]}
                    onPress={() => setSunExposure(opt.value)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={opt.icon as any} size={24} color={selected ? Colors.primary : Colors.textSecondary} />
                    <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{opt.label}</Text>
                    {selected && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {step === 3 && (
          <View>
            <Text style={styles.stepTitle}>How does it look right now?</Text>
            <Text style={styles.stepSubtitle}>We'll use this to spot issues in your care plan.</Text>
            <View style={styles.optionList}>
              {CONDITION_OPTIONS.map((opt) => {
                const selected = lawnCondition === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.optionCard, selected && styles.optionCardSelected]}
                    onPress={() => setLawnCondition(opt.value)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={opt.icon as any} size={24} color={selected ? Colors.primary : Colors.textSecondary} />
                    <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{opt.label}</Text>
                    {selected && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueBtn, (!canContinue || saving) && styles.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={!canContinue || saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator size="small" color={Colors.textPrimary} />
          ) : (
            <Text style={styles.continueBtnText}>{step === 3 ? 'Create my plan' : 'Continue'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function getStyles(Colors: ColorPalette, FontSize: FontSizeScale) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.background },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.sm,
    },
    backBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: Colors.surfaceElevated,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
    headerSpacer: { width: 38 },

    progressRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.md, marginBottom: Spacing.md },
    progressSegment: { flex: 1, height: 4, borderRadius: Radius.full, backgroundColor: Colors.surfaceElevated },
    progressSegmentActive: { backgroundColor: Colors.primary },

    content: { padding: Spacing.md, paddingBottom: Spacing.xxl },

    stepTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
    stepSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.lg },

    // Step 1 — size
    previewWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      paddingVertical: Spacing.lg,
      marginBottom: Spacing.sm,
    },
    previewRect: {
      backgroundColor: 'rgba(46,204,113,0.18)',
      borderWidth: 1.5,
      borderColor: Colors.primary,
      borderRadius: Radius.sm,
      minWidth: 24,
      minHeight: 24,
    },
    areaText: {
      fontSize: FontSize.lg,
      fontWeight: '700',
      color: Colors.textPrimary,
      textAlign: 'center',
      marginBottom: Spacing.lg,
    },
    sliderBlock: { marginBottom: Spacing.md },
    sliderLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    sliderLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
    sliderValue: { fontSize: FontSize.sm, color: Colors.textMuted },
    slider: { width: '100%', height: 40 },

    // Steps 2/3 — option cards
    optionList: { gap: Spacing.sm },
    optionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: Colors.surface,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: Spacing.md,
    },
    optionCardSelected: {
      borderColor: Colors.primary,
      backgroundColor: 'rgba(46,204,113,0.1)',
    },
    optionLabel: { flex: 1, fontSize: FontSize.md, color: Colors.textSecondary },
    optionLabelSelected: { color: Colors.primary, fontWeight: '700' },

    // Footer
    footer: { padding: Spacing.md },
    continueBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.primary,
      borderRadius: Radius.full,
      paddingVertical: Spacing.md,
    },
    continueBtnDisabled: { opacity: 0.5 },
    continueBtnText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  });
}
