-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/xiqexeullniezghwdjfb/sql/new

-- ─── Profiles table: membership & scan limiting ──────────────────────────────
-- membership_tier / scan_count_current_period / scan_period_reset_at already
-- exist on the live table; the ALTER below is a documenting no-op (IF NOT
-- EXISTS) so schema.sql stays in sync without touching the real columns.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS membership_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (membership_tier IN ('free', 'basic', 'pro')),
  ADD COLUMN IF NOT EXISTS scan_count_current_period INTEGER NOT NULL DEFAULT 0
    CHECK (scan_count_current_period >= 0),
  ADD COLUMN IF NOT EXISTS scan_period_reset_at TIMESTAMPTZ;

-- Lazily resets the caller's scan period if it has expired (or was never
-- set), creating a default profile row first if none exists yet (mirrors the
-- upsert-on-first-use pattern in increment_xp). Returns the (possibly
-- just-reset) counters — the tier -> scan limit mapping lives client-side in
-- lib/scanLimits.ts, not here.
CREATE OR REPLACE FUNCTION public.get_scan_status()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier     TEXT;
  v_count    INTEGER;
  v_reset_at TIMESTAMPTZ;
BEGIN
  SELECT membership_tier, scan_count_current_period, scan_period_reset_at
    INTO v_tier, v_count, v_reset_at
  FROM profiles
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    INSERT INTO profiles (id, membership_tier, scan_count_current_period, scan_period_reset_at)
    VALUES (auth.uid(), 'free', 0, NOW() + INTERVAL '1 month')
    RETURNING membership_tier, scan_count_current_period, scan_period_reset_at
      INTO v_tier, v_count, v_reset_at;
  ELSIF v_reset_at IS NULL OR v_reset_at <= NOW() THEN
    UPDATE profiles
      SET scan_count_current_period = 0,
          scan_period_reset_at = NOW() + INTERVAL '1 month'
      WHERE id = auth.uid()
      RETURNING membership_tier, scan_count_current_period, scan_period_reset_at
        INTO v_tier, v_count, v_reset_at;
  END IF;

  RETURN json_build_object(
    'membership_tier', v_tier,
    'scan_count_current_period', v_count,
    'scan_period_reset_at', v_reset_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_scan_status() TO authenticated;

-- Atomic +1 to the caller's scan count — mirrors increment_xp.
-- Call from client after a successful AI identification:
-- supabase.rpc('increment_scan_count')
CREATE OR REPLACE FUNCTION public.increment_scan_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE profiles
    SET scan_count_current_period = scan_count_current_period + 1
    WHERE id = auth.uid()
    RETURNING scan_count_current_period INTO new_count;
  RETURN new_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_scan_count() TO authenticated;

NOTIFY pgrst, 'reload schema';
