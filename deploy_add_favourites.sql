-- Creates the favourites table for the Favourites feature.
-- Static reference snapshots — no care_tasks relationship, no watering
-- schedules, no health tracking over time.

CREATE TABLE IF NOT EXISTS public.favourites (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name               TEXT        NOT NULL,
  species            TEXT,
  photo_url          TEXT,
  watering_frequency TEXT,
  sunlight           TEXT,
  soil_type          TEXT,
  temperature        TEXT,
  care_tip           TEXT,
  health_issues      TEXT[],
  health_remedies    TEXT[],
  health_tips_pro    TEXT[],
  toxic_to_humans    BOOLEAN,
  toxic_to_pets      BOOLEAN,
  toxicity_note      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS favourites_user_id_idx ON public.favourites (user_id);

ALTER TABLE public.favourites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own favourites"
  ON public.favourites FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own favourites"
  ON public.favourites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own favourites"
  ON public.favourites FOR DELETE
  USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
