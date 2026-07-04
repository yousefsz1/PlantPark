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
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import type { Favourite } from '../../types/database';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import ToxicitySeverityBar from '../../components/ToxicitySeverityBar';

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

export default function FavouriteDetailScreen() {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [favourite, setFavourite] = useState<Favourite | null>(null);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(false);

  const fetchFavourite = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from('favourites').select('*').eq('id', id).maybeSingle();
    setFavourite(data);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      fetchFavourite().finally(() => setLoading(false));
    }, [fetchFavourite]),
  );

  const handleRemove = useCallback(() => {
    if (!favourite) return;
    Alert.alert(
      'Remove from Favourites?',
      `${favourite.name} will be removed from your favourites.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemoving(true);
            const { error } = await supabase.from('favourites').delete().eq('id', favourite.id);
            setRemoving(false);
            if (error) {
              Alert.alert('Error', error.message);
              return;
            }
            router.back();
          },
        },
      ],
    );
  }, [favourite, router]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!favourite) {
    return (
      <View style={styles.centered}>
        <Text style={styles.notFoundText}>Favourite not found.</Text>
        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const hasProTips = (favourite.health_tips_pro?.length ?? 0) > 0;
  const infoItems = [
    { icon: 'water-outline',       label: 'Watering',    value: favourite.watering_frequency ? (WATERING_LABELS[favourite.watering_frequency] ?? favourite.watering_frequency) : '—' },
    { icon: 'sunny-outline',       label: 'Sunlight',    value: favourite.sunlight ? (SUNLIGHT_LABELS[favourite.sunlight] ?? favourite.sunlight) : '—' },
    { icon: 'earth-outline',       label: 'Soil',        value: favourite.soil_type ?? '—' },
    { icon: 'thermometer-outline', label: 'Temperature', value: favourite.temperature ?? '—' },
  ] as const;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero ── */}
        <View style={styles.hero}>
          {favourite.photo_url ? (
            <Image source={{ uri: favourite.photo_url }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]}>
              <Ionicons name="heart" size={80} color={Colors.danger} style={{ opacity: 0.45 }} />
            </View>
          )}
          <View style={styles.heroGradient} />
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.trashBtn, removing && styles.disabled]}
            onPress={handleRemove}
            disabled={removing}
          >
            {removing ? (
              <ActivityIndicator size="small" color={Colors.danger} />
            ) : (
              <Ionicons name="heart-dislike-outline" size={20} color={Colors.danger} />
            )}
          </TouchableOpacity>
          <View style={styles.heroMeta}>
            <Text style={styles.heroName}>{favourite.name}</Text>
            {favourite.species ? <Text style={styles.heroSpecies}>{favourite.species}</Text> : null}
          </View>
        </View>

        {/* ── Toxicity ── */}
        {favourite.toxic_to_humans !== null && favourite.toxic_to_pets !== null && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Toxicity</Text>
            <View style={styles.toxicityRow}>
              <ToxicitySeverityBar label="Humans" icon="body-outline" severity={favourite.human_toxicity_severity ?? 0} />
              <ToxicitySeverityBar label="Pets" icon="paw" severity={favourite.pet_toxicity_severity ?? 0} />
            </View>
            {favourite.toxicity_note && (
              <Text style={styles.toxicityNote}>{favourite.toxicity_note}</Text>
            )}
          </View>
        )}

        {/* ── Care requirements ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Care Requirements</Text>
          <View style={styles.infoGrid}>
            {infoItems.map(({ icon, label, value }) => (
              <View key={label} style={styles.infoItem}>
                <Ionicons name={icon as any} size={20} color={Colors.primary} />
                <Text style={styles.infoLabel}>{label}</Text>
                <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Care tip ── */}
        {favourite.care_tip ? (
          <View style={styles.section}>
            <View style={styles.tipBox}>
              <Text style={styles.tipBoxLabel}>AI Care Tip</Text>
              <Text style={styles.tipBoxText}>{favourite.care_tip}</Text>
            </View>
          </View>
        ) : null}

        {/* ── Home remedies / pro tips ── */}
        {favourite.health_remedies && favourite.health_remedies.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Health Tips & Troubleshooting</Text>
            <View style={styles.healthCard}>
              <Text style={styles.subLabel}>🏠 Home Remedies</Text>
              <View style={styles.remediesList}>
                {favourite.health_remedies.map((remedy, i) => (
                  <View key={i} style={styles.remedyRow}>
                    <View style={styles.remedyBadge}>
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
                    {favourite.health_tips_pro!.map((tip, i) => (
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
        ) : null}
      </ScrollView>
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
  disabled: { opacity: 0.6 },

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

  // Sections
  section: { marginHorizontal: Spacing.md, marginTop: Spacing.lg },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },

  // Toxicity
  toxicityRow: { flexDirection: 'row', gap: Spacing.sm },
  toxicityNote: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, marginTop: Spacing.sm },

  // Info grid
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  infoItem: {
    width: '47%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 4,
  },
  infoValue: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: '600' },

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

  // Health tips
  healthCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  subLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  proTipsSection: { gap: Spacing.sm, marginTop: 2 },
  remediesList: { gap: Spacing.sm },
  remedyRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(46,204,113,0.07)',
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
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
