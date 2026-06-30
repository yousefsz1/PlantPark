import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize } from '../../constants/theme';

export default function ScanScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.title}>Scan Plant</Text>
        <Text style={styles.subtitle}>Identify a plant and add it to your garden</Text>

        <View style={styles.viewfinder}>
          <View style={styles.corner} />
          <Ionicons name="leaf" size={64} color={Colors.primary} style={styles.icon} />
          <Text style={styles.hint}>Point at a plant to identify it</Text>
        </View>

        <TouchableOpacity style={styles.scanBtn}>
          <Ionicons name="scan" size={28} color={Colors.textPrimary} />
          <Text style={styles.scanBtnText}>Open Camera</Text>
        </TouchableOpacity>

        <Text style={styles.orText}>— or —</Text>

        <TouchableOpacity style={styles.secondaryBtn}>
          <Ionicons name="image-outline" size={20} color={Colors.primary} />
          <Text style={styles.secondaryBtnText}>Choose from Library</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.lg,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: Spacing.md,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xl,
  },
  viewfinder: {
    width: 260,
    height: 260,
    borderRadius: Radius.xl,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  corner: {},
  icon: { opacity: 0.6 },
  hint: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: Spacing.md },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    gap: Spacing.sm,
  },
  scanBtnText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  orText: { fontSize: FontSize.sm, color: Colors.textMuted, marginVertical: Spacing.md },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryBtnText: { fontSize: FontSize.md, color: Colors.primary, fontWeight: '600' },
});
