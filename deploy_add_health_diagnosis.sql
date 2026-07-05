-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/xiqexeullniezghwdjfb/sql/new

-- ─── Plants & Favourites: AI visual health diagnosis ─────────────────────────
-- This is deliberately separate from:
--   - health_percent (care/happiness, driven by watering adherence — untouched)
--   - health_issues / health_remedies / health_tips_pro (the existing
--     initial-scan remedy-suggestion arrays shown in "Health Tips &
--     Troubleshooting" — untouched)
--
-- It's a distinct, independently re-checkable visual diagnosis that can be
-- refreshed later via a "Re-check Health" action without re-identifying the
-- plant or touching any of the above.
--
-- NOTE: named health_diagnosis_issues (not health_issues) specifically to
-- avoid colliding with the pre-existing health_issues TEXT[] column.

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS health_status TEXT
    CHECK (health_status IN ('healthy', 'needs_attention', 'critical')),
  ADD COLUMN IF NOT EXISTS health_diagnosis_issues TEXT,
  ADD COLUMN IF NOT EXISTS health_recommendation TEXT,
  ADD COLUMN IF NOT EXISTS health_checked_at TIMESTAMPTZ;

ALTER TABLE public.favourites
  ADD COLUMN IF NOT EXISTS health_status TEXT
    CHECK (health_status IN ('healthy', 'needs_attention', 'critical')),
  ADD COLUMN IF NOT EXISTS health_diagnosis_issues TEXT,
  ADD COLUMN IF NOT EXISTS health_recommendation TEXT,
  ADD COLUMN IF NOT EXISTS health_checked_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
