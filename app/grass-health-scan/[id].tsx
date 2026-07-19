import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../../lib/supabase';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

const STEPS = [
  {
    key: 'whole',
    label: 'Whole Lawn',
    instruction: 'Take a photo of your whole lawn from a normal standing height.',
  },
  {
    key: 'worst',
    label: 'Worst-Looking Spot',
    instruction: "Get close to the patch that's bothering you most.",
  },
  {
    key: 'best',
    label: 'Best-Looking Spot',
    instruction: 'Show us where your lawn looks healthiest.',
  },
] as const;

type StepKey = (typeof STEPS)[number]['key'];
type Photos = Record<StepKey, string | null>;

export default function GrassHealthScanScreen() {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const params = useLocalSearchParams<{ id: string }>();
  const plantId = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();

  const [stepIndex, setStepIndex] = useState(0);
  const [photos, setPhotos] = useState<Photos>({ whole: null, worst: null, best: null });
  const [analyzing, setAnalyzing] = useState(false);

  const step = STEPS[stepIndex];
  const currentPhoto = photos[step.key];
  const isLastStep = stepIndex === STEPS.length - 1;

  const handleBack = useCallback(() => {
    if (stepIndex === 0) {
      router.back();
    } else {
      setStepIndex((i) => i - 1);
    }
  }, [stepIndex, router]);

  const handleTakePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 1.0 });
    if (result.canceled || !result.assets?.[0]) return;
    setPhotos((prev) => ({ ...prev, [step.key]: result.assets[0].uri }));
  }, [step.key]);

  const handlePickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1.0 });
    if (result.canceled || !result.assets?.[0]) return;
    setPhotos((prev) => ({ ...prev, [step.key]: result.assets[0].uri }));
  }, [step.key]);

  const handleRetake = useCallback(() => {
    setPhotos((prev) => ({ ...prev, [step.key]: null }));
  }, [step.key]);

  const handleAnalyze = useCallback(async () => {
    if (!plantId || !photos.whole || !photos.worst || !photos.best) return;
    setAnalyzing(true);
    try {
      const compress = async (uri: string) => {
        const result = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 1024 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
        return result.base64!;
      };

      const [wholeB64, worstB64, bestB64] = await Promise.all([
        compress(photos.whole),
        compress(photos.worst),
        compress(photos.best),
      ]);

      const { data, error } = await supabase.functions.invoke('analyze-grass-health', {
        body: {
          images: [
            { image: wholeB64, mediaType: 'image/jpeg' },
            { image: worstB64, mediaType: 'image/jpeg' },
            { image: bestB64, mediaType: 'image/jpeg' },
          ],
        },
      });
      if (error) throw new Error(error.message ?? 'Edge function error');
      if (data?.error) throw new Error(data.error);

      const result = data as { issues: string[]; tips: string[]; health_level: number };

      // Scan metering (3 scans) now happens server-side inside
      // analyze-grass-health, which also enforces the Basic/Pro requirement.

      // Save all 3 photos to the lawn's photo timeline — only once analysis
      // has actually succeeded, so an abandoned/failed scan doesn't litter
      // storage or plant_photos.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const uploadPhoto = async (base64: string, tag: string) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const storagePath = `${user.id}/progress/${plantId}/${Date.now()}-${tag}.jpg`;
        const { data: up, error: upErr } = await supabase.storage
          .from('plant-images')
          .upload(storagePath, bytes, { contentType: 'image/jpeg', upsert: false });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('plant-images').getPublicUrl(up.path);
        return urlData.publicUrl;
      };

      const [wholeUrl, worstUrl, bestUrl] = await Promise.all([
        uploadPhoto(wholeB64, 'whole'),
        uploadPhoto(worstB64, 'worst'),
        uploadPhoto(bestB64, 'best'),
      ]);

      const { error: photosErr } = await supabase.from('plant_photos').insert([
        { plant_id: plantId, user_id: user.id, photo_url: wholeUrl },
        { plant_id: plantId, user_id: user.id, photo_url: worstUrl },
        { plant_id: plantId, user_id: user.id, photo_url: bestUrl },
      ]);
      if (photosErr) throw photosErr;

      const { error: updateErr } = await supabase
        .from('plants')
        .update({
          grass_health_issues: result.issues ?? [],
          health_tips_pro: result.tips ?? [],
          lawn_health_level: result.health_level,
          lawn_health_checked_at: new Date().toISOString(),
          fertilizer_recommendation: (result as { fertilizer_recommendation?: string | null }).fertilizer_recommendation ?? null,
        })
        .eq('id', plantId);
      if (updateErr) throw updateErr;

      router.replace(`/grass/${plantId}`);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to analyze your lawn');
    } finally {
      setAnalyzing(false);
    }
  }, [plantId, photos, router]);

  if (analyzing) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.analyzingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.analyzingTitle}>Analyzing your lawn…</Text>
          <Text style={styles.analyzingSubtitle}>Looking at all 3 photos together</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Lawn Health Scan</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.dotsRow}>
        {STEPS.map((s, i) => (
          <View key={s.key} style={[styles.dot, i === stepIndex && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.body}>
        <Text style={styles.stepLabel}>{step.label}</Text>
        <Text style={styles.stepInstruction}>{step.instruction}</Text>

        {currentPhoto ? (
          <>
            <Image source={{ uri: currentPhoto }} style={styles.preview} resizeMode="cover" />
            <TouchableOpacity style={styles.retakeBtn} onPress={handleRetake}>
              <Ionicons name="refresh" size={16} color={Colors.primary} />
              <Text style={styles.retakeBtnText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => (isLastStep ? handleAnalyze() : setStepIndex((i) => i + 1))}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>{isLastStep ? 'Analyze My Lawn' : 'Next'}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.captureBox}>
              <Ionicons name="camera-outline" size={48} color={Colors.primary} style={{ opacity: 0.6 }} />
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleTakePhoto} activeOpacity={0.85}>
              <Ionicons name="camera" size={20} color={Colors.textPrimary} />
              <Text style={styles.primaryBtnText}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={handlePickImage} activeOpacity={0.7}>
              <Text style={styles.secondaryBtnText}>Choose from Library</Text>
            </TouchableOpacity>
          </>
        )}
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

    dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: Spacing.md },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(128,128,128,0.4)' },
    dotActive: { backgroundColor: Colors.primary, width: 10, height: 10, borderRadius: 5 },

    body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
    stepLabel: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
    stepInstruction: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.sm },

    captureBox: {
      width: 200,
      height: 200,
      borderRadius: Radius.xl,
      borderWidth: 1.5,
      borderColor: Colors.border,
      borderStyle: 'dashed',
      backgroundColor: Colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: Spacing.sm,
    },
    preview: {
      width: 200,
      height: 200,
      borderRadius: Radius.xl,
      backgroundColor: Colors.surfaceElevated,
    },
    retakeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: Spacing.xs },
    retakeBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.primary },

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
      alignItems: 'center',
      justifyContent: 'center',
      padding: Spacing.md,
      width: '100%',
    },
    secondaryBtnText: { fontSize: FontSize.md, color: Colors.primary, fontWeight: '600' },

    analyzingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
    analyzingTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
    analyzingSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary },
  });
}
