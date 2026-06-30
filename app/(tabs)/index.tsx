import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize } from '../../constants/theme';

const PLACEHOLDER_PLANTS = [
  { id: '1', name: 'Monstera', level: 5, health: 92, xp: 340 },
  { id: '2', name: 'Fiddle Leaf Fig', level: 3, health: 78, xp: 120 },
  { id: '3', name: 'Snake Plant', level: 7, health: 99, xp: 680 },
];

function XPBar({ value }: { value: number }) {
  return (
    <View style={styles.xpBarBg}>
      <View style={[styles.xpBarFill, { width: `${value}%` }]} />
    </View>
  );
}

function PlantCard({ name, level, health, xp }: (typeof PLACEHOLDER_PLANTS)[0]) {
  return (
    <View style={styles.plantCard}>
      <View style={styles.plantIconWrapper}>
        <Ionicons name="leaf" size={28} color={Colors.primary} />
      </View>
      <View style={styles.plantInfo}>
        <View style={styles.plantRow}>
          <Text style={styles.plantName}>{name}</Text>
          <View style={styles.levelBadge}>
            <Text style={styles.levelText}>Lv {level}</Text>
          </View>
        </View>
        <Text style={styles.healthLabel}>Health {health}%</Text>
        <XPBar value={xp / 10} />
        <Text style={styles.xpText}>{xp} XP</Text>
      </View>
    </View>
  );
}

export default function GardenScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good morning 🌱</Text>
            <Text style={styles.title}>My Garden</Text>
          </View>
          <TouchableOpacity style={styles.addBtn}>
            <Ionicons name="add" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="trophy" size={20} color={Colors.xp} />
            <Text style={styles.statValue}>1,140</Text>
            <Text style={styles.statLabel}>Total XP</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="leaf" size={20} color={Colors.primary} />
            <Text style={styles.statValue}>{PLACEHOLDER_PLANTS.length}</Text>
            <Text style={styles.statLabel}>Plants</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="flame" size={20} color={Colors.warning} />
            <Text style={styles.statValue}>7</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
        </View>

        {/* Plant list */}
        <Text style={styles.sectionTitle}>Your Plants</Text>
        {PLACEHOLDER_PLANTS.map((p) => (
          <PlantCard key={p.id} {...p} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  greeting: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: 2 },
  title: { fontSize: FontSize.hero, fontWeight: '700', color: Colors.textPrimary },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },

  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statValue: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  statLabel: { fontSize: FontSize.xs, color: Colors.textMuted },

  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  plantCard: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  plantIconWrapper: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  plantInfo: { flex: 1, gap: 4 },
  plantRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  plantName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  levelBadge: {
    backgroundColor: Colors.primaryDark,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  levelText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textPrimary },
  healthLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  xpBarBg: {
    height: 4,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    overflow: 'hidden',
    marginTop: 2,
  },
  xpBarFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: Radius.full },
  xpText: { fontSize: FontSize.xs, color: Colors.textMuted },
});
