import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

function comingSoon(feature: string) {
  Alert.alert(feature, 'Coming soon.');
}

function SettingsRow({
  icon,
  label,
  onPress,
  destructive,
  disabled,
  right,
}: {
  icon: string;
  label: string;
  onPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  right?: React.ReactNode;
}) {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const isDisabled = disabled ?? !onPress;
  return (
    <TouchableOpacity
      style={[styles.row, destructive && styles.rowDestructive, isDisabled && onPress && styles.rowBusy]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <Ionicons name={icon as any} size={20} color={destructive ? Colors.danger : Colors.textSecondary} />
      <Text style={[styles.rowLabel, destructive && styles.rowLabelDestructive]}>{label}</Text>
      {right !== undefined ? right : onPress ? (
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      ) : null}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const router = useRouter();
  const [wateringReminders, setWateringReminders] = useState(true);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const appVersion = Constants.expoConfig?.version;
  const buildNumber = Constants.expoConfig?.android?.versionCode;

  function handleDeleteAccount() {
    Alert.alert(
      'Delete Account?',
      'This will permanently delete your account and all your plants, photos, and data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingAccount(true);
            try {
              const { data, error } = await supabase.functions.invoke('delete-account');
              if (error) throw new Error(error.message ?? 'Failed to delete account');
              if (data && typeof data === 'object' && 'error' in data) {
                throw new Error((data as { error: string }).error);
              }
              await supabase.auth.signOut();
              // Navigation back to auth happens automatically via onAuthStateChange in _layout.tsx
            } catch (err) {
              setDeletingAccount(false);
              Alert.alert(
                'Delete Account Failed',
                err instanceof Error ? err.message : 'Please try again.',
              );
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Account</Text>
        <SettingsRow icon="person-outline" label="Edit Name" onPress={() => router.push('/edit-name')} />
        <SettingsRow icon="lock-closed-outline" label="Change Password" onPress={() => router.push('/change-password')} />
        <SettingsRow icon="mail-outline" label="Change Email" onPress={() => comingSoon('Change Email')} />

        <Text style={styles.sectionTitle}>Notifications</Text>
        <SettingsRow
          icon="notifications-outline"
          label="Watering Reminders"
          right={
            <Switch
              value={wateringReminders}
              onValueChange={setWateringReminders}
              trackColor={{ false: Colors.surfaceElevated, true: Colors.primary }}
              thumbColor="#FFFFFF"
            />
          }
        />

        <Text style={styles.sectionTitle}>App</Text>
        <SettingsRow icon="color-palette-outline" label="Display" onPress={() => router.push('/display')} />
        <SettingsRow icon="log-out-outline" label="Sign Out" onPress={() => comingSoon('Sign Out')} />

        <Text style={styles.sectionTitle}>Legal</Text>
        <SettingsRow icon="document-text-outline" label="Privacy Policy" onPress={() => comingSoon('Privacy Policy')} />
        <SettingsRow icon="document-text-outline" label="Terms of Service" onPress={() => comingSoon('Terms of Service')} />

        <Text style={[styles.sectionTitle, styles.dangerSectionTitle]}>Danger Zone</Text>
        <SettingsRow
          icon="trash-outline"
          label="Delete Account"
          destructive
          disabled={deletingAccount}
          onPress={handleDeleteAccount}
          right={deletingAccount ? <ActivityIndicator size="small" color={Colors.danger} /> : undefined}
        />

        {appVersion ? (
          <Text style={styles.versionText}>
            Plant Park v{appVersion}{buildNumber ? ` (Build ${buildNumber})` : ''}
          </Text>
        ) : null}
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
  dangerSectionTitle: { color: Colors.danger },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rowDestructive: { borderColor: Colors.danger, backgroundColor: '#1A0A0A' },
  rowBusy: { opacity: 0.6 },
  rowLabel: { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary },
  rowLabelDestructive: { color: Colors.danger },
  rowValue: { fontSize: FontSize.sm, color: Colors.textMuted },

  versionText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
  });
}
