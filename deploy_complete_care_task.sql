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
