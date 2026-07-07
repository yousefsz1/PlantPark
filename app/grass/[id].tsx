import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import type { Plant } from '../../types/database';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

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

export default function GrassDetailScreen() {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const params = useLocalSearchParams<{ id: string }>();
  const plantId = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();

  const [plant, setPlant] = useState<Plant | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!plantId) return;
      supabase.from('plants').select('*').eq('id', plantId).single().then(({ data }) => {
        setPlant(data);
        setLoading(false);
      });
    }, [plantId]),
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
          <Image source={{ uri: plant.photo_url }} style={styles.photo} resizeMode="cover" />
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

        <Text style={styles.comingSoonText}>
          Your full mowing &amp; fertilizing care plan is coming soon.
        </Text>
      </ScrollView>
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

    comingSoonText: {
      fontSize: FontSize.sm,
      color: Colors.textMuted,
      textAlign: 'center',
      marginTop: Spacing.lg,
    },
  });
}
