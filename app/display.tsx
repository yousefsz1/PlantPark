import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Slider from '@react-native-community/slider';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../constants/theme';
import { useTheme, type ThemeMode, type FontScaleMode } from '../contexts/ThemeContext';

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: string }[] = [
  { mode: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { mode: 'light',  label: 'Light',  icon: 'sunny-outline' },
  { mode: 'dark',   label: 'Dark',   icon: 'moon-outline' },
];

const FONT_SCALE_STEPS: FontScaleMode[] = ['small', 'default', 'large', 'extra-large'];

export default function DisplayScreen() {
  const router = useRouter();
  const { Colors, FontSize, themeMode, setThemeMode, fontScaleMode, setFontScaleMode } = useTheme();
  const styles = getStyles(Colors, FontSize);

  const sliderValue = Math.max(0, FONT_SCALE_STEPS.indexOf(fontScaleMode));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Display</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        <View style={styles.themeRow}>
          {THEME_OPTIONS.map(({ mode, label, icon }) => {
            const selected = themeMode === mode;
            return (
              <TouchableOpacity
                key={mode}
                style={[styles.themeCard, selected && styles.themeCardSelected]}
                onPress={() => setThemeMode(mode)}
                activeOpacity={0.8}
              >
                <Ionicons name={icon as any} size={26} color={selected ? Colors.primary : Colors.textSecondary} />
                <Text style={[styles.themeLabel, selected && styles.themeLabelSelected]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Font Size</Text>
        <View style={styles.sliderRow}>
          <Text style={styles.aaSmall}>Aa</Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={FONT_SCALE_STEPS.length - 1}
            step={1}
            value={sliderValue}
            minimumTrackTintColor={Colors.primary}
            maximumTrackTintColor={Colors.surfaceElevated}
            thumbTintColor={Colors.primary}
            onValueChange={(v) => setFontScaleMode(FONT_SCALE_STEPS[Math.round(v)])}
          />
          <Text style={styles.aaLarge}>Aa</Text>
        </View>

        <View style={styles.previewCard}>
          <View style={styles.previewIconWrap}>
            <Ionicons name="water" size={20} color="#4A90D9" />
          </View>
          <View style={styles.previewTextWrap}>
            <Text style={styles.previewTitle}>Time to water your Aloe Vera</Text>
            <Text style={styles.previewBody}>
              Aloe Vera is looking a little thirsty. Tap to mark as watered and earn +15 XP.
            </Text>
          </View>
        </View>
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

    sectionTitle: {
      fontSize: FontSize.sm,
      fontWeight: '600',
      color: Colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: Spacing.lg,
      marginBottom: Spacing.sm,
    },

    // Appearance
    themeRow: { flexDirection: 'row', gap: Spacing.sm },
    themeCard: {
      flex: 1,
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: Colors.surface,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: Colors.border,
      paddingVertical: Spacing.md,
    },
    themeCardSelected: {
      borderColor: Colors.primary,
      backgroundColor: 'rgba(46,204,113,0.1)',
    },
    themeLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
    themeLabelSelected: { color: Colors.primary, fontWeight: '700' },

    // Font size
    sliderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    slider: { flex: 1, height: 40 },
    aaSmall: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
    aaLarge: { fontSize: 22, fontWeight: '600', color: Colors.textMuted },

    // Live preview
    previewCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: Colors.card,
      borderRadius: Radius.lg,
      padding: Spacing.md,
      gap: Spacing.md,
      marginTop: Spacing.md,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    previewIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(74,144,217,0.15)',
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
    },
    previewTextWrap: { flex: 1, gap: 4 },
    previewTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
    previewBody: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  });
}
