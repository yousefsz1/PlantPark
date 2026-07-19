import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const SUPABASE_URL = 'https://xiqexeullniezghwdjfb.supabase.co';
// Publishable key — safe to commit (protected by Row Level Security)
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nDFXGei3ZvmNKZZ6ZAuWpw_BOUgFXB4';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // @supabase/auth-js defaults flowType to 'implicit' when unset. Without
    // this, resetPasswordForEmail() never generates a code_challenge, so
    // Supabase's server issues implicit-flow recovery links
    // (#access_token=...&refresh_token=...) instead of PKCE links
    // (?code=...) — silently breaking exchangeCodeForSession() on the
    // reset-password screen, which always looked for a code that was never
    // going to exist. See lib/deepLinks.ts for the corresponding link
    // parsing on the client side.
    flowType: 'pkce',
  },
});
