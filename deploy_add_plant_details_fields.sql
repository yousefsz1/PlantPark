-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/xiqexeullniezghwdjfb/sql/new

-- ─── Plants & Favourites: additional plant characteristics ──────────────────
-- Populated by the detect-plant AI scan (max_height, flowering_season,
-- fruiting_season, growing_location). Nullable — older rows predate this
-- feature. flowering_season/fruiting_season may hold the literal string
-- "N/A" when the trait doesn't apply to the plant.

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS max_height TEXT,
  ADD COLUMN IF NOT EXISTS flowering_season TEXT,
  ADD COLUMN IF NOT EXISTS fruiting_season TEXT,
  ADD COLUMN IF NOT EXISTS growing_location TEXT
    CHECK (growing_location IN ('indoor', 'outdoor', 'both'));

ALTER TABLE public.favourites
  ADD COLUMN IF NOT EXISTS max_height TEXT,
  ADD COLUMN IF NOT EXISTS flowering_season TEXT,
  ADD COLUMN IF NOT EXISTS fruiting_season TEXT,
  ADD COLUMN IF NOT EXISTS growing_location TEXT
    CHECK (growing_location IN ('indoor', 'outdoor', 'both'));

NOTIFY pgrst, 'reload schema';
