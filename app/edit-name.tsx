import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

export default function EditNameScreen() {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const router = useRouter();
  const [name, setName] = useState('');
  const [originalName, setOriginalName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const current = (data.user?.user_metadata?.display_name as string | undefined) ?? '';
      setName(current);
      setOriginalName(current);
      setLoading(false);
    });
  }, []);

  const canSave = !saving && name.trim().length > 0 && name.trim() !== originalName.trim();

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { display_name: name.trim() } });
      if (error) throw new Error(error.message);
      Alert.alert('Name Updated', 'Your name has been updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert('Could Not Update Name', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }, [canSave, name, router]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Name</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Your Name</Text>
            <View style={styles.inputRow}>
              <Ionicons name="person-outline" size={18} color={Colors.textMuted} />
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Rose"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="words"
                autoCorrect={false}
                textContentType="name"
                returnKeyType="done"
                editable={!saving}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={Colors.textPrimary} />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
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

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  content: { padding: Spacing.md, gap: Spacing.lg },

  inputGroup: { gap: 6 },
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary, marginLeft: 2 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    gap: Spacing.sm,
  },
  textInput: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    padding: 0,
  },

  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: Spacing.md,
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  });
}
