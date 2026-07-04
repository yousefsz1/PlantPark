import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

export default function ChangePasswordScreen() {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSave = !saving && newPassword.length > 0 && confirmPassword.length > 0;

  function validate(): string | null {
    if (newPassword.length < 6) return 'Password must be at least 6 characters.';
    if (newPassword !== confirmPassword) return 'Passwords do not match.';
    return null;
  }

  const handleSave = useCallback(async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: newPassword });
      if (err) throw new Error(err.message);
      Alert.alert('Password Updated', 'Your password has been updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert('Could Not Update Password', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }, [newPassword, confirmPassword, router]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Change Password</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>New Password</Text>
          <View style={styles.inputRow}>
            <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} />
            <TextInput
              style={[styles.textInput, { flex: 1 }]}
              value={newPassword}
              onChangeText={(v) => { setNewPassword(v); setError(null); }}
              placeholder="At least 6 characters"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry={!showNewPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              returnKeyType="next"
              editable={!saving}
            />
            <TouchableOpacity
              onPress={() => setShowNewPassword((v) => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={showNewPassword ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color={Colors.textMuted}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Confirm New Password</Text>
          <View style={styles.inputRow}>
            <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} />
            <TextInput
              style={[styles.textInput, { flex: 1 }]}
              value={confirmPassword}
              onChangeText={(v) => { setConfirmPassword(v); setError(null); }}
              placeholder="Re-enter new password"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              returnKeyType="done"
              onSubmitEditing={handleSave}
              editable={!saving}
            />
            <TouchableOpacity
              onPress={() => setShowConfirmPassword((v) => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color={Colors.textMuted}
              />
            </TouchableOpacity>
          </View>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

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

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: '#2D1010',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  errorText: { flex: 1, fontSize: FontSize.sm, color: Colors.danger },

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
