-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/xiqexeullniezghwdjfb/sql/new

-- ─── Plants table ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plants (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT          NOT NULL,
  species       TEXT,
  level         INTEGER       NOT NULL DEFAULT 1 CHECK (level >= 1),
  xp            INTEGER       NOT NULL DEFAULT 0 CHECK (xp >= 0),
  health_percent INTEGER      NOT NULL DEFAULT 100 CHECK (health_percent BETWEEN 0 AND 100),
  last_watered  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Index for fast per-user queries
CREATE INDEX IF NOT EXISTS plants_user_id_idx ON public.plants (user_id);

-- ─── Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE public.plants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own plants"
  ON public.plants FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own plants"
  ON public.plants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own plants"
  ON public.plants FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own plants"
  ON public.plants FOR DELETE
  USING (auth.uid() = user_id);

-- ─── User profiles (XP totals) ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_xp   INTEGER NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Atomic XP increment: inserts the profile row on first scan, increments on subsequent ones.
-- Call from client: supabase.rpc('increment_xp', { xp_amount: 30 })
CREATE OR REPLACE FUNCTION public.increment_xp(xp_amount INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_total INTEGER;
BEGIN
  INSERT INTO public.profiles (id, total_xp)
  VALUES (auth.uid(), xp_amount)
  ON CONFLICT (id) DO UPDATE
    SET total_xp = profiles.total_xp + xp_amount
  RETURNING total_xp INTO new_total;
  RETURN new_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_xp(INTEGER) TO authenticated;

-- ─── Plants table: care + AI detection columns (safe to re-run) ─────────────

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS watering_frequency TEXT
    CHECK (watering_frequency IN ('daily', 'weekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS sunlight TEXT
    CHECK (sunlight IN ('low', 'medium', 'bright')),
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS soil_type TEXT,
  ADD COLUMN IF NOT EXISTS temperature_range TEXT,
  ADD COLUMN IF NOT EXISTS care_tip TEXT;

-- ─── Care tasks ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.care_tasks (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id      UUID        NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  task_type     TEXT        NOT NULL CHECK (task_type IN ('watering', 'fertilizing', 'misting')),
  due_date      DATE        NOT NULL,
  completed_at  TIMESTAMPTZ,
  xp_reward     INTEGER     NOT NULL DEFAULT 10,
  interval_days INTEGER     NOT NULL DEFAULT 7,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS care_tasks_user_date_idx  ON public.care_tasks (user_id, due_date);
CREATE INDEX IF NOT EXISTS care_tasks_plant_id_idx   ON public.care_tasks (plant_id);

ALTER TABLE public.care_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tasks"
  ON public.care_tasks FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tasks"
  ON public.care_tasks FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tasks"
  ON public.care_tasks FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tasks"
  ON public.care_tasks FOR DELETE USING (auth.uid() = user_id);

-- Completes a task, boosts plant health, creates next recurring task, awards XP.
-- Returns JSON: { new_xp, new_health, next_task_id, next_due_date, task_type, xp_reward }
CREATE OR REPLACE FUNCTION public.complete_care_task(task_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task         care_tasks;
  v_plant_health INTEGER;
  v_new_xp       INTEGER;
  v_new_health   INTEGER;
  v_next_id      UUID;
  v_next_due     DATE;
  v_health_boost INTEGER;
BEGIN
  SELECT ct.* INTO v_task
  FROM   care_tasks ct
  WHERE  ct.id = task_id
    AND  ct.user_id = auth.uid()
    AND  ct.completed_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found, already completed, or unauthorized';
  END IF;

  IF v_task.due_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Too early: task is not due until %', v_task.due_date;
  END IF;

  UPDATE care_tasks SET completed_at = NOW() WHERE id = task_id;

  SELECT health_percent INTO v_plant_health FROM plants WHERE id = v_task.plant_id;

  v_health_boost := CASE v_task.task_type
    WHEN 'watering'    THEN 8
    WHEN 'fertilizing' THEN 15
    WHEN 'misting'     THEN 3
    ELSE 5
  END;

  v_new_health := LEAST(v_plant_health + v_health_boost, 100);
  UPDATE plants
    SET health_percent = v_new_health,
        last_watered   = CASE WHEN v_task.task_type = 'watering' THEN NOW() ELSE last_watered END
    WHERE id = v_task.plant_id;

  v_next_due := CURRENT_DATE + v_task.interval_days;
  INSERT INTO care_tasks (plant_id, user_id, task_type, due_date, xp_reward, interval_days)
  VALUES (v_task.plant_id, auth.uid(), v_task.task_type, v_next_due, v_task.xp_reward, v_task.interval_days)
  RETURNING id INTO v_next_id;

  INSERT INTO profiles (id, total_xp)
  VALUES (auth.uid(), v_task.xp_reward)
  ON CONFLICT (id) DO UPDATE SET total_xp = profiles.total_xp + v_task.xp_reward
  RETURNING total_xp INTO v_new_xp;

  RETURN json_build_object(
    'new_xp',       v_new_xp,
    'new_health',   v_new_health,
    'next_task_id', v_next_id,
    'next_due_date', v_next_due::TEXT,
    'task_type',    v_task.task_type,
    'xp_reward',    v_task.xp_reward
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_care_task(UUID) TO authenticated;

-- ─── Storage bucket: plant-images ─────────────────────────────────────────────
-- Public bucket (images are served via public URL); uploads are restricted by RLS.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'plant-images',
  'plant-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Public read (bucket is public, so anyone with the URL can load the image)
CREATE POLICY IF NOT EXISTS "plant_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'plant-images');

-- Authenticated users can upload only into their own user-ID sub-folder
CREATE POLICY IF NOT EXISTS "plant_images_auth_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'plant-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can delete only their own images
CREATE POLICY IF NOT EXISTS "plant_images_auth_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'plant-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── Plants table: photo URL ──────────────────────────────────────────────────

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- ─── Plants table: health diagnostics ────────────────────────────────────────

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS health_issues   TEXT[],
  ADD COLUMN IF NOT EXISTS health_remedies TEXT[];

-- ─── Plants table: pro tips (technical/horticultural remedies) ──────────────
-- health_remedies holds the beginner-friendly "home tips"; this column holds
-- the more technical remedies (soil pH, drainage, fertilizer ratios, etc.)

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS health_tips_pro TEXT[];

-- ─── Plants table: toxicity ──────────────────────────────────────────────────
-- Nullable: null means "not yet assessed" (older plants scanned before this feature).

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS toxic_to_humans BOOLEAN,
  ADD COLUMN IF NOT EXISTS toxic_to_pets   BOOLEAN,
  ADD COLUMN IF NOT EXISTS toxicity_note   TEXT;

NOTIFY pgrst, 'reload schema';

-- ─── Favourites ───────────────────────────────────────────────────────────────
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

-- ─── Journal entries ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.journal_entries (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id   UUID        REFERENCES public.plants(id) ON DELETE SET NULL,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_type TEXT        NOT NULL CHECK (entry_type IN (
                           'added', 'watered', 'fertilized', 'misted',
                           'level_up', 'health_issue', 'note'
                         )),
  message    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS journal_entries_user_created_idx
  ON public.journal_entries (user_id, created_at DESC);

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own journal entries"
  ON public.journal_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own journal entries"
  ON public.journal_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own journal entries"
  ON public.journal_entries FOR DELETE USING (auth.uid() = user_id);

-- ─── Plant progress photos ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plant_photos (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id   UUID        NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  photo_url  TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS plant_photos_plant_id_idx ON public.plant_photos (plant_id);

ALTER TABLE public.plant_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own plant photos"
  ON public.plant_photos FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own plant photos"
  ON public.plant_photos FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own plant photos"
  ON public.plant_photos FOR DELETE USING (auth.uid() = user_id);

-- ─── Plants table: native calendar sync ──────────────────────────────────────
-- Stores the expo-calendar event ID for the plant's watering reminder, once
-- the user opts in via "Add to Calendar" on the Plant Detail screen.
-- Null means no calendar event has been created yet.

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS calendar_event_id TEXT;

NOTIFY pgrst, 'reload schema';

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

-- ─── Profiles table: membership & scan limiting ──────────────────────────────
-- membership_tier / scan_count_current_period / scan_period_reset_at already
-- exist on the live table; the ALTER below is a documenting no-op (IF NOT
-- EXISTS) so schema.sql stays in sync without touching the real columns.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS membership_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (membership_tier IN ('free', 'basic', 'pro')),
  ADD COLUMN IF NOT EXISTS scan_count_current_period INTEGER NOT NULL DEFAULT 0
    CHECK (scan_count_current_period >= 0),
  ADD COLUMN IF NOT EXISTS scan_period_reset_at TIMESTAMPTZ;

-- Lazily resets the caller's scan period if it has expired (or was never
-- set), creating a default profile row first if none exists yet (mirrors the
-- upsert-on-first-use pattern in increment_xp). Returns the (possibly
-- just-reset) counters — the tier -> scan limit mapping lives client-side in
-- lib/scanLimits.ts, not here.
CREATE OR REPLACE FUNCTION public.get_scan_status()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier     TEXT;
  v_count    INTEGER;
  v_reset_at TIMESTAMPTZ;
BEGIN
  SELECT membership_tier, scan_count_current_period, scan_period_reset_at
    INTO v_tier, v_count, v_reset_at
  FROM profiles
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    INSERT INTO profiles (id, membership_tier, scan_count_current_period, scan_period_reset_at)
    VALUES (auth.uid(), 'free', 0, NOW() + INTERVAL '1 month')
    RETURNING membership_tier, scan_count_current_period, scan_period_reset_at
      INTO v_tier, v_count, v_reset_at;
  ELSIF v_reset_at IS NULL OR v_reset_at <= NOW() THEN
    UPDATE profiles
      SET scan_count_current_period = 0,
          scan_period_reset_at = NOW() + INTERVAL '1 month'
      WHERE id = auth.uid()
      RETURNING membership_tier, scan_count_current_period, scan_period_reset_at
        INTO v_tier, v_count, v_reset_at;
  END IF;

  RETURN json_build_object(
    'membership_tier', v_tier,
    'scan_count_current_period', v_count,
    'scan_period_reset_at', v_reset_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_scan_status() TO authenticated;

-- Atomic +N to the caller's scan count — mirrors increment_xp. Defaults to
-- +1 for regular single-photo scans; called with p_amount=3 for Lawn Health
-- Scans (3 images in one Gemini call, roughly 3x the cost of a normal scan).
-- Call from client after a successful AI identification:
-- supabase.rpc('increment_scan_count') or supabase.rpc('increment_scan_count', { p_amount: 3 })
--
-- The original zero-arg version is dropped first since CREATE OR REPLACE
-- can't change a function's parameter list — without the DROP, Postgres
-- would end up with two overloaded functions instead of one.
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

-- ─── Spaces ───────────────────────────────────────────────────────────────────
-- Physical locations a plant can be organized under (e.g. "Living Room",
-- "Balcony"). Purely organizational — deleting a Space never deletes the
-- plants inside it (see plants.space_id below).

CREATE TABLE IF NOT EXISTS public.spaces (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS spaces_user_id_idx ON public.spaces (user_id);

ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own spaces"
  ON public.spaces FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own spaces"
  ON public.spaces FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own spaces"
  ON public.spaces FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own spaces"
  ON public.spaces FOR DELETE
  USING (auth.uid() = user_id);

-- ─── Plants table: space assignment ──────────────────────────────────────────
-- Nullable — a plant with no space is simply unassigned ("Your Plants" still
-- shows every plant regardless of space_id). ON DELETE SET NULL means
-- deleting a Space unassigns its plants instead of deleting them.

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES public.spaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS plants_space_id_idx ON public.plants (space_id);

-- ─── Favourites table: space_id mirror ───────────────────────────────────────
-- Mirrored for consistency with other plant fields duplicated on favourites.
-- Kept as a real FK (unlike the plain-scalar fields such as soil_type) so a
-- deleted Space cleanly unassigns favourites too rather than leaving a
-- dangling id.

ALTER TABLE public.favourites
  ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES public.spaces(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';

-- ─── Plants & Favourites: AI visual health diagnosis ─────────────────────────
-- Deliberately separate from health_percent (care/happiness, driven by
-- watering adherence) and from health_issues/health_remedies/health_tips_pro
-- (the existing initial-scan remedy-suggestion arrays). This is a distinct,
-- independently re-checkable visual diagnosis, refreshed via "Re-check
-- Health" without re-identifying the plant or touching any of the above.
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

-- ─── Plants & Favourites: Grass Planner (lawn care) ──────────────────────────
-- Run directly by the user against the live DB (not captured here at the
-- time); recorded retroactively to keep this accumulator accurate with the
-- live schema. is_grass flags a plants/favourites row as a lawn rather than
-- a normal plant, routing it to a distinct Grass Planner UI/care-plan flow.

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS is_grass BOOLEAN,
  ADD COLUMN IF NOT EXISTS lawn_length_m NUMERIC,
  ADD COLUMN IF NOT EXISTS lawn_width_m NUMERIC,
  ADD COLUMN IF NOT EXISTS lawn_area_m2 NUMERIC,
  ADD COLUMN IF NOT EXISTS sun_exposure TEXT,
  ADD COLUMN IF NOT EXISTS lawn_condition TEXT,
  ADD COLUMN IF NOT EXISTS fertilizing_frequency_days INTEGER,
  ADD COLUMN IF NOT EXISTS last_fertilized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mowing_frequency_days INTEGER,
  ADD COLUMN IF NOT EXISTS last_mowed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS grass_health_issues JSONB;

ALTER TABLE public.favourites
  ADD COLUMN IF NOT EXISTS is_grass BOOLEAN,
  ADD COLUMN IF NOT EXISTS lawn_length_m NUMERIC,
  ADD COLUMN IF NOT EXISTS lawn_width_m NUMERIC,
  ADD COLUMN IF NOT EXISTS lawn_area_m2 NUMERIC,
  ADD COLUMN IF NOT EXISTS sun_exposure TEXT,
  ADD COLUMN IF NOT EXISTS lawn_condition TEXT,
  ADD COLUMN IF NOT EXISTS fertilizing_frequency_days INTEGER,
  ADD COLUMN IF NOT EXISTS last_fertilized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mowing_frequency_days INTEGER,
  ADD COLUMN IF NOT EXISTS last_mowed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS grass_health_issues JSONB;

NOTIFY pgrst, 'reload schema';

-- ─── Plants: Lawn health scan score ───────────────────────────────────────────
-- Written by the new analyze-grass-health edge function after a 3-photo
-- guided scan. issues/tips reuse grass_health_issues and health_tips_pro
-- (see above) — only the numeric score needed a new column. Plants-only
-- (not favourites), matching the precedent set by calendar_event_id.

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS lawn_health_level SMALLINT
    CHECK (lawn_health_level BETWEEN 1 AND 5);

NOTIFY pgrst, 'reload schema';

-- ─── Plants: Lawn health scan timestamp ──────────────────────────────────────

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS lawn_health_checked_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 6: Smart Watering — rain-awareness + seasonal adjustment
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Location (profiles) ────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS latitude NUMERIC,
  ADD COLUMN IF NOT EXISTS longitude NUMERIC,
  ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

-- ── Rain-completion tracking (care_tasks) ──────────────────────────────────
-- completed_via distinguishes a real user action from an automated
-- rain-skip. No streak system reads this yet (none exists in the app today)
-- — this just leaves the hook in place for when one is built.
ALTER TABLE public.care_tasks
  ADD COLUMN IF NOT EXISTS completed_via TEXT NOT NULL DEFAULT 'user'
    CHECK (completed_via IN ('user', 'rain')),
  ADD COLUMN IF NOT EXISTS rain_mm NUMERIC;

-- ── Seasonal multiplier helper ─────────────────────────────────────────────
-- Applied only to outdoor/grass watering (see complete_care_task below).
-- Southern hemisphere (negative latitude) shifts the month by 6 to flip the
-- seasons; unknown location defaults to Northern Hemisphere.
CREATE OR REPLACE FUNCTION public.get_seasonal_multiplier(p_user_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_lat NUMERIC;
  v_month INTEGER;
  v_effective_month INTEGER;
BEGIN
  SELECT latitude INTO v_lat FROM profiles WHERE id = p_user_id;
  v_month := EXTRACT(MONTH FROM CURRENT_DATE);
  v_effective_month := CASE WHEN COALESCE(v_lat, 1) < 0
    THEN ((v_month + 5) % 12) + 1
    ELSE v_month
  END;

  RETURN CASE
    WHEN v_effective_month IN (12, 1, 2) THEN 1.5   -- winter: water less often
    WHEN v_effective_month IN (3, 4, 5)  THEN 1.0   -- spring: baseline
    WHEN v_effective_month IN (6, 7, 8)  THEN 0.75  -- summer: water more often
    ELSE 1.1                                          -- fall: slightly less often
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_seasonal_multiplier(UUID) TO authenticated, service_role;

-- ── complete_care_task(): now applies the seasonal multiplier to the next
--    due date for outdoor/grass watering tasks only. Health boost, XP,
--    indoor plants, and non-watering task types are all unchanged.
CREATE OR REPLACE FUNCTION public.complete_care_task(task_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task             care_tasks;
  v_plant_health     INTEGER;
  v_growing_location TEXT;
  v_is_grass         BOOLEAN;
  v_new_xp           INTEGER;
  v_new_health       INTEGER;
  v_next_id          UUID;
  v_next_due         DATE;
  v_health_boost     INTEGER;
  v_multiplier       NUMERIC := 1.0;
BEGIN
  SELECT ct.* INTO v_task
  FROM   care_tasks ct
  WHERE  ct.id = task_id
    AND  ct.user_id = auth.uid()
    AND  ct.completed_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found, already completed, or unauthorized';
  END IF;

  IF v_task.due_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Too early: task is not due until %', v_task.due_date;
  END IF;

  UPDATE care_tasks SET completed_at = NOW(), completed_via = 'user' WHERE id = task_id;

  SELECT health_percent, growing_location, is_grass
    INTO v_plant_health, v_growing_location, v_is_grass
    FROM plants WHERE id = v_task.plant_id;

  v_health_boost := CASE v_task.task_type
    WHEN 'watering'    THEN 8
    WHEN 'fertilizing' THEN 15
    WHEN 'misting'     THEN 3
    ELSE 5
  END;

  v_new_health := LEAST(v_plant_health + v_health_boost, 100);
  UPDATE plants
    SET health_percent = v_new_health,
        last_watered   = CASE WHEN v_task.task_type = 'watering' THEN NOW() ELSE last_watered END
    WHERE id = v_task.plant_id;

  IF v_task.task_type = 'watering' AND (v_is_grass IS TRUE OR v_growing_location IN ('outdoor', 'both')) THEN
    v_multiplier := public.get_seasonal_multiplier(auth.uid());
  END IF;

  v_next_due := CURRENT_DATE + GREATEST(1, ROUND(v_task.interval_days * v_multiplier));
  INSERT INTO care_tasks (plant_id, user_id, task_type, due_date, xp_reward, interval_days)
  VALUES (v_task.plant_id, auth.uid(), v_task.task_type, v_next_due, v_task.xp_reward, v_task.interval_days)
  RETURNING id INTO v_next_id;

  INSERT INTO profiles (id, total_xp)
  VALUES (auth.uid(), v_task.xp_reward)
  ON CONFLICT (id) DO UPDATE SET total_xp = profiles.total_xp + v_task.xp_reward
  RETURNING total_xp INTO v_new_xp;

  RETURN json_build_object(
    'new_xp',       v_new_xp,
    'new_health',   v_new_health,
    'next_task_id', v_next_id,
    'next_due_date', v_next_due::TEXT,
    'task_type',    v_task.task_type,
    'xp_reward',    v_task.xp_reward
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_care_task(UUID) TO authenticated;

-- ── Rain-check candidate lookup (service role only — no auth.uid(), this
--    runs from a scheduled edge function with no user session) ────────────
CREATE OR REPLACE FUNCTION public.get_rain_check_candidates()
RETURNS TABLE (
  task_id UUID, plant_id UUID, user_id UUID, interval_days INTEGER,
  last_watered TIMESTAMPTZ, latitude NUMERIC, longitude NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ct.id, ct.plant_id, ct.user_id, ct.interval_days, p.last_watered, pr.latitude, pr.longitude
  FROM care_tasks ct
  JOIN plants p ON p.id = ct.plant_id
  JOIN profiles pr ON pr.id = ct.user_id
  WHERE ct.task_type = 'watering'
    AND ct.completed_at IS NULL
    AND ct.due_date <= CURRENT_DATE
    AND (p.is_grass IS TRUE OR p.growing_location IN ('outdoor', 'both'))
    AND pr.latitude IS NOT NULL AND pr.longitude IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_rain_check_candidates() TO service_role;

-- ── Rain-triggered completion (service role only) ──────────────────────────
-- No auth.uid() check — the task's own user_id is authoritative since this
-- is invoked server-to-server, not from a logged-in session. XP is
-- deliberately NOT awarded: rain-skips should only reflect the user's own
-- actions (same reasoning as excluding them from a future streak feature —
-- no streak system exists yet, this is just consistent with that principle).
CREATE OR REPLACE FUNCTION public.complete_care_task_via_rain(p_task_id UUID, p_rain_mm NUMERIC)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task         care_tasks;
  v_plant_health INTEGER;
  v_plant_name   TEXT;
  v_new_health   INTEGER;
  v_next_id      UUID;
  v_next_due     DATE;
  v_multiplier   NUMERIC;
BEGIN
  SELECT ct.* INTO v_task
  FROM   care_tasks ct
  WHERE  ct.id = p_task_id
    AND  ct.completed_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found or already completed';
  END IF;

  UPDATE care_tasks
    SET completed_at = NOW(), completed_via = 'rain', rain_mm = p_rain_mm
    WHERE id = p_task_id;

  SELECT health_percent, name INTO v_plant_health, v_plant_name FROM plants WHERE id = v_task.plant_id;
  v_new_health := LEAST(v_plant_health + 8, 100);

  UPDATE plants
    SET health_percent = v_new_health,
        last_watered   = NOW()
    WHERE id = v_task.plant_id;

  v_multiplier := public.get_seasonal_multiplier(v_task.user_id);
  v_next_due := CURRENT_DATE + GREATEST(1, ROUND(v_task.interval_days * v_multiplier));

  INSERT INTO care_tasks (plant_id, user_id, task_type, due_date, xp_reward, interval_days)
  VALUES (v_task.plant_id, v_task.user_id, v_task.task_type, v_next_due, v_task.xp_reward, v_task.interval_days)
  RETURNING id INTO v_next_id;

  INSERT INTO journal_entries (plant_id, user_id, entry_type, message)
  VALUES (v_task.plant_id, v_task.user_id, 'watered', v_plant_name || ' watered by rain (' || p_rain_mm || 'mm)');

  RETURN json_build_object(
    'new_health',    v_new_health,
    'next_task_id',  v_next_id,
    'next_due_date', v_next_due::TEXT,
    'rain_mm',       p_rain_mm
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_care_task_via_rain(UUID, NUMERIC) TO service_role;

NOTIFY pgrst, 'reload schema';
