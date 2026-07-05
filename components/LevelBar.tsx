import { View, StyleSheet } from 'react-native';

// Bare 5-segment bar indicator — same bar dimensions/unfilled color as
// ToxicitySeverityBar's severity bars, but with no card/icon/label of its
// own, so it can drop into an existing card (e.g. the Watering/Sunlight
// info-grid items) instead of rendering its own container.
export default function LevelBar({ level, color }: { level: number; color: string }) {
  const clamped = Math.max(0, Math.min(5, Math.round(level)));
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View
          key={i}
          style={[styles.bar, { backgroundColor: i <= clamped ? color : 'rgba(128,128,128,0.4)' }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 5, marginTop: 4 },
  bar: { width: 18, height: 10, borderRadius: 5 },
});
