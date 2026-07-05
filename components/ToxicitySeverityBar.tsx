import { View, Text, Image, StyleSheet, type ImageSourcePropType } from 'react-native';
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
  icon: ImageSourcePropType;
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
        <Image source={icon} style={styles.icon} resizeMode="contain" />
        <Text style={styles.label}>{label}</Text>
      </View>
      <View style={styles.barsRow}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View
            key={i}
            style={[styles.bar, { backgroundColor: (clamped === 0 || i <= clamped) ? color : 'rgba(128,128,128,0.4)' }]}
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
      width: '47%',
      minHeight: 104,
      borderRadius: Radius.md,
      borderWidth: 1,
      padding: Spacing.md,
      gap: 4,
    },
    cardToxic: { backgroundColor: 'rgba(231,76,60,0.1)', borderColor: Colors.danger },
    cardSafe: { backgroundColor: 'rgba(46,204,113,0.1)', borderColor: Colors.primary },
    labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
    icon: { width: 24, height: 24 },
    label: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
    barsRow: { flexDirection: 'row', justifyContent: 'center', gap: 5 },
    bar: { width: 18, height: 10, borderRadius: 5 },
    severityText: { fontSize: FontSize.xs, fontWeight: '700', textAlign: 'center' },
  });
}
