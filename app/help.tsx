import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { TIER_LIMITS } from '../lib/scanLimits';
import { WATER_COLOR } from '../lib/careLevels';
import { SUPPORT_EMAIL } from '../constants/links';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

type FaqItem = {
  question: string;
  answer: string;
  icon?: string;
  iconColor?: string;
  iconBg?: string;
  useGrassIcon?: boolean;
};

function getFaqItems(Colors: ColorPalette): FaqItem[] {
  return [
    {
      question: 'How do scan limits work?',
      answer: `Every plant or lawn scan uses your monthly quota. Free includes ${TIER_LIMITS.free} scans/month, Basic ${TIER_LIMITS.basic}, and Pro ${TIER_LIMITS.pro}. A Lawn Health Scan counts as 3 scans, since it analyzes 3 photos in a single request. Your quota resets each month.`,
      icon: 'scan-outline',
      iconColor: WATER_COLOR,
      iconBg: `${WATER_COLOR}26`,
    },
    {
      question: 'How do membership tiers work?',
      answer: 'Free, Basic, and Pro tiers unlock more monthly scans and features like Lawn Health Scans, which are only available on Basic and Pro. You can compare full plan details and pricing on the Membership screen.',
      icon: 'card-outline',
      iconColor: Colors.rare,
      iconBg: 'rgba(155,89,182,0.15)',
    },
    {
      question: 'How does the Grass Planner work?',
      answer: "Scan your lawn and Plant Park automatically detects grass instead of a regular plant, then walks you through a short setup (size, sun exposure, and condition) to build a custom watering, fertilizing, and mowing plan. You can also run a Lawn Health Scan any time for a health score and personalized tips.",
      useGrassIcon: true,
      iconBg: 'rgba(46,204,113,0.15)',
    },
    {
      question: 'How do I upgrade or downgrade my plan?',
      answer: 'Go to Profile → Membership to compare plans and change your tier at any time.',
      icon: 'swap-horizontal-outline',
      iconColor: Colors.xp,
      iconBg: `${Colors.xp}26`,
    },
  ];
}

export default function HelpScreen() {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const router = useRouter();
  const faqItems = getFaqItems(Colors);
  const [openQuestions, setOpenQuestions] = useState<Set<string>>(new Set());

  const toggle = (question: string) => {
    setOpenQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(question)) next.delete(question);
      else next.add(question);
      return next;
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & FAQ</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {faqItems.map((item) => {
          const isOpen = openQuestions.has(item.question);
          return (
            <TouchableOpacity
              key={item.question}
              style={styles.card}
              onPress={() => toggle(item.question)}
              activeOpacity={0.8}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.iconWrap, { backgroundColor: item.iconBg }]}>
                  {item.useGrassIcon ? (
                    <Image
                      source={require('../assets/illustrations/grass-icon.png')}
                      style={styles.grassIcon}
                      resizeMode="contain"
                    />
                  ) : (
                    <Ionicons name={item.icon as any} size={18} color={item.iconColor} />
                  )}
                </View>
                <Text style={styles.question}>{item.question}</Text>
                <Ionicons
                  name={isOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={Colors.textMuted}
                />
              </View>
              {isOpen ? <Text style={styles.answer}>{item.answer}</Text> : null}
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={styles.supportCard}
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          activeOpacity={0.85}
        >
          <View style={[styles.iconWrap, { backgroundColor: 'rgba(46,204,113,0.15)' }]}>
            <Ionicons name="mail-outline" size={18} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.supportTitle}>Email Support</Text>
            <Text style={styles.supportEmail}>{SUPPORT_EMAIL}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
        </TouchableOpacity>
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

    card: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.md,
      padding: Spacing.md,
      marginBottom: Spacing.sm,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },
    grassIcon: { width: 18, height: 18 },
    question: { flex: 1, fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
    answer: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, marginTop: Spacing.sm },

    supportCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: Colors.surface,
      borderRadius: Radius.md,
      padding: Spacing.md,
      marginTop: Spacing.sm,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    supportTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
    supportEmail: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  });
}
