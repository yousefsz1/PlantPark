import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

// Reached via a password-recovery deep link. app/_layout.tsx's own
// handleIncomingURL listener only detects the link, flags recovery (so the
// redirect-guard effect doesn't bounce to /auth before a session exists),
// and forwards whatever it found here as route params — it deliberately
// does NOT establish the session itself. This screen is the sole place that
// ever calls exchangeCodeForSession/setSession: PKCE recovery codes are
// single-use, so having two call sites attempt the same exchange meant
// whichever one lost the race got a "code already used" error and showed a
// false invalid-link screen on a perfectly fresh link. Expo Router can also
// auto-navigate straight to this route from the incoming URL independently
// of _layout.tsx's listener, so this screen still can't assume a session
// already exists by the time it mounts — it verifies/establishes the
// session itself below regardless of how it got here.
//
// Two link formats are handled: `code` (PKCE — the format used now that
// lib/supabase.ts sets flowType: 'pkce') and `access_token`/`refresh_token`
// (implicit — the format Supabase issued before that fix, so any reset
// email already sent/in-flight before this shipped still needs to work).
// See lib/deepLinks.ts for how each is parsed out of the incoming URL.
//
// The mount effect below is keyed on the route params (not run-once) so it
// re-fires if this screen's first render lands before they've hydrated,
// rather than committing to a false "invalid link" off a stale/empty value
// — and a separate onAuthStateChange listener is a second line of defense
// that flips back to the form if a session ever shows up after an error was
// already shown.
//
// Unlike change-password.tsx (a logged-in user changing their password on
// purpose), this ends by signing the user out of the recovery session and
// sending them back to /auth to log in fresh with the new password.
export default function ResetPasswordScreen() {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; access_token?: string; refresh_token?: string }>();
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  const accessToken = Array.isArray(params.access_token) ? params.access_token[0] : params.access_token;
  const refreshToken = Array.isArray(params.refresh_token) ? params.refresh_token[0] : params.refresh_token;
  const hasRecoveryParams = Boolean(code) || Boolean(accessToken && refreshToken);
  const [verifying, setVerifying] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Confirm (or establish) a session before ever showing the password
  // fields — don't rely on _layout.tsx having already done this. Keyed on
  // the route params (not []) so that if this screen's first render lands
  // before they've hydrated, the effect re-runs and picks up the real
  // values once they arrive instead of committing to a false "invalid link"
  // off a stale/empty value.
  useEffect(() => {
    let cancelled = false;

    if (!hasRecoveryParams) {
      // Nothing yet on this render — give route params a couple seconds to
      // catch up before treating this as a genuinely param-less/broken
      // link, rather than failing immediately. If they show up before this
      // fires, the effect cleanup (below) cancels it and a fresh run with
      // the real values takes over.
      const timeout = setTimeout(async () => {
        if (cancelled) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session) {
          setVerifying(false);
          return;
        }
        setLinkError('This reset link is invalid or has expired.');
        setVerifying(false);
      }, 2000);
      return () => {
        cancelled = true;
        clearTimeout(timeout);
      };
    }

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) {
        setVerifying(false);
        return;
      }

      let err: { message: string } | null = null;
      if (code) {
        console.log('[ResetPassword] Exchanging recovery code (PKCE):', code);
        ({ error: err } = await supabase.auth.exchangeCodeForSession(code));
      } else if (accessToken && refreshToken) {
        console.log('[ResetPassword] Establishing session from recovery tokens (implicit flow), access_token:', accessToken);
        ({ error: err } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }));
      }
      if (cancelled) return;

      if (err) {
        console.log('[ResetPassword] Session establishment failed:', err.message);
        // This is the sole call site now (see the file-level comment
        // above), so a failure here should mean a genuinely
        // invalid/expired/already-used link — but recheck for a session
        // before committing to that, as cheap defense-in-depth against any
        // other unexpected double-invocation.
        const { data: { session: retrySession } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (retrySession) {
          setVerifying(false);
          return;
        }
        setLinkError('This reset link is invalid or has expired.');
        setVerifying(false);
        return;
      }

      setVerifying(false);
    })();

    return () => { cancelled = true; };
  }, [code, accessToken, refreshToken, hasRecoveryParams]);

  // Defense in depth: if a session shows up from ANY source after this
  // screen may have already committed to the error state (e.g. a delayed
  // exchange elsewhere still wins the race despite the above), flip back to
  // the password form instead of leaving the user stuck looking at a false
  // "invalid link" screen while they actually do have a valid session.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
        setLinkError(null);
        setVerifying(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

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

      // Don't leave the user signed in on the recovery session — send them
      // back to log in from scratch with the new password.
      await supabase.auth.signOut();

      Alert.alert(
        'Password Updated',
        'Your password has been updated. Please log in with your new password.',
        [{ text: 'OK', onPress: () => router.replace('/auth') }],
      );
    } catch (err) {
      Alert.alert('Could Not Update Password', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }, [newPassword, confirmPassword, router]);

  // ── Verifying the recovery link / establishing the session ────────────────
  if (verifying) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Reset Password</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.centeredText}>Verifying reset link…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Invalid/expired link — no session and nothing to exchange ─────────────
  if (linkError) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Reset Password</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.danger} />
          <Text style={styles.centeredText}>{linkError}</Text>
          <TouchableOpacity
            style={[styles.saveBtn, styles.backToLoginBtn]}
            onPress={() => router.replace('/auth')}
            activeOpacity={0.85}
          >
            <Text style={styles.saveBtnText}>Back to Log In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reset Password</Text>
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

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  centeredText: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },

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
  backToLoginBtn: { paddingHorizontal: Spacing.xl },
  });
}
