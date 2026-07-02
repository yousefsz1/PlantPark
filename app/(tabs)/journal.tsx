import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import type { JournalEntryWithPlant } from '../../types/database';
import { Colors, Spacing, Radius, FontSize } from '../../constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type EntryType = JournalEntryWithPlant['entry_type'];
type DateGroup  = { label: string; entries: JournalEntryWithPlant[] };

// ─── Config ───────────────────────────────────────────────────────────────────

const ENTRY_CONFIG: Record<EntryType, {
  icon:    string;
  color:   string;
  bgColor: string;
}> = {
  added:        { icon: 'leaf',           color: Colors.primary, bgColor: 'rgba(46,204,113,0.15)'  },
  watered:      { icon: 'water',          color: '#4A90D9',      bgColor: 'rgba(74,144,217,0.15)'  },
  fertilized:   { icon: 'leaf',           color: '#E67E22',      bgColor: 'rgba(230,126,34,0.15)'  },
  misted:       { icon: 'cloudy-outline', color: '#6BB5C5',      bgColor: 'rgba(107,181,197,0.15)' },
  level_up:     { icon: 'trophy',         color: '#F4D03F',      bgColor: 'rgba(244,208,63,0.15)'  },
  health_issue: { icon: 'warning',        color: Colors.warning, bgColor: 'rgba(243,156,18,0.15)'  },
  note:         { icon: 'pencil-outline', color: Colors.textMuted, bgColor: 'rgba(107,158,128,0.12)' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateGroupLabel(created_at: string): string {
  const d = new Date(created_at);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff <= 6)  return 'This week';
  if (diff <= 29) return 'Earlier this month';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function groupByDate(entries: JournalEntryWithPlant[]): DateGroup[] {
  const groups = new Map<string, JournalEntryWithPlant[]>();
  for (const entry of entries) {
    const label = dateGroupLabel(entry.created_at);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(entry);
  }
  return Array.from(groups.entries()).map(([label, entries]) => ({ label, entries }));
}

function extractXP(message: string): number | null {
  const m = message.match(/\+(\d+) XP/);
  return m ? parseInt(m[1], 10) : null;
}

function entryTime(created_at: string): string {
  return new Date(created_at).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  });
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function JournalScreen() {
  const [entries, setEntries]       = useState<JournalEntryWithPlant[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoaded = useRef(false);

  const fetchEntries = useCallback(async () => {
    const { data } = await supabase
      .from('journal_entries')
      .select('*, plants(id, name, photo_url)')
      .order('created_at', { ascending: false })
      .limit(150);
    setEntries((data ?? []) as JournalEntryWithPlant[]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!hasLoaded.current) setLoading(true);
      fetchEntries().finally(() => {
        setLoading(false);
        hasLoaded.current = true;
      });
    }, [fetchEntries]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchEntries();
    setRefreshing(false);
  }, [fetchEntries]);

  const groups = groupByDate(entries);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Journal</Text>
          <Text style={styles.subtitle}>Your plant care activity</Text>
        </View>

        {/* Body */}
        {loading ? (
          <ActivityIndicator size="large" color={Colors.primary} style={styles.loader} />
        ) : entries.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="leaf-outline" size={40} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No activity yet</Text>
            <Text style={styles.emptySubtitle}>
              Scan or water a plant to start earning rewards!
            </Text>
          </View>
        ) : (
          groups.map(group => (
            <View key={group.label}>
              <Text style={styles.dateLabel}>{group.label}</Text>
              {group.entries.map(entry => {
                const cfg  = ENTRY_CONFIG[entry.entry_type] ?? ENTRY_CONFIG.note;
                const xp   = extractXP(entry.message);
                const isLevelUp = entry.entry_type === 'level_up';
                const isIssue   = entry.entry_type === 'health_issue';

                return (
                  <View
                    key={entry.id}
                    style={[
                      styles.entryCard,
                      isLevelUp && styles.entryCardLevelUp,
                      isIssue   && styles.entryCardIssue,
                    ]}
                  >
                    {/* Left: photo or icon */}
                    <View style={styles.avatarWrap}>
                      {entry.plants?.photo_url ? (
                        <>
                          <Image
                            source={{ uri: entry.plants.photo_url }}
                            style={styles.plantThumb}
                            resizeMode="cover"
                          />
                          {/* Entry-type badge overlaid on photo corner */}
                          <View style={[styles.iconBadge, { backgroundColor: cfg.color }]}>
                            <Ionicons name={cfg.icon as any} size={10} color="#FFFFFF" />
                          </View>
                        </>
                      ) : (
                        <View style={[styles.iconCircle, { backgroundColor: cfg.bgColor }]}>
                          <Ionicons name={cfg.icon as any} size={22} color={cfg.color} />
                        </View>
                      )}
                    </View>

                    {/* Middle: message + meta */}
                    <View style={styles.entryBody}>
                      <Text style={styles.entryMessage}>{entry.message}</Text>
                      <View style={styles.entryMeta}>
                        {entry.plants?.name ? (
                          <>
                            <Text style={[styles.entryPlantName, { color: cfg.color }]}>
                              {entry.plants.name}
                            </Text>
                            <Text style={styles.entryMetaDot}>·</Text>
                          </>
                        ) : null}
                        <Text style={styles.entryTime}>{entryTime(entry.created_at)}</Text>
                      </View>
                    </View>

                    {/* Right: XP badge or level-up star */}
                    {xp !== null ? (
                      <View style={[styles.xpBadge, isLevelUp && styles.xpBadgeLevelUp]}>
                        <Text style={[styles.xpBadgeText, isLevelUp && styles.xpBadgeTextLevelUp]}>
                          +{xp} XP
                        </Text>
                      </View>
                    ) : isLevelUp ? (
                      <View style={styles.levelUpStar}>
                        <Ionicons name="star" size={18} color="#F4D03F" />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  loader:  { marginTop: 80 },

  // Header
  header: { marginBottom: Spacing.lg },
  title:    { fontSize: FontSize.hero, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(46,204,113,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(46,204,113,0.25)',
  },
  emptyTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
  },

  // Date group labels
  dateLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },

  // Entry cards
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  entryCardLevelUp: {
    borderColor: 'rgba(244,208,63,0.45)',
    backgroundColor: 'rgba(244,208,63,0.05)',
  },
  entryCardIssue: {
    borderColor: 'rgba(243,156,18,0.35)',
    backgroundColor: 'rgba(243,156,18,0.04)',
  },

  // Avatar (photo or icon)
  avatarWrap: { position: 'relative', flexShrink: 0 },
  plantThumb: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceElevated,
  },
  iconBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Entry body
  entryBody:      { flex: 1, gap: 3 },
  entryMessage:   { fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 19 },
  entryMeta:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  entryPlantName: { fontSize: FontSize.xs, fontWeight: '600' },
  entryMetaDot:   { fontSize: FontSize.xs, color: Colors.textMuted },
  entryTime:      { fontSize: FontSize.xs, color: Colors.textMuted },

  // XP badge
  xpBadge: {
    backgroundColor: 'rgba(244,208,63,0.12)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(244,208,63,0.3)',
    flexShrink: 0,
  },
  xpBadgeLevelUp: {
    backgroundColor: 'rgba(244,208,63,0.2)',
    borderColor: 'rgba(244,208,63,0.6)',
  },
  xpBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.xp,
  },
  xpBadgeTextLevelUp: { color: '#F4D03F' },

  // Level-up star (when there's no XP in the message)
  levelUpStar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(244,208,63,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
});
