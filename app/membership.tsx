import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { getScanStatus, TIER_LIMITS, type MembershipTier } from '../lib/scanLimits';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

type TierInfo = {
  id: MembershipTier;
  name: string;
  price: string;
  tagline: string;
  benefits: string[];
};

const TIERS: TierInfo[] = [
  {
    id: 'free',
    name: 'Free',
    price: 'Free',
    tagline: `${TIER_LIMITS.free} scans/month`,
    benefits: [
      'AI plant identification & health checks',
      'Care schedules & watering reminders',
      'XP, levels, and badges',
    ],
  },
  {
    id: 'basic',
    name: 'Basic',
    price: '$2.99/month or $19.99/year',
    tagline: `${TIER_LIMITS.basic} scans/month`,
    benefits: [
      'Everything in Free',
      '10x more scans than Free',
      'Lawn & Grass Care Planning (AI health scans + care plans)',
      'Smart Watering (rain-aware auto-watering)',
      'Priority customer support',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$4.99/month or $34.99/year',
    tagline: `${TIER_LIMITS.pro} scans/month (effectively unlimited)`,
    benefits: [
      'Everything in Basic',
      'Highest scan limit of any plan',
      'First access to future premium features',
    ],
  },
];

function handleUpgrade() {
  Alert.alert('Coming Soon', 'Payments coming soon — check back shortly to upgrade your plan!');
}

export default function MembershipScreen() {
  const router = useRouter();
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const [currentTier, setCurrentTier] = useState<MembershipTier>('free');
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      getScanStatus().then((status) => {
        if (cancelled) return;
        setCurrentTier(status?.tier ?? 'free');
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Membership</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.intro}>Choose the plan that fits how often you scan.</Text>

          {TIERS.map((tier) => {
            const isCurrent = tier.id === currentTier;
            return (
              <View key={tier.id} style={[styles.card, isCurrent && styles.cardCurrent]}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderText}>
                    <Text style={styles.tierName}>{tier.name}</Text>
                    <Text style={styles.tierPrice}>{tier.price}</Text>
                  </View>
                  {isCurrent && (
                    <View style={styles.currentBadge}>
                      <Ionicons name="checkmark-circle" size={13} color={Colors.primary} />
                      <Text style={styles.currentBadgeText}>Current Plan</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.tagline}>{tier.tagline}</Text>

                <View style={styles.benefitsList}>
                  {tier.benefits.map((benefit) => (
                    <View key={benefit} style={styles.benefitRow}>
                      <Ionicons name="checkmark" size={15} color={Colors.primary} />
                      <Text style={styles.benefitText}>{benefit}</Text>
                    </View>
                  ))}
                </View>

                {!isCurrent && (
                  <TouchableOpacity style={styles.upgradeBtn} onPress={handleUpgrade} activeOpacity={0.85}>
                    <Text style={styles.upgradeBtnText}>Upgrade</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function getStyles(Colors: ColorPalette, FontSize: FontSizeScale) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

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

    content: { padding: Spacing.md, paddingBottom: Spacing.xxl, gap: Spacing.md },
    intro: {
      fontSize: FontSize.sm,
      color: Colors.textSecondary,
      textAlign: 'center',
      marginBottom: Spacing.xs,
    },

    card: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.lg,
      padding: Spacing.md,
      borderWidth: 1,
      borderColor: Colors.border,
      gap: Spacing.sm,
    },
    cardCurrent: {
      borderWidth: 1.5,
      borderColor: Colors.primary,
      backgroundColor: 'rgba(46,204,113,0.08)',
    },

    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    cardHeaderText: { flex: 1, gap: 2 },
    tierName: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
    tierPrice: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.primary },

    currentBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: Colors.surfaceElevated,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      borderRadius: Radius.full,
    },
    currentBadgeText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },

    tagline: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },

    benefitsList: { gap: 6 },
    benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs },
    benefitText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19 },

    upgradeBtn: {
      backgroundColor: Colors.primary,
      borderRadius: Radius.full,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: Spacing.xs,
    },
    upgradeBtnText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  });
}
