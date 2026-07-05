import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import type { Plant } from '../types/database';

function getMood(health: number, Colors: ColorPalette): { icon: 'happy' | 'remove-circle-outline' | 'sad-outline'; color: string } {
  if (health >= 80) return { icon: 'happy',                 color: Colors.primary };
  if (health >= 50) return { icon: 'remove-circle-outline', color: Colors.warning };
  return               { icon: 'sad-outline',               color: Colors.danger  };
}

// Pure presentational plant card — no touch handling of its own, so callers
// (the swipeable row on the Garden screen, the plain list on a Space's
// detail screen) can wrap it in whatever Touchable/gesture behavior they
// need without nesting Touchables.
export default function PlantCard({ plant, displayHealth }: { plant: Plant; displayHealth?: number }) {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const health = displayHealth ?? plant.health_percent;
  const { icon: moodIcon, color } = getMood(health, Colors);

  return (
    <View style={styles.plantCard}>
      {plant.photo_url ? (
        <Image source={{ uri: plant.photo_url }} style={styles.plantPhoto} resizeMode="cover" />
      ) : (
        <View style={styles.plantMoodWrap}>
          <Ionicons name={moodIcon} size={26} color={color} />
        </View>
      )}
      <View style={styles.plantInfo}>
        <View style={styles.plantRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.plantName}>{plant.name}</Text>
            {plant.species ? <Text style={styles.plantSpecies}>{plant.species}</Text> : null}
          </View>
          <View style={styles.levelBadge}>
            <Text style={styles.levelBadgeText}>Lv {plant.level}</Text>
          </View>
        </View>
        <View style={styles.healthRow}>
          <View style={styles.healthBarBg}>
            <View style={[styles.healthBarFill, { width: `${health}%`, backgroundColor: color }]} />
          </View>
          <Text style={[styles.healthPct, { color }]}>{health}%</Text>
        </View>
      </View>
    </View>
  );
}

function getStyles(Colors: ColorPalette, FontSize: FontSizeScale) {
  return StyleSheet.create({
    plantCard: {
      flexDirection: 'row',
      backgroundColor: Colors.card,
      borderRadius: Radius.lg,
      padding: Spacing.md,
      gap: Spacing.md,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    plantPhoto: {
      width: 52,
      height: 52,
      borderRadius: Radius.md,
      backgroundColor: Colors.surfaceElevated,
    },
    plantMoodWrap: {
      width: 52,
      height: 52,
      borderRadius: Radius.md,
      backgroundColor: Colors.surfaceElevated,
      justifyContent: 'center',
      alignItems: 'center',
    },
    plantInfo: { flex: 1, gap: 6 },
    plantRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    plantName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
    plantSpecies: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },
    levelBadge: {
      backgroundColor: Colors.primaryDark,
      borderRadius: Radius.full,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    levelBadgeText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textPrimary },
    healthRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    healthBarBg: {
      flex: 1,
      height: 5,
      backgroundColor: Colors.surfaceElevated,
      borderRadius: Radius.full,
      overflow: 'hidden',
    },
    healthBarFill: { height: '100%', borderRadius: Radius.full },
    healthPct: { fontSize: FontSize.xs, fontWeight: '700', minWidth: 32, textAlign: 'right' },
  });
}
