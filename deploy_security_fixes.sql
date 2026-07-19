-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY FIXES — run once in the Supabase SQL Editor
-- Closes: free-Pro exploit, XP cheating, scan-count tampering.
-- Safe to run on production; no data is modified, only policies/functions.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Remove direct client writes to profiles.
--    This was the hole: it allowed updating ANY column, including
--    membership_tier ('pro' for free), total_xp, and scan counts.
--    All legitimate profile writes happen via SECURITY DEFINER functions
--    (which bypass RLS) or the service role (webhook/edge functions).
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- 2. Replacement for the one legitimate direct write the app did:
--    saving the push notification token.
CREATE OR REPLACE FUNCTION public.set_push_token(p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles SET push_token = p_token WHERE id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_push_token(TEXT) TO authenticated;

-- 3. Replace client-controlled increment_xp(any_amount) with a fixed-amount
--    action-based award. The client can no longer choose how much XP it gets.
DROP FUNCTION IF EXISTS public.increment_xp(INTEGER);

CREATE OR REPLACE FUNCTION public.award_xp(p_action TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount INTEGER;
  v_total  INTEGER;
BEGIN
  v_amount := CASE p_action
    WHEN 'scan'        THEN 30
    WHEN 'new_species' THEN 10
    WHEN 'add_plant'   THEN 50
    ELSE NULL
  END;
  IF v_amount IS NULL THEN
    RAISE EXCEPTION 'Unknown XP action: %', p_action;
  END IF;

  INSERT INTO profiles (id, total_xp)
  VALUES (auth.uid(), v_amount)
  ON CONFLICT (id) DO UPDATE
    SET total_xp = profiles.total_xp + v_amount
  RETURNING total_xp INTO v_total;

  RETURN v_total;
END;
$$;
GRANT EXECUTE ON FUNCTION public.award_xp(TEXT) TO authenticated;

-- 4. Scan counting now happens server-side inside the edge functions
--    (detect-plant / analyze-grass-health) using the service role, so
--    clients no longer need — and no longer get — direct access.
REVOKE EXECUTE ON FUNCTION public.increment_scan_count(INTEGER) FROM authenticated, anon, PUBLIC;

-- 5. Atomic scan-count increment for the edge functions (service role only —
--    clients cannot call this; it takes an explicit user id).
CREATE OR REPLACE FUNCTION public.increment_scan_count_admin(p_user_id UUID, p_amount INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE profiles
    SET scan_count_current_period = scan_count_current_period + p_amount
    WHERE id = p_user_id
    RETURNING scan_count_current_period INTO new_count;
  RETURN new_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.increment_scan_count_admin(UUID, INTEGER) FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_scan_count_admin(UUID, INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';
