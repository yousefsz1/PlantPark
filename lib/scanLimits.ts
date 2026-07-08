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

// Fire-and-forget after a successful AI identification — never throws.
// amount defaults to 1 (a regular single-photo scan); Lawn Health Scans pass
// 3, since they send 3 images in one Gemini call.
export async function incrementScanCount(amount: number = 1): Promise<void> {
  try {
    await supabase.rpc('increment_scan_count', { p_amount: amount });
  } catch {
    // Non-fatal — worst case the count under-reports.
  }
}
