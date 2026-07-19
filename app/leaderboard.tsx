import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { getLevel } from '../lib/levels';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

type LeaderboardEntry = { is_me: boolean; name: string; avatar_url?: string | null; total_xp: number };
type LeaderboardData = { top: LeaderboardEntry[]; my_rank: number; my_xp: number };

const MEDAL_COLORS = ['#F4D03F', '#B4B2A9', '#D08A4E']; // gold, silver, bronze

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function LeaderboardScreen() {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const router = useRouter();
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    const { data: result, error: rpcErr } = await supabase.rpc('get_leaderboard');
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setData(result as LeaderboardData);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData().finally(() => setLoading(false));
    }, [fetchData]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const inTop20 = data?.top.some(e => e.is_me) ?? false;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Global Ranking</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); fetchData().finally(() => setLoading(false)); }}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
          <Text style={styles.subtitle}>Top 100 gardeners worldwide</Text>

          {data?.top.map((entry, i) => {
            const rank = i + 1;
            const level = getLevel(entry.total_xp);
            const isMedal = rank <= 3;
            return (
              <View key={`${rank}-${entry.name}`} style={[styles.row, entry.is_me && styles.rowMe]}>
                <View style={styles.rankWrap}>
                  {/* Every row shows its rank number; top 3 in gold/silver/bronze */}
                  <Text style={[styles.rankText, isMedal && { color: MEDAL_COLORS[rank - 1], fontSize: FontSize.md }]}>
                    {rank}
                  </Text>
                </View>
                {entry.avatar_url ? (
                  <Image source={{ uri: entry.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, entry.is_me && { backgroundColor: Colors.primary }]}>
                    <Text style={[styles.avatarText, entry.is_me && { color: '#FFFFFF' }]}>{initials(entry.name)}</Text>
                  </View>
                )}
                <View style={styles.rowInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>{entry.name}</Text>
                    {entry.is_me && (
                      <View style={styles.youBadge}>
                        <Text style={styles.youBadgeText}>You</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.levelText}>{level.name}</Text>
                </View>
                <Text style={styles.xpText}>{entry.total_xp.toLocaleString()} XP</Text>
              </View>
            );
          })}

          {!inTop20 && data ? (
            <View style={styles.myRankCard}>
              <Text style={styles.myRankLabel}>Your position</Text>
              <View style={styles.myRankRow}>
                <Text style={styles.myRankNumber}>#{data.my_rank.toLocaleString()}</Text>
                <Text style={styles.levelText}>{getLevel(data.my_xp).name}</Text>
                <Text style={styles.xpText}>{data.my_xp.toLocaleString()} XP</Text>
              </View>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function getStyles(Colors: ColorPalette, FontSize: FontSizeScale) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.sm, padding: Spacing.xl },

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

    content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
    subtitle: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.md },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: Colors.surface,
      borderRadius: Radius.md,
      padding: Spacing.md,
      marginBottom: Spacing.sm,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    rowMe: {
      borderColor: Colors.primary,
      borderWidth: 1.5,
      backgroundColor: 'rgba(46,204,113,0.08)',
    },
    rankWrap: { width: 28, alignItems: 'center' },
    rankText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textMuted },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: Colors.surfaceElevated,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },
    rowInfo: { flex: 1, gap: 2 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    name: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary, flexShrink: 1 },
    youBadge: {
      backgroundColor: Colors.primary,
      borderRadius: Radius.full,
      paddingHorizontal: 7,
      paddingVertical: 1,
    },
    youBadgeText: { fontSize: FontSize.xs, fontWeight: '700', color: '#FFFFFF' },
    levelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    levelText: { fontSize: FontSize.xs, color: Colors.textSecondary },
    xpText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.xp },

    myRankCard: {
      marginTop: Spacing.sm,
      backgroundColor: Colors.surface,
      borderRadius: Radius.md,
      padding: Spacing.md,
      borderWidth: 1.5,
      borderColor: Colors.primary,
      gap: Spacing.xs,
    },
    myRankLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
    myRankRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    myRankNumber: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.primary },

    errorText: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
    retryBtn: {
      marginTop: Spacing.sm,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      backgroundColor: Colors.surfaceElevated,
      borderRadius: Radius.md,
    },
    retryText: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: '600' },
  });
}
