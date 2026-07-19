import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { WATER_COLOR } from '../lib/careLevels';
import type { Plant } from '../types/database';

function getMood(health: number, Colors: ColorPalette): { icon: 'happy' | 'remove-circle-outline' | 'sad-outline'; color: string } {
  if (health >= 80) return { icon: 'happy',                 color: Colors.primary };
  if (health >= 50) return { icon: 'remove-circle-outline', color: Colors.warning };
  return               { icon: 'sad-outline',               color: Colors.danger  };
}

const SUNLIGHT_SHORT: Record<string, string> = {
  low: 'Low',
  medium: 'Indirect',
  bright: 'Bright',
};

function waterChipLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days`;
}

// Pure presentational plant card — no touch handling of its own, so callers
// (the swipeable row on the Garden screen, the plain list on a Space's
// detail screen) can wrap it in whatever Touchable/gesture behavior they
// need without nesting Touchables.
//
// Modern pass: circular photo with a health-colored ring, a "next action"
// line (Water in N days · light) instead of the flat progress bar, and the
// health % as colored text on the right.
export default function PlantCard({
  plant,
  displayHealth,
  nextWaterDays,
}: {
  plant: Plant;
  displayHealth?: number;
  nextWaterDays?: number | null;
}) {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const health = displayHealth ?? plant.health_percent;
  const { icon: moodIcon, color } = getMood(health, Colors);
  const lawnHealthPct = plant.lawn_health_level != null ? Math.round((plant.lawn_health_level / 5) * 100) : null;
  const lawnColor = lawnHealthPct != null ? getMood(lawnHealthPct, Colors).color : Colors.textMuted;

  // Colored info chips (water countdown + light level) — livelier than a
  // plain gray text line. Water chip turns warning-colored when due.
  const showChips = !plant.is_grass && (nextWaterDays != null || (plant.sunlight && SUNLIGHT_SHORT[plant.sunlight]));
  const waterDue = nextWaterDays != null && nextWaterDays <= 0;
  const waterColor = waterDue ? Colors.warning : WATER_COLOR;
  const subtitle = plant.species ?? '';

  return (
    <View style={styles.plantCard}>
      {plant.photo_url ? (
        <Image source={{ uri: plant.photo_url }} style={styles.plantPhoto} resizeMode="cover" />
      ) : (
        <View style={styles.plantMoodWrap}>
          <Ionicons name={moodIcon} size={24} color={color} />
        </View>
      )}
      <View style={styles.plantInfo}>
        <Text style={styles.plantName} numberOfLines={1}>{plant.name}</Text>
        {showChips ? (
          <View style={styles.chipsRow}>
            {nextWaterDays != null && (
              <View style={[styles.chip, { backgroundColor: `${waterColor}1F` }]}>
                <Ionicons name="water" size={11} color={waterColor} />
                <Text style={[styles.chipText, { color: waterColor }]}>{waterChipLabel(nextWaterDays)}</Text>
              </View>
            )}
            {plant.sunlight && SUNLIGHT_SHORT[plant.sunlight] ? (
              <View style={[styles.chip, { backgroundColor: 'rgba(244,208,63,0.18)' }]}>
                <Ionicons name="sunny" size={11} color="#D4A017" />
                <Text style={[styles.chipText, { color: '#D4A017' }]}>{SUNLIGHT_SHORT[plant.sunlight]}</Text>
              </View>
            ) : null}
          </View>
        ) : subtitle ? (
          <Text style={styles.plantSubtitle} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>
      <View style={styles.plantRight}>
        {plant.is_grass ? (
          <>
            <View style={styles.lawnBadge}>
              <MaterialCommunityIcons name="grass" size={13} color={Colors.primaryDark} />
              <Text style={styles.lawnBadgeText}>Lawn</Text>
            </View>
            {lawnHealthPct != null ? (
              <View style={[styles.healthPctRow, { opacity: 0.5 }]}>
                <Ionicons name="heart" size={12} color={lawnColor} />
                <Text style={[styles.healthPct, { color: lawnColor }]}>{lawnHealthPct}%</Text>
              </View>
            ) : (
              <Text style={styles.notScannedText}>Not scanned</Text>
            )}
          </>
        ) : (
          <>
            <View style={styles.levelBadge}>
              <Text style={styles.levelBadgeText}>Lv {plant.level}</Text>
            </View>
            <View style={[styles.healthPctRow, { opacity: 0.5 }]}>
              <Ionicons name="heart" size={12} color={color} />
              <Text style={[styles.healthPct, { color }]}>{health}%</Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

function getStyles(Colors: ColorPalette, FontSize: FontSizeScale) {
  return StyleSheet.create({
    plantCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.card,
      borderRadius: Radius.lg,
      padding: Spacing.md,
      gap: Spacing.md,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    plantPhoto: {
      width: 56,
      height: 56,
      borderRadius: 16,
      backgroundColor: Colors.surfaceElevated,
    },
    plantMoodWrap: {
      width: 56,
      height: 56,
      borderRadius: 16,
      backgroundColor: Colors.surfaceElevated,
      justifyContent: 'center',
      alignItems: 'center',
    },
    plantInfo: { flex: 1, gap: 5 },
    plantRight: { alignItems: 'flex-end', gap: 4 },
    plantName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
    plantSubtitle: { fontSize: FontSize.xs, color: Colors.textMuted },
    chipsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: Radius.full,
    },
    chipText: { fontSize: FontSize.xs, fontWeight: '600' },
    levelBadge: {
      backgroundColor: 'rgba(46,204,113,0.14)',
      borderRadius: Radius.full,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    levelBadgeText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primaryDark },
    lawnBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(46,204,113,0.14)',
      borderRadius: Radius.full,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    lawnBadgeText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primaryDark },
    notScannedText: { fontSize: FontSize.xs, color: Colors.textMuted },
    healthRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    healthBarBg: {
      flex: 1,
      height: 5,
      backgroundColor: Colors.surfaceElevated,
      borderRadius: Radius.full,
      overflow: 'hidden',
    },
    healthBarFill: { height: '100%', borderRadius: Radius.full },
    healthPctRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    healthPct: { fontSize: FontSize.xs, fontWeight: '700' },
  });
}
