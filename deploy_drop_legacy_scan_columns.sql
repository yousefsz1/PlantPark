-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/xiqexeullniezghwdjfb/sql/new

-- ─── Profiles table: drop legacy/unused scan-limiting columns ───────────────
-- `plan`, `scans_used`, and `scans_reset_date` were an earlier, abandoned
-- attempt at scan-limiting — nothing in the app or in any DB function
-- referenced them (verified against pg_proc source before dropping). The
-- current scheme is `membership_tier` / `scan_count_current_period` /
-- `scan_period_reset_at` (see deploy_add_scan_limits.sql).

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS plan,
  DROP COLUMN IF EXISTS scans_used,
  DROP COLUMN IF EXISTS scans_reset_date;

NOTIFY pgrst, 'reload schema';
