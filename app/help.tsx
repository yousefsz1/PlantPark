import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { TIER_LIMITS } from '../lib/scanLimits';
import { SUPPORT_EMAIL } from '../constants/links';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

const FAQ_ITEMS: { question: string; answer: string; email?: boolean }[] = [
  {
    question: 'How do scan limits work?',
    answer: `Every plant or lawn scan uses your monthly quota. Free includes ${TIER_LIMITS.free} scans/month, Basic ${TIER_LIMITS.basic}, and Pro ${TIER_LIMITS.pro}. A Lawn Health Scan counts as 3 scans, since it analyzes 3 photos in a single request. Your quota resets each month.`,
  },
  {
    question: 'How do membership tiers work?',
    answer: 'Free, Basic, and Pro tiers unlock more monthly scans and features like Lawn Health Scans, which are only available on Basic and Pro. You can compare full plan details and pricing on the Membership screen.',
  },
  {
    question: 'How does the Grass Planner work?',
    answer: "Scan your lawn and Plant Park automatically detects grass instead of a regular plant, then walks you through a short setup (size, sun exposure, and condition) to build a custom watering, fertilizing, and mowing plan. You can also run a Lawn Health Scan any time for a health score and personalized tips.",
  },
  {
    question: 'How do I upgrade or downgrade my plan?',
    answer: 'Go to Profile → Membership to compare plans and change your tier at any time.',
  },
  {
    question: 'How do I contact support?',
    answer: `Email us at ${SUPPORT_EMAIL} and we'll get back to you as soon as we can.`,
    email: true,
  },
];

export default function HelpScreen() {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const router = useRouter();

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
        {FAQ_ITEMS.map((item) => (
          <View key={item.question} style={styles.card}>
            <Text style={styles.question}>{item.question}</Text>
            <Text style={styles.answer}>{item.answer}</Text>
            {item.email ? (
              <TouchableOpacity onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}>
                <Text style={styles.emailLink}>{SUPPORT_EMAIL}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
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
      gap: 6,
    },
    question: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
    answer: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
    emailLink: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.primary, marginTop: 2 },
  });
}
