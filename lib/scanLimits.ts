import { supabase } from './supabase';

export type MembershipTier = 'free' | 'basic' | 'pro';

export const TIER_LIMITS: Record<MembershipTier, number> = {
  free: 5,
  basic: 50,
  pro: 500,
};

export type ScanStatus = {
  tier: MembershipTier;
  count: number;
  limit: number;
  hasScansRemaining: boolean;
};

// Fail-open: if the status check itself errors (network/RPC hiccup), callers
// should treat a null result as "allow the scan" rather than blocking a
// legitimate user over a transient failure.
export async function getScanStatus(): Promise<ScanStatus | null> {
  try {
    const { data, error } = await supabase.rpc('get_scan_status');
    if (error || !data) return null;

    const result = data as {
      membership_tier: MembershipTier;
      scan_count_current_period: number;
      scan_period_reset_at: string;
    };

    const tier  = result.membership_tier ?? 'free';
    const count = result.scan_count_current_period ?? 0;
    const limit = TIER_LIMITS[tier];

    return {
      tier,
      count,
      limit,
      hasScansRemaining: count < limit,
    };
  } catch {
    return null;
  }
}

// Scan counting now happens SERVER-SIDE inside the detect-plant and
// analyze-grass-health edge functions (see supabase/functions/_shared/
// scanGuard.ts) — the client no longer increments anything. This closed the
// hole where limits were only enforced in the app, letting direct API calls
// run unlimited paid Gemini scans.

// Fixed-amount XP award — the server decides the amount per action, so the
// client can no longer request arbitrary XP. Fire-and-forget friendly.
export type XPAction = 'scan' | 'new_species' | 'add_plant';

export async function awardXP(action: XPAction): Promise<number | null> {
  try {
    const { data, error } = await supabase.rpc('award_xp', { p_action: action });
    if (error) return null;
    return typeof data === 'number' ? data : null;
  } catch {
    return null;
  }
}
