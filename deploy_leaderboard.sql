-- ═══════════════════════════════════════════════════════════════════════════
-- GLOBAL RANKING (leaderboard) — run once in the Supabase SQL Editor
-- Top 20 users by XP + the caller's own rank. SECURITY DEFINER because RLS
-- (correctly) blocks reading other users' profiles; this function exposes
-- ONLY display name and XP — never emails or ids of other users.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_leaderboard()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_top     JSON;
  v_my_xp   INTEGER;
  v_my_rank INTEGER;
BEGIN
  SELECT COALESCE(json_agg(t), '[]'::json) INTO v_top FROM (
    SELECT
      (p.id = auth.uid())                                                        AS is_me,
      COALESCE(NULLIF(TRIM(u.raw_user_meta_data->>'display_name'), ''), 'Gardener') AS name,
      p.total_xp
    FROM profiles p
    JOIN auth.users u ON u.id = p.id
    ORDER BY p.total_xp DESC, p.id
    LIMIT 20
  ) t;

  SELECT total_xp INTO v_my_xp FROM profiles WHERE id = auth.uid();
  v_my_xp := COALESCE(v_my_xp, 0);

  SELECT COUNT(*) + 1 INTO v_my_rank FROM profiles WHERE total_xp > v_my_xp;

  RETURN json_build_object('top', v_top, 'my_rank', v_my_rank, 'my_xp', v_my_xp);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_leaderboard() TO authenticated;

NOTIFY pgrst, 'reload schema';
