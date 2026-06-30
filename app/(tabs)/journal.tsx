import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize } from '../../constants/theme';

const PLACEHOLDER_ENTRIES = [
  {
    id: '1',
    plant: 'Monstera',
    date: 'Jun 30',
    type: 'watered',
    icon: 'water' as const,
    note: 'Leaves looking vibrant and healthy.',
  },
  {
    id: '2',
    plant: 'Snake Plant',
    date: 'Jun 28',
    type: 'fertilized',
    icon: 'nutrition' as const,
    note: 'Added slow-release fertilizer pellets.',
  },
  {
    id: '3',
    plant: 'Fiddle Leaf Fig',
    date: 'Jun 25',
    type: 'repotted',
    icon: 'flower' as const,
    note: 'Moved to a larger pot — roots were overcrowded.',
  },
];

export default function JournalScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Journal</Text>
          <TouchableOpacity style={styles.addBtn}>
            <Ionicons name="add" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Recent Care Logs</Text>

        {PLACEHOLDER_ENTRIES.map((entry) => (
          <View key={entry.id} style={styles.entryCard}>
            <View style={styles.iconCircle}>
              <Ionicons name={entry.icon} size={20} color={Colors.primary} />
            </View>
            <View style={styles.entryBody}>
              <View style={styles.entryRow}>
                <Text style={styles.entryPlant}>{entry.plant}</Text>
                <Text style={styles.entryDate}>{entry.date}</Text>
              </View>
              <Text style={styles.entryNote}>{entry.note}</Text>
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.newEntryBtn}>
          <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
          <Text style={styles.newEntryText}>Log a care activity</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: { fontSize: FontSize.hero, fontWeight: '700', color: Colors.textPrimary },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  entryCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  entryBody: { flex: 1 },
  entryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  entryPlant: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  entryDate: { fontSize: FontSize.xs, color: Colors.textMuted },
  entryNote: { fontSize: FontSize.sm, color: Colors.textSecondary },
  newEntryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
  },
  newEntryText: { fontSize: FontSize.md, color: Colors.primary, fontWeight: '600' },
});
