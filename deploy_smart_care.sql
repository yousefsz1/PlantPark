-- ═══════════════════════════════════════════════════════════════════════════
-- SMART CARE — run once in the Supabase SQL Editor
-- 1. Seasonal fertilizing (winter slowdown, spring boost) for ALL plants
-- 2. Heatwave-check plumbing (candidates RPC + adjustment tracking column)
-- 3. Enforce the Basic/Pro gate on smart watering server-side (it was
--    advertised as a paid benefit but never actually enforced)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Task-type-aware seasonal multiplier ─────────────────────────────────
-- Watering: existing behavior (summer 0.75 / winter 1.5, outdoor only).
-- Fertilizing: winter 2.0 (near-dormancy — standard for houseplants too),
-- spring 0.8 (growth season), applied to ALL plants.
CREATE OR REPLACE FUNCTION public.get_seasonal_multiplier_v2(p_user_id UUID, p_task_type TEXT)
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

  IF p_task_type = 'watering' THEN
    RETURN CASE
      WHEN v_effective_month IN (12, 1, 2) THEN 1.5
      WHEN v_effective_month IN (3, 4, 5)  THEN 1.0
      WHEN v_effective_month IN (6, 7, 8)  THEN 0.75
      ELSE 1.1
    END;
  ELSIF p_task_type = 'fertilizing' THEN
    RETURN CASE
      WHEN v_effective_month IN (12, 1, 2) THEN 2.0
      WHEN v_effective_month IN (3, 4, 5)  THEN 0.8
      ELSE 1.0
    END;
  END IF;
  RETURN 1.0;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_seasonal_multiplier_v2(UUID, TEXT) TO authenticated, service_role;

-- ── 2. complete_care_task: fertilizing seasonality for all plants ──────────
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

  -- Seasonal adjustment: watering for outdoor/grass, fertilizing for all.
  IF v_task.task_type = 'watering' AND (v_is_grass IS TRUE OR v_growing_location IN ('outdoor', 'both')) THEN
    v_multiplier := public.get_seasonal_multiplier_v2(auth.uid(), 'watering');
  ELSIF v_task.task_type = 'fertilizing' THEN
    v_multiplier := public.get_seasonal_multiplier_v2(auth.uid(), 'fertilizing');
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

-- ── 3. Heatwave plumbing ───────────────────────────────────────────────────
-- Tracks that a task was already pulled forward for heat, so the 3-hourly
-- cron doesn't advance (and notify) repeatedly.
ALTER TABLE public.care_tasks ADD COLUMN IF NOT EXISTS heat_adjusted_at TIMESTAMPTZ;

-- Upcoming outdoor watering tasks that could be pulled earlier if a
-- heatwave is forecast. Basic/Pro only (paid smart-care feature).
CREATE OR REPLACE FUNCTION public.get_heat_check_candidates()
RETURNS TABLE (
  task_id UUID, plant_id UUID, user_id UUID, plant_name TEXT,
  due_date DATE, latitude NUMERIC, longitude NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ct.id, ct.plant_id, ct.user_id, p.name, ct.due_date, pr.latitude, pr.longitude
  FROM care_tasks ct
  JOIN plants p ON p.id = ct.plant_id
  JOIN profiles pr ON pr.id = ct.user_id
  WHERE ct.task_type = 'watering'
    AND ct.completed_at IS NULL
    AND ct.heat_adjusted_at IS NULL
    AND ct.due_date BETWEEN CURRENT_DATE + 2 AND CURRENT_DATE + 7
    AND (p.is_grass IS TRUE OR p.growing_location IN ('outdoor', 'both'))
    AND pr.latitude IS NOT NULL AND pr.longitude IS NOT NULL
    AND pr.membership_tier IN ('basic', 'pro');
$$;
GRANT EXECUTE ON FUNCTION public.get_heat_check_candidates() TO service_role;

-- ── 4. Enforce the paid gate on rain-skip smart watering ───────────────────
-- (Was advertised under Basic/Pro but ran for everyone.)
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
    AND pr.latitude IS NOT NULL AND pr.longitude IS NOT NULL
    AND pr.membership_tier IN ('basic', 'pro');
$$;
GRANT EXECUTE ON FUNCTION public.get_rain_check_candidates() TO service_role;

NOTIFY pgrst, 'reload schema';
