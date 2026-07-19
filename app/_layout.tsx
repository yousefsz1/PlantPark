import 'react-native-url-polyfill/auto';
import { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import type { Session } from '@supabase/supabase-js';
import * as Notifications from 'expo-notifications';
import Purchases from 'react-native-purchases';
import { supabase } from '../lib/supabase';
import { registerForPushNotifications, syncWateringNotifications } from '../lib/notifications';
import { parseResetPasswordLink, type RecoveryLink } from '../lib/deepLinks';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';

const REVENUECAT_IOS_API_KEY = 'appl_YsArSDjutFNSjVAgQhpuzZEkcpO';
// TODO(Yousef): paste the Android key from RevenueCat dashboard →
// Project settings → API keys (starts with "goog_"). Purchases cannot work
// on Android until this is set.
const REVENUECAT_ANDROID_API_KEY = '';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Rendered inside ThemeProvider (unlike RootLayout itself, which provides the
// context and so cannot consume it) so it can react to theme changes.
function AppSplash() {
  const { Colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}

// Status bar text must flip with the theme — hardcoded "light" made it
// near-invisible on the cream light-mode background.
function ThemedStatusBar() {
  const { resolvedScheme } = useTheme();
  return <StatusBar style={resolvedScheme === 'light' ? 'dark' : 'light'} />;
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  // Configure RevenueCat once on app start — BOTH platforms (previously
  // iOS-only, which left Android unable to load offerings or purchase).
  useEffect(() => {
    const apiKey = Platform.OS === 'ios' ? REVENUECAT_IOS_API_KEY : REVENUECAT_ANDROID_API_KEY;
    if (apiKey) {
      Purchases.configure({ apiKey });
    } else {
      console.warn(`[RevenueCat] No API key configured for ${Platform.OS} — purchases disabled`);
    }
  }, []);

  // Load session once on mount, then subscribe to changes
  useEffect(() => {
    let mounted = true;
    let settled = false;

    // Called by whichever path wins: getSession(), INITIAL_SESSION event, or timeout.
    // The `settled` flag ensures we only initialize once.
    function settle(s: Session | null) {
      if (!mounted || settled) return;
      settled = true;
      setSession(s);
      setInitialized(true);
    }

    // Safety net: if getSession() hangs (e.g. token refresh times out on first load),
    // fall back to the login screen after 5 seconds instead of spinning forever.
    const timeout = setTimeout(() => {
      console.warn('[Auth] Session check timed out — falling back to login');
      settle(null);
    }, 5000);

    // Primary path: read the stored session.
    supabase.auth.getSession()
      .then(({ data, error }) => {
        clearTimeout(timeout);
        if (error) {
          console.warn('[Auth] getSession error:', error.message);
          settle(null);
        } else {
          settle(data.session);
        }
      })
      .catch((err) => {
        // getSession() rejected — treat as unauthenticated.
        clearTimeout(timeout);
        console.warn('[Auth] getSession threw unexpectedly:', err);
        settle(null);
      });

    // Subscribe to subsequent auth changes (sign-in, sign-out, token refresh).
    // Also acts as a secondary initializer: if INITIAL_SESSION fires before
    // getSession() resolves (can happen with the sb_publishable_ key), settle here.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return;

      // Second signal for the recovery flag (the primary one is set
      // synchronously in handleIncomingURL, before this can fire) — Supabase
      // emits this specifically for a session established via a recovery
      // code exchange, distinct from a normal SIGNED_IN.
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
      // reset-password.tsx signs out once the new password is saved, so this
      // is where the flag naturally clears — without it, every sign-out for
      // the rest of the app session would stay wrongly exempted from the
      // "no session -> /auth" redirect below.
      if (event === 'SIGNED_OUT') {
        setIsPasswordRecovery(false);
      }

      if (!settled) {
        // INITIAL_SESSION or early SIGNED_OUT — treat this as initialization
        clearTimeout(timeout);
        settle(s);
      } else {
        // Regular state change after init (sign-in, sign-out, token refresh)
        setSession(s);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  // Redirect based on auth state once we know the session
  useEffect(() => {
    if (!initialized) return;

    const inTabs = segments[0] === '(tabs)';
    const onAuth = segments[0] === 'auth';
    const onResetPassword = segments[0] === 'reset-password';

    // Unauthenticated users can only be on the auth screen — except while a
    // password-recovery deep link is being processed (isPasswordRecovery is
    // set before the code exchange resolves, so there's a brief window with
    // no session yet) or already on the reset screen itself.
    if (!session && !onAuth && !onResetPassword && !isPasswordRecovery) {
      router.replace('/auth');
    }
    // Authenticated users on the auth screen go to tabs; modals (/add-plant etc.) are left alone.
    // Not during a recovery session though — they must set a new password
    // first, not get dropped into the app on it.
    if (session && onAuth && !isPasswordRecovery) {
      router.replace('/(tabs)');
    }
  }, [session, initialized, segments, isPasswordRecovery]);

  // Handle password-recovery deep links — plantpark://reset-password?code=...
  // (PKCE, current format) or plantpark://reset-password#access_token=...
  // (implicit, the format any reset email sent before lib/supabase.ts set
  // flowType: 'pkce' will still use): cold start via getInitialURL(),
  // already-running app via the 'url' event.
  //
  // This only detects the link, flags recovery, and hands whatever it found
  // off to reset-password.tsx via route params — it does NOT call
  // exchangeCodeForSession/setSession itself. PKCE recovery codes are
  // single-use, and reset-password.tsx's own mount-time logic is the sole
  // place that establishes the session (it re-derives the params via
  // useLocalSearchParams). Having both places attempt it meant whichever one
  // lost the race got a "code already used" error and showed a false
  // invalid-link screen on a perfectly fresh link.
  const [pendingRecoveryLink, setPendingRecoveryLink] = useState<RecoveryLink | null>(null);

  const handleIncomingURL = useCallback((url: string | null) => {
    if (!url) return;
    // Ground truth for diagnosing which flow an email actually used — keep
    // this until old implicit-flow emails have fully cycled out.
    console.log('[Layout] Incoming URL:', url);

    const link = parseResetPasswordLink(url);
    if (!link) return;

    // Set before navigating so the redirect-guard effect above doesn't
    // bounce to /auth in the gap where a session doesn't exist yet — the
    // session isn't established until reset-password.tsx's own exchange
    // resolves.
    setIsPasswordRecovery(true);
    setPendingRecoveryLink(link);
  }, []);

  useEffect(() => {
    Linking.getInitialURL().then(handleIncomingURL);
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleIncomingURL(url);
    });
    return () => subscription.remove();
  }, [handleIncomingURL]);

  // Navigate only once <Stack> has actually mounted (initialized), not the
  // instant a link is detected. Linking.getInitialURL() and the session-load
  // effect above both run independently on cold start — before initialized
  // flips true, RootLayout renders <AppSplash /> instead of <Stack>, so
  // there's no navigator mounted yet to receive a push. Deferring the
  // navigation until initialized guarantees the route (and its params) only
  // ever lands on a real, mounted navigator.
  useEffect(() => {
    if (!initialized || !pendingRecoveryLink) return;
    const params = pendingRecoveryLink.type === 'pkce'
      ? { code: pendingRecoveryLink.code }
      : { access_token: pendingRecoveryLink.accessToken, refresh_token: pendingRecoveryLink.refreshToken };
    router.push({ pathname: '/reset-password', params });
    setPendingRecoveryLink(null);
  }, [initialized, pendingRecoveryLink, router]);

  // Register (or refresh) the device's push token whenever a signed-in user
  // becomes present — covers both app-start-with-existing-session and a
  // fresh login. Keyed on user id, not the session object, so a token
  // refresh (which produces a new session object for the same user) doesn't
  // re-trigger this. Also links the RevenueCat customer to this user's ID.
  useEffect(() => {
    if (session?.user?.id) {
      registerForPushNotifications();
      // Rebuild local watering reminders from the DB — covers tasks created
      // server-side (rain auto-watering) that the device never scheduled.
      syncWateringNotifications();
      Purchases.logIn(session.user.id).catch((err) => {
        console.warn('[RevenueCat] logIn failed:', err);
      });
    }
  }, [session?.user?.id]);

  // Splash while determining session — prevents flashing the wrong screen
  return (
    <ThemeProvider>
      {!initialized ? (
        <AppSplash />
      ) : (
        <>
          <ThemedStatusBar />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="auth" options={{ animation: 'fade' }} />
            <Stack.Screen name="add-plant" options={{ presentation: 'modal' }} />
            <Stack.Screen name="plant/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ headerShown: false }} />
            <Stack.Screen name="reset-password" options={{ headerShown: false }} />
          </Stack>
        </>
      )}
    </ThemeProvider>
  );
}
