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

export default function ToxicitySeverityBar({
  label,
  icon,
  severity,
}: {
  label: string;
  icon: string;
  severity: number;
}) {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const SEVERITY_COLORS = [Colors.xp, Colors.warning, Colors.serious, Colors.danger, '#C0392B'];
  const clamped = Math.max(0, Math.min(5, Math.round(severity)));
  const isToxic = clamped > 0;
  const color = isToxic ? SEVERITY_COLORS[clamped - 1] : Colors.primary;

  return (
    <View style={[styles.card, isToxic ? styles.cardToxic : styles.cardSafe]}>
      <View style={styles.labelRow}>
        <Ionicons name={icon as any} size={14} color={Colors.textMuted} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <View style={styles.barsRow}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View
            key={i}
            style={[styles.bar, { backgroundColor: i <= clamped ? color : Colors.surfaceElevated }]}
          />
        ))}
      </View>
      <Text style={[styles.severityText, { color }]}>{SEVERITY_LABELS[clamped]}</Text>
    </View>
  );
}

function getStyles(Colors: ColorPalette, FontSize: FontSizeScale) {
  return StyleSheet.create({
    card: {
      flex: 1,
      borderRadius: Radius.md,
      borderWidth: 1,
      padding: Spacing.md,
      alignItems: 'center',
      gap: 6,
    },
    cardToxic: { backgroundColor: 'rgba(231,76,60,0.1)', borderColor: Colors.danger },
    cardSafe: { backgroundColor: 'rgba(46,204,113,0.1)', borderColor: Colors.primary },
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    label: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
    barsRow: { flexDirection: 'row', gap: 3 },
    bar: { width: 16, height: 6, borderRadius: 3 },
    severityText: { fontSize: FontSize.xs, fontWeight: '700', textAlign: 'center' },
  });
}
