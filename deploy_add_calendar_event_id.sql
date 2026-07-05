-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/xiqexeullniezghwdjfb/sql/new

-- ─── Plants table: native calendar sync ──────────────────────────────────────
-- Stores the expo-calendar event ID for the plant's watering reminder, once
-- the user opts in via "Add to Calendar" on the Plant Detail screen.
-- Null means no calendar event has been created yet.

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS calendar_event_id TEXT;

NOTIFY pgrst, 'reload schema';
