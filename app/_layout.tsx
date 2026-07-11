import 'react-native-url-polyfill/auto';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';
import { registerForPushNotifications } from '../lib/notifications';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';

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

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const router = useRouter();
  const segments = useSegments();

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;
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

    // Unauthenticated users can only be on the auth screen
    if (!session && !onAuth) {
      router.replace('/auth');
    }
    // Authenticated users on the auth screen go to tabs; modals (/add-plant etc.) are left alone
    if (session && onAuth) {
      router.replace('/(tabs)');
    }
  }, [session, initialized, segments]);

  // Register (or refresh) the device's push token whenever a signed-in user
  // becomes present — covers both app-start-with-existing-session and a
  // fresh login. Keyed on user id, not the session object, so a token
  // refresh (which produces a new session object for the same user) doesn't
  // re-trigger this.
  useEffect(() => {
    if (session?.user?.id) {
      registerForPushNotifications();
    }
  }, [session?.user?.id]);

  // Splash while determining session — prevents flashing the wrong screen
  return (
    <ThemeProvider>
      {!initialized ? (
        <AppSplash />
      ) : (
        <>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="auth" options={{ animation: 'fade' }} />
            <Stack.Screen name="add-plant" options={{ presentation: 'modal' }} />
            <Stack.Screen name="plant/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ headerShown: false }} />
          </Stack>
        </>
      )}
    </ThemeProvider>
  );
}
