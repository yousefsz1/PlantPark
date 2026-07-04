-- Adds the health_tips_pro column for the home_tips/pro_tips remedy split.
-- health_remedies (existing) now holds beginner "home tips";
-- health_tips_pro (new) holds more technical/horticultural tips.

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS health_tips_pro TEXT[];

NOTIFY pgrst, 'reload schema';
