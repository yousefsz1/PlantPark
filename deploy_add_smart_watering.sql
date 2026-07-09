-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 6: Smart Watering — rain-awareness + seasonal adjustment
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Location (profiles) ────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS latitude NUMERIC,
  ADD COLUMN IF NOT EXISTS longitude NUMERIC,
  ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

-- ── 2. Rain-completion tracking (care_tasks) ──────────────────────────────
-- completed_via distinguishes a real user action from an automated
-- rain-skip. No streak system reads this yet (none exists in the app today)
-- — this just leaves the hook in place for when one is built.
ALTER TABLE public.care_tasks
  ADD COLUMN IF NOT EXISTS completed_via TEXT NOT NULL DEFAULT 'user'
    CHECK (completed_via IN ('user', 'rain')),
  ADD COLUMN IF NOT EXISTS rain_mm NUMERIC;

-- ── 3. Seasonal multiplier helper ─────────────────────────────────────────
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

-- ── 4. complete_care_task(): now applies the seasonal multiplier to the
--      next due date for outdoor/grass watering tasks only. Health boost,
--      XP, indoor plants, and non-watering task types are all unchanged.
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

-- ── 5. Rain-check candidate lookup (service role only — no auth.uid(),
--      this runs from a scheduled edge function with no user session) ─────
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

-- ── 6. Rain-triggered completion (service role only) ───────────────────────
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
