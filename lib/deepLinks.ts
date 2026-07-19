import * as Linking from 'expo-linking';

// Password-reset links look like plantpark://reset-password?code=<pkce-code>
// (PKCE flow, the format used now that lib/supabase.ts sets flowType:
// 'pkce') or plantpark://reset-password#access_token=...&refresh_token=...
// (implicit flow — the format Supabase issued before that fix, still
// possible from any reset email sent before this shipped). Both are handled
// so in-flight old emails keep working through the transition.
export type RecoveryLink =
  | { type: 'pkce'; code: string }
  | { type: 'implicit'; accessToken: string; refreshToken: string };

// Linking.parse()'s hostname/path split for scheme-only URLs (no domain) is
// inconsistently documented across platforms/SDK versions, so rather than
// depend on which of hostname/path ends up holding "reset-password", we
// just substring-match the raw URL.
export function parseResetPasswordLink(url: string): RecoveryLink | null {
  if (!url.includes('reset-password')) return null;

  // PKCE flow: ?code=... — Linking.parse() reliably exposes this via
  // queryParams (backed by new URL(url).searchParams).
  const { queryParams } = Linking.parse(url);
  const code = queryParams?.code;
  if (typeof code === 'string' && code) {
    return { type: 'pkce', code };
  }

  // Implicit flow: #access_token=...&refresh_token=...&type=recovery.
  // Linking.parse() only reads the query string, never the hash fragment
  // (confirmed by reading its source — it's `new URL(url).searchParams`
  // only), so this has to be parsed manually. Also check the query string
  // for the same keys as a fallback in case a token ever arrives there
  // instead of the fragment.
  const hashIndex = url.indexOf('#');
  const hashParams = hashIndex >= 0 ? new URLSearchParams(url.slice(hashIndex + 1)) : null;
  const queryIndex = url.indexOf('?');
  const queryEnd = hashIndex >= 0 ? hashIndex : url.length;
  const searchParams = queryIndex >= 0 && queryIndex < queryEnd
    ? new URLSearchParams(url.slice(queryIndex + 1, queryEnd))
    : null;

  const accessToken = hashParams?.get('access_token') ?? searchParams?.get('access_token');
  const refreshToken = hashParams?.get('refresh_token') ?? searchParams?.get('refresh_token');
  if (accessToken && refreshToken) {
    return { type: 'implicit', accessToken, refreshToken };
  }

  return null;
}
