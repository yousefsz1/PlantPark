import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Server-side scan-limit enforcement, shared by detect-plant and
// analyze-grass-health. Previously limits were only checked in the app,
// so anyone calling the edge functions directly could run unlimited
// (paid) Gemini scans. This guard is the source of truth now.
//
// Uses the service role client with an explicit user id resolved from the
// caller's JWT — mirrors the reset logic in the get_scan_status RPC.

const TIER_LIMITS: Record<string, number> = { free: 5, basic: 50, pro: 500 };

export type ScanGuardResult =
  | { ok: true; userId: string; tier: string; admin: SupabaseClient }
  | { ok: false; response: Response };

function jsonError(message: string, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

export async function checkScanAllowance(
  req: Request,
  amount: number,
  cors: Record<string, string>,
  opts: { requirePaidTier?: boolean } = {},
): Promise<ScanGuardResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false, response: jsonError('Service not configured', 503, cors) };
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Resolve the caller from their JWT (the API gateway has already verified
  // the signature; this maps it to a concrete user id).
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return { ok: false, response: jsonError('Invalid or expired session', 401, cors) };
  }
  const userId = userData.user.id;

  // Load (or create) the profile and apply the monthly reset — same
  // behaviour as the get_scan_status RPC.
  let { data: profile } = await admin
    .from('profiles')
    .select('membership_tier, scan_count_current_period, scan_period_reset_at')
    .eq('id', userId)
    .maybeSingle();

  if (!profile) {
    const { data: created } = await admin
      .from('profiles')
      .insert({ id: userId, membership_tier: 'free', scan_count_current_period: 0, scan_period_reset_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() })
      .select('membership_tier, scan_count_current_period, scan_period_reset_at')
      .single();
    profile = created;
  } else if (!profile.scan_period_reset_at || new Date(profile.scan_period_reset_at) <= new Date()) {
    const { data: reset } = await admin
      .from('profiles')
      .update({ scan_count_current_period: 0, scan_period_reset_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() })
      .eq('id', userId)
      .select('membership_tier, scan_count_current_period, scan_period_reset_at')
      .single();
    if (reset) profile = reset;
  }

  // Fail-open on profile read problems (matches the app's philosophy:
  // never block a legitimate user over a transient error).
  if (!profile) return { ok: true, userId, tier: 'free', admin };

  const tier = profile.membership_tier ?? 'free';
  const limit = TIER_LIMITS[tier] ?? TIER_LIMITS.free;
  const count = profile.scan_count_current_period ?? 0;

  if (opts.requirePaidTier && tier === 'free') {
    return { ok: false, response: jsonError('This feature requires a Basic or Pro plan.', 403, cors) };
  }

  if (count + amount > limit) {
    return {
      ok: false,
      response: jsonError(`Scan limit reached: ${count}/${limit} scans used this period on the ${tier} plan.`, 429, cors),
    };
  }

  return { ok: true, userId, tier, admin };
}

// Record the scans after a successful AI call. Best-effort — a failure here
// under-reports usage but never breaks the scan the user already paid for.
export async function recordScans(admin: SupabaseClient, userId: string, amount: number): Promise<void> {
  try {
    await admin.rpc('increment_scan_count_admin', { p_user_id: userId, p_amount: amount });
  } catch {
    /* non-fatal */
  }
}
