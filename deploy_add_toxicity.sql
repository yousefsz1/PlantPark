-- Adds toxicity fields for the Toxicity feature.
-- Nullable: null means "not yet assessed" (older plants scanned before this feature).

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS toxic_to_humans BOOLEAN,
  ADD COLUMN IF NOT EXISTS toxic_to_pets   BOOLEAN,
  ADD COLUMN IF NOT EXISTS toxicity_note   TEXT;

NOTIFY pgrst, 'reload schema';
