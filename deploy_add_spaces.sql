-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/xiqexeullniezghwdjfb/sql/new

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
