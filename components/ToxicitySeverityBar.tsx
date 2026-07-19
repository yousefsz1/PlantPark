import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

const SEVERITY_LABELS = [
  'Non-toxic',
  'Mild irritation',
  'Mild danger',
  'Moderate danger',
  'Severe danger',
  'Severe, can be fatal',
];

// Modern pass: neutral card (no loud colored borders), Ionicons in a tinted
// circle instead of emoji PNGs, and a 5-dot danger meter where filled dots =
// danger level — previously "non-toxic" showed 5 filled green pills, which
// read as MORE of something rather than safe.
export default function ToxicitySeverityBar({
  label,
  iconName,
  severity,
}: {
  label: string;
  iconName: string;
  severity: number;
}) {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const SEVERITY_COLORS = [Colors.xp, Colors.warning, Colors.serious, Colors.danger, '#C0392B'];
  const clamped = Math.max(0, Math.min(5, Math.round(severity)));
  const isToxic = clamped > 0;
  const color = isToxic ? SEVERITY_COLORS[clamped - 1] : Colors.primary;

  return (
    <View style={styles.card}>
      <View style={styles.labelRow}>
        <View style={[styles.iconCircle, { backgroundColor: `${color}1F` }]}>
          <Ionicons name={iconName as any} size={14} color={color} />
        </View>
        <Text style={styles.label}>{label}</Text>
      </View>
      <View style={styles.dotsRow}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              // Non-toxic = all 5 dots solid green ("fully safe");
              // toxic = filled dots show the danger level in its color.
              (clamped === 0 || i <= clamped)
                ? { backgroundColor: color }
                : { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: Colors.border },
            ]}
          />
        ))}
      </View>
      <View style={[styles.statusPill, { backgroundColor: `${color}1F` }]}>
        {!isToxic && <Ionicons name="checkmark-circle" size={12} color={color} />}
        <Text style={[styles.statusPillText, { color }]}>{SEVERITY_LABELS[clamped]}</Text>
      </View>
    </View>
  );
}

function getStyles(Colors: ColorPalette, FontSize: FontSizeScale) {
  return StyleSheet.create({
    card: {
      width: '47%',
      minHeight: 104,
      borderRadius: Radius.md,
      backgroundColor: Colors.surfaceElevated,
      padding: Spacing.md,
      gap: Spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    iconCircle: {
      width: 26,
      height: 26,
      borderRadius: 13,
      justifyContent: 'center',
      alignItems: 'center',
    },
    label: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '600' },
    dotsRow: { flexDirection: 'row', gap: 6 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
      borderRadius: Radius.full,
    },
    statusPillText: { fontSize: FontSize.xs, fontWeight: '700' },
  });
}
