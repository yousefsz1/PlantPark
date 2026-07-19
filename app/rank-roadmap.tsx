import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LEVELS, getLevel } from '../lib/levels';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

export default function RankRoadmapScreen() {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const router = useRouter();
  const params = useLocalSearchParams<{ totalXP?: string }>();
  const totalXP = Number(params.totalXP) || 0;
  const currentLevel = getLevel(totalXP);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rank Roadmap</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>{totalXP.toLocaleString()} XP earned</Text>

        {/* Global Ranking entry — labeled button, clearer than a bare icon */}
        <TouchableOpacity style={styles.globalRankingBtn} onPress={() => router.push('/leaderboard')} activeOpacity={0.8}>
          <View style={styles.globalRankingIconWrap}>
            <Ionicons name="trophy" size={18} color="#F4D03F" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.globalRankingTitle}>Global Ranking</Text>
            <Text style={styles.globalRankingSubtitle}>See the top 100 gardeners worldwide</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </TouchableOpacity>

        {LEVELS.map((lvl) => {
          const isCompleted = lvl.minXP < currentLevel.minXP;
          const isCurrent = lvl.minXP === currentLevel.minXP;
          const isLocked = lvl.minXP > currentLevel.minXP;

          return (
            <View
              key={lvl.name}
              style={[styles.tierCard, isCurrent && styles.tierCardCurrent, isLocked && styles.tierCardLocked]}
            >
              <View
                style={[
                  styles.tierIconWrap,
                  isCurrent && styles.tierIconWrapCurrent,
                  isLocked && styles.tierIconWrapLocked,
                ]}
              >
                <Ionicons
                  name={(isLocked ? 'lock-closed' : lvl.icon) as any}
                  size={20}
                  color={isLocked ? Colors.textMuted : isCurrent ? '#FFFFFF' : Colors.primary}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.tierName, isLocked && styles.tierNameLocked]}>{lvl.name}</Text>
                <Text style={styles.tierThreshold}>
                  {lvl.maxXP === Infinity
                    ? `${lvl.minXP.toLocaleString()}+ XP`
                    : `${lvl.minXP.toLocaleString()}–${lvl.maxXP.toLocaleString()} XP`}
                </Text>
              </View>

              {isCompleted ? <Ionicons name="checkmark-circle" size={22} color={Colors.primary} /> : null}
              {isCurrent ? (
                <View style={styles.hereBadge}>
                  <Text style={styles.hereBadgeText}>You are here</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function getStyles(Colors: ColorPalette, FontSize: FontSizeScale) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.background },

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

    globalRankingBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      backgroundColor: Colors.surface,
      borderRadius: Radius.md,
      padding: Spacing.md,
      marginBottom: Spacing.md,
      borderWidth: 1.5,
      borderColor: '#F4D03F',
    },
    globalRankingIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(244,208,63,0.15)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    globalRankingTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
    globalRankingSubtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },

    tierCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      backgroundColor: Colors.surface,
      borderRadius: Radius.md,
      padding: Spacing.md,
      marginBottom: Spacing.sm,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    tierCardCurrent: {
      borderColor: Colors.primary,
      borderWidth: 1.5,
      backgroundColor: 'rgba(46,204,113,0.08)',
    },
    tierCardLocked: { opacity: 0.5 },

    tierIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(46,204,113,0.15)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    tierIconWrapCurrent: { backgroundColor: Colors.primary },
    tierIconWrapLocked: { backgroundColor: Colors.surfaceElevated },

    tierName: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
    tierNameLocked: { color: Colors.textMuted },
    tierThreshold: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },

    hereBadge: {
      backgroundColor: Colors.primary,
      borderRadius: Radius.full,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    hereBadgeText: { fontSize: FontSize.xs, fontWeight: '700', color: '#FFFFFF' },
  });
}
