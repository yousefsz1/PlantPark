-- Adds the lawn health scan score column to plants.
-- issues and tips reuse existing columns (grass_health_issues, health_tips_pro)
-- — only the numeric health level needs a new column.

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS lawn_health_level SMALLINT
    CHECK (lawn_health_level BETWEEN 1 AND 5);

NOTIFY pgrst, 'reload schema';
