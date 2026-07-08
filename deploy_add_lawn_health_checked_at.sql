-- Adds the "last scanned" timestamp for lawn health scans.
-- Written by the analyze-grass-health flow alongside grass_health_issues,
-- health_tips_pro, and lawn_health_level.

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS lawn_health_checked_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
