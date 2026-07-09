import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Dimensions, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { getWateringPlan, getFertilizingPlan, getMowingPlan, getGrassInsight, type SunExposure, type LawnCondition } from '../../lib/grassCare';
import { WATER_COLOR } from '../../lib/careLevels';
import { getScanStatus } from '../../lib/scanLimits';
import type { Plant, PlantPhoto, CareTask } from '../../types/database';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import LevelBar from '../../components/LevelBar';
import PhotoViewerModal, { formatPhotoDate, type GalleryPhoto } from '../../components/PhotoViewerModal';

const SCREEN_WIDTH = Dimensions.get('window').width;
const PHOTO_COL_SIZE = (SCREEN_WIDTH - Spacing.md * 2 - Spacing.sm * 2) / 3;

const SUN_LABELS: Record<string, string> = {
  full_sun: 'Full Sun',
  partial_shade: 'Partial Shade',
  full_shade: 'Full Shade',
};

const CONDITION_LABELS: Record<string, string> = {
  healthy: 'Looks Healthy',
  patchy: 'Patchy or Bare Spots',
  yellowing: 'Yellowing',
  unsure: 'Not Sure',
};

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} days ago`;
}

function groupPhotosByDay(photos: GalleryPhoto[]): { label: string; photos: GalleryPhoto[] }[] {
  const groups = new Map<string, GalleryPhoto[]>();
  for (const photo of photos) {
    const day = photo.created_at.slice(0, 10);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(photo);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, dayPhotos]) => ({ label: formatPhotoDate(dayPhotos[0].created_at), photos: dayPhotos }));
}

export default function GrassDetailScreen() {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const params = useLocalSearchParams<{ id: string }>();
  const plantId = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();

  const [plant, setPlant] = useState<Plant | null>(null);
  const [progressPhotos, setProgressPhotos] = useState<PlantPhoto[]>([]);
  const [pendingWateringTask, setPendingWateringTask] = useState<CareTask | null>(null);
  const [lastCompletedWateringTask, setLastCompletedWateringTask] = useState<CareTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [wateringAnyway, setWateringAnyway] = useState(false);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);

  const fetchData = useCallback(async () => {
    if (!plantId) return;
    const [plantRes, photosRes, pendingRes, lastCompletedRes] = await Promise.all([
      supabase.from('plants').select('*').eq('id', plantId).single(),
      supabase.from('plant_photos').select('*').eq('plant_id', plantId).order('created_at', { ascending: false }),
      supabase
        .from('care_tasks')
        .select('*')
        .eq('plant_id', plantId)
        .eq('task_type', 'watering')
        .is('completed_at', null)
        .order('due_date')
        .limit(1)
        .maybeSingle(),
      supabase
        .from('care_tasks')
        .select('*')
        .eq('plant_id', plantId)
        .eq('task_type', 'watering')
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    setPlant(plantRes.data);
    setProgressPhotos((photosRes.data ?? []) as PlantPhoto[]);
    setPendingWateringTask(pendingRes.data);
    setLastCompletedWateringTask(lastCompletedRes.data);
    setLoading(false);
  }, [plantId]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

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
          <Text style={styles.notFoundText}>Lawn not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>← Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const sunExposure = (plant.sun_exposure ?? 'full_sun') as SunExposure;
  const lawnCondition = (plant.lawn_condition ?? 'healthy') as LawnCondition;
  const areaM2 = plant.lawn_area_m2 ?? 0;

  const liveWatering = getWateringPlan(sunExposure, lawnCondition, areaM2);
  const wateringIntervalDays = pendingWateringTask?.interval_days ?? liveWatering.intervalDays;
  const watering = { intervalDays: wateringIntervalDays, liters: liveWatering.liters };
  const wateredByRain = lastCompletedWateringTask?.completed_via === 'rain';
  const fertilizing = getFertilizingPlan(areaM2);
  const mowing = getMowingPlan(lawnCondition);
  const fertilizingIntervalDays = plant.fertilizing_frequency_days ?? fertilizing.intervalDays;
  const fertilizingWeeks = Math.round(fertilizingIntervalDays / 7);
  const insight = plant.sun_exposure && plant.lawn_condition
    ? getGrassInsight(sunExposure, lawnCondition, plant.grass_health_issues)
    : null;

  const galleryPhotos: GalleryPhoto[] = (plant.photo_url
    ? [{ id: 'hero', photo_url: plant.photo_url, created_at: plant.created_at }, ...progressPhotos]
    : [...progressPhotos]
  ).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const photoGroups = groupPhotosByDay(galleryPhotos);

  const openPhotoViewer = (photoId: string) => {
    const idx = galleryPhotos.findIndex(p => p.id === photoId);
    setPhotoViewerIndex(Math.max(0, idx));
    setPhotoViewerVisible(true);
  };

  const handleWaterAnyway = async () => {
    if (!pendingWateringTask) return;
    setWateringAnyway(true);
    try {
      const { error } = await supabase.rpc('complete_care_task', { task_id: pendingWateringTask.id });
      if (error) throw error;
      await fetchData();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to mark as watered');
    } finally {
      setWateringAnyway(false);
    }
  };

  const handleScanPress = async () => {
    const status = await getScanStatus();
    if (status?.tier === 'free') {
      Alert.alert(
        'Upgrade Required',
        'Lawn Health Scans are a Basic/Pro feature — upgrade to unlock AI-powered lawn diagnostics.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'View Plans', onPress: () => router.push('/membership') },
        ],
      );
      return;
    }
    if (status && status.limit - status.count < 3) {
      Alert.alert(
        'Scan limit reached',
        `You've reached your ${status.tier} plan's limit of ${status.limit} scans this month.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'View Plans', onPress: () => router.push('/membership') },
        ],
      );
      return;
    }
    router.push(`/grass-health-scan/${plant.id}`);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{plant.name}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {plant.photo_url ? (
          <TouchableOpacity activeOpacity={0.9} onPress={() => openPhotoViewer('hero')}>
            <Image source={{ uri: plant.photo_url }} style={styles.photo} resizeMode="cover" />
          </TouchableOpacity>
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <Ionicons name="leaf-outline" size={56} color={Colors.primary} style={{ opacity: 0.45 }} />
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Lawn Details</Text>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Size</Text>
            <Text style={styles.rowValue}>
              {plant.lawn_length_m ?? '—'} m × {plant.lawn_width_m ?? '—'} m
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Area</Text>
            <Text style={styles.rowValue}>{plant.lawn_area_m2 ?? '—'} m²</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Sun Exposure</Text>
            <Text style={styles.rowValue}>
              {plant.sun_exposure ? SUN_LABELS[plant.sun_exposure] ?? plant.sun_exposure : '—'}
            </Text>
          </View>
          <View style={[styles.row, styles.rowLast]}>
            <Text style={styles.rowLabel}>Condition</Text>
            <Text style={styles.rowValue}>
              {plant.lawn_condition ? CONDITION_LABELS[plant.lawn_condition] ?? plant.lawn_condition : '—'}
            </Text>
          </View>
        </View>

        <View style={styles.planCard}>
          <View style={styles.planCardHeader}>
            <View style={[styles.planIconWrap, { backgroundColor: `${WATER_COLOR}26` }]}>
              <Ionicons name="water" size={20} color={WATER_COLOR} />
            </View>
            <Text style={styles.planCardTitle}>Watering</Text>
          </View>
          <Text style={styles.planCardValue}>
            Every {watering.intervalDays} day{watering.intervalDays === 1 ? '' : 's'} · {watering.liters} L each time
          </Text>

          {wateredByRain ? (
            <View style={styles.rainBanner}>
              <Ionicons name="rainy" size={16} color={WATER_COLOR} />
              <Text style={styles.rainBannerText}>
                Watered by rain — {lastCompletedWateringTask?.rain_mm}mm detected
              </Text>
              {pendingWateringTask ? (
                <TouchableOpacity onPress={handleWaterAnyway} disabled={wateringAnyway}>
                  {wateringAnyway ? (
                    <ActivityIndicator size="small" color={WATER_COLOR} />
                  ) : (
                    <Text style={styles.rainBannerAction}>Water anyway</Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.planCard}>
          <View style={styles.planCardHeader}>
            <View style={[styles.planIconWrap, { backgroundColor: 'rgba(46,204,113,0.15)' }]}>
              <Ionicons name="nutrition" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.planCardTitle}>Fertilizing</Text>
          </View>
          <Text style={styles.planCardValue}>
            Every {fertilizingWeeks} week{fertilizingWeeks === 1 ? '' : 's'} · {fertilizing.cups} cup{fertilizing.cups === 1 ? '' : 's'} each time
          </Text>
        </View>

        <View style={styles.planCard}>
          <View style={styles.planCardHeader}>
            <View style={[styles.planIconWrap, { backgroundColor: `${Colors.xp}26` }]}>
              <Ionicons name="cut" size={20} color={Colors.xp} />
            </View>
            <Text style={styles.planCardTitle}>Mowing</Text>
          </View>
          <Text style={styles.planCardValue}>Weekly</Text>
          {mowing.note ? <Text style={styles.planCardNote}>{mowing.note}</Text> : null}
        </View>

        {plant.lawn_health_level == null ? (
          <TouchableOpacity
            style={styles.scanCta}
            onPress={handleScanPress}
            activeOpacity={0.85}
          >
            <Ionicons name="camera-outline" size={22} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.scanCtaTitle}>Scan Lawn Health</Text>
              <Text style={styles.scanCtaSubtitle}>
                Get a health score and personalized tips from 3 quick photos
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : (
          <>
            <View style={styles.planCard}>
              <View style={styles.planCardHeader}>
                <View style={[styles.planIconWrap, { backgroundColor: 'rgba(46,204,113,0.15)' }]}>
                  <Ionicons name="stats-chart" size={20} color={Colors.primary} />
                </View>
                <Text style={[styles.planCardTitle, { flex: 1 }]}>Lawn Health</Text>
                <TouchableOpacity onPress={handleScanPress}>
                  <Text style={styles.rescanLink}>Re-scan</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.planCardValue}>{plant.lawn_health_level}/5</Text>
              <LevelBar level={plant.lawn_health_level} color={Colors.primary} />
              {plant.lawn_health_checked_at ? (
                <Text style={styles.lastScannedText}>
                  Last scanned {formatRelativeTime(plant.lawn_health_checked_at)}
                </Text>
              ) : null}
            </View>

            {plant.health_tips_pro && plant.health_tips_pro.length > 0 ? (
              <View style={[styles.card, { marginTop: Spacing.md }]}>
                <Text style={styles.cardTitle}>Tips for Your Lawn</Text>
                <View style={styles.remediesList}>
                  {plant.health_tips_pro.map((tip, i) => (
                    <View key={i} style={styles.remedyRow}>
                      <View style={styles.remedyBadgePro}>
                        <Text style={styles.remedyBadgeText}>{i + 1}</Text>
                      </View>
                      <Text style={styles.remedyText}>{tip}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}

        {insight ? (
          <View style={styles.insightCard}>
            <View style={styles.insightHeader}>
              <Ionicons name="bulb-outline" size={20} color={Colors.warning} />
              <Text style={styles.insightTitle}>Lawn Insight</Text>
            </View>
            {insight.kind === 'scanned' ? (
              <View style={styles.insightList}>
                {insight.issues.map((issue, i) => (
                  <View key={i} style={styles.insightBulletRow}>
                    <Text style={styles.insightBullet}>•</Text>
                    <Text style={styles.insightText}>{issue}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.insightText}>{insight.text}</Text>
            )}
          </View>
        ) : null}

        <View style={[styles.card, { marginTop: Spacing.md }]}>
          <Text style={styles.cardTitle}>Photo Timeline</Text>
          {photoGroups.length === 0 ? (
            <Text style={styles.noPhotosText}>
              No photos yet — scan your lawn's health to start tracking progress.
            </Text>
          ) : (
            photoGroups.map((group) => (
              <View key={group.label} style={styles.photoGroup}>
                <Text style={styles.photoGroupLabel}>{group.label}</Text>
                <View style={styles.photoGrid}>
                  {group.photos.map((photo) => (
                    <TouchableOpacity
                      key={photo.id}
                      style={styles.photoCell}
                      onPress={() => openPhotoViewer(photo.id)}
                      activeOpacity={0.85}
                    >
                      <Image source={{ uri: photo.photo_url }} style={styles.photoCellImg} resizeMode="cover" />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <PhotoViewerModal
        visible={photoViewerVisible}
        photos={galleryPhotos}
        initialIndex={photoViewerIndex}
        onClose={() => setPhotoViewerVisible(false)}
      />
    </SafeAreaView>
  );
}

function getStyles(Colors: ColorPalette, FontSize: FontSizeScale) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.background },
    centered: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
    notFoundText: { fontSize: FontSize.lg, color: Colors.textPrimary },
    backLink: { marginTop: Spacing.md },
    backLinkText: { fontSize: FontSize.sm, color: Colors.primary },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.sm,
      gap: Spacing.sm,
    },
    backBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: Colors.surfaceElevated,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: { flex: 1, fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
    headerSpacer: { width: 38 },

    content: { padding: Spacing.md, paddingBottom: Spacing.xxl },

    photo: {
      width: '100%',
      height: 200,
      borderRadius: Radius.lg,
      backgroundColor: Colors.surfaceElevated,
      marginBottom: Spacing.md,
    },
    photoPlaceholder: { justifyContent: 'center', alignItems: 'center' },

    card: {
      backgroundColor: Colors.card,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    rowLast: { borderBottomWidth: 0 },
    rowLabel: { fontSize: FontSize.sm, color: Colors.textMuted },
    rowValue: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },

    planCard: {
      backgroundColor: Colors.card,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      marginTop: Spacing.md,
    },
    planCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
    planIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },
    planCardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
    planCardValue: { fontSize: FontSize.sm, color: Colors.textSecondary },
    planCardNote: { fontSize: FontSize.xs, color: Colors.warning, marginTop: 4 },
    lastScannedText: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.sm },

    rainBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: Spacing.xs,
      marginTop: Spacing.sm,
      paddingTop: Spacing.sm,
      borderTopWidth: 1,
      borderTopColor: Colors.border,
    },
    rainBannerText: { flex: 1, fontSize: FontSize.xs, color: WATER_COLOR, fontWeight: '600' },
    rainBannerAction: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },

    insightCard: {
      borderRadius: Radius.lg,
      borderWidth: 1.5,
      borderColor: Colors.warning,
      backgroundColor: 'rgba(243,156,18,0.1)',
      padding: Spacing.md,
      marginTop: Spacing.md,
      gap: Spacing.xs,
    },
    insightHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    insightTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.warning },
    insightText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19 },
    insightList: { gap: 4 },
    insightBulletRow: { flexDirection: 'row', gap: Spacing.xs },
    insightBullet: { fontSize: FontSize.sm, color: Colors.warning, fontWeight: '700' },

    noPhotosText: {
      fontSize: FontSize.sm,
      color: Colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
    photoGroup: { marginBottom: Spacing.md },
    photoGroupLabel: {
      fontSize: FontSize.xs,
      fontWeight: '700',
      color: Colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: Spacing.sm,
    },
    photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    photoCell: { width: PHOTO_COL_SIZE },
    photoCellImg: {
      width: PHOTO_COL_SIZE,
      height: PHOTO_COL_SIZE,
      borderRadius: Radius.md,
      backgroundColor: Colors.surfaceElevated,
    },

    scanCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: 'rgba(46,204,113,0.08)',
      borderRadius: Radius.lg,
      borderWidth: 1.5,
      borderColor: Colors.primary,
      padding: Spacing.md,
      marginTop: Spacing.md,
    },
    scanCtaTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
    scanCtaSubtitle: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
    rescanLink: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },

    remediesList: { gap: Spacing.sm },
    remedyRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
      alignItems: 'flex-start',
      backgroundColor: 'rgba(46,204,113,0.07)',
      borderRadius: Radius.md,
      padding: Spacing.sm,
    },
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
  });
}
