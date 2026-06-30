import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize } from '../../constants/theme';

const BADGES = [
  { id: '1', icon: 'leaf',    label: 'First Plant', unlocked: true },
  { id: '2', icon: 'flame',   label: '7-Day Streak', unlocked: true },
  { id: '3', icon: 'trophy',  label: 'Level 5',     unlocked: true },
  { id: '4', icon: 'star',    label: 'Rare Find',   unlocked: false },
  { id: '5', icon: 'ribbon',  label: 'Expert',      unlocked: false },
  { id: '6', icon: 'diamond', label: 'Legendary',   unlocked: false },
] as const;

const MENU_ITEMS = [
  { icon: 'settings-outline',       label: 'Settings' },
  { icon: 'notifications-outline',  label: 'Reminders' },
  { icon: 'share-social-outline',   label: 'Share Profile' },
  { icon: 'help-circle-outline',    label: 'Help & FAQ' },
] as const;

export default function ProfileScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Avatar & name */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={40} color={Colors.primary} />
          </View>
          <Text style={styles.username}>PlantPal Trainer</Text>
          <View style={styles.rankBadge}>
            <Ionicons name="leaf" size={12} color={Colors.primary} />
            <Text style={styles.rankText}>Green Thumb • Rank 3</Text>
          </View>
        </View>

        {/* XP progress */}
        <View style={styles.xpCard}>
          <View style={styles.xpRow}>
            <Text style={styles.xpLabel}>1,140 XP</Text>
            <Text style={styles.xpNext}>Next rank at 2,000 XP</Text>
          </View>
          <View style={styles.xpBarBg}>
            <View style={[styles.xpBarFill, { width: '57%' }]} />
          </View>
        </View>

        {/* Badges */}
        <Text style={styles.sectionTitle}>Badges</Text>
        <View style={styles.badgesGrid}>
          {BADGES.map((b) => (
            <View key={b.id} style={[styles.badge, !b.unlocked && styles.badgeLocked]}>
              <Ionicons
                name={b.icon as any}
                size={24}
                color={b.unlocked ? Colors.xp : Colors.textMuted}
              />
              <Text style={[styles.badgeLabel, !b.unlocked && styles.badgeLabelLocked]}>
                {b.label}
              </Text>
            </View>
          ))}
        </View>

        {/* Menu */}
        <Text style={styles.sectionTitle}>Account</Text>
        {MENU_ITEMS.map((item) => (
          <TouchableOpacity key={item.label} style={styles.menuRow}>
            <Ionicons name={item.icon as any} size={20} color={Colors.textSecondary} />
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },

  avatarSection: { alignItems: 'center', marginVertical: Spacing.lg },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  username: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  rankText: { fontSize: FontSize.sm, color: Colors.textSecondary },

  xpCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  xpRow: { flexDirection: 'row', justifyContent: 'space-between' },
  xpLabel: { fontSize: FontSize.md, fontWeight: '700', color: Colors.xp },
  xpNext: { fontSize: FontSize.xs, color: Colors.textMuted },
  xpBarBg: {
    height: 6,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  xpBarFill: { height: '100%', backgroundColor: Colors.xp, borderRadius: Radius.full },

  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },

  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  badge: {
    width: '30%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  badgeLocked: { opacity: 0.4 },
  badgeLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center' },
  badgeLabelLocked: { color: Colors.textMuted },

  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  menuLabel: { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary },
});
