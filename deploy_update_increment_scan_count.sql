-- Adds an optional amount parameter to increment_scan_count so a single Lawn
-- Health Scan (3 images in one Gemini call) can count as 3 scans against the
-- same monthly quota used for regular single-photo scans, instead of a
-- separate parallel counting system.
--
-- The old zero-arg function is dropped first (not just replaced) so there is
-- exactly one function afterward — existing no-arg calls from the regular
-- scan flows keep working unchanged, defaulting to +1.

DROP FUNCTION IF EXISTS public.increment_scan_count();

CREATE OR REPLACE FUNCTION public.increment_scan_count(p_amount INTEGER DEFAULT 1)
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
    WHERE id = auth.uid()
    RETURNING scan_count_current_period INTO new_count;
  RETURN new_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_scan_count(INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
