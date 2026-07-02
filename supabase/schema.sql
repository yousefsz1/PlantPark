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
