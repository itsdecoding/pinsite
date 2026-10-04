-- Migration: Update stored procedures to use canonical /studio/ links for all notification events
-- Targets: assign_daily_leads, redistribute_caller_leads, detect_inactive_callers, cron_auto_rebalance_leads

-- 1. Upgraded Depth-Aware assign_daily_leads Function
CREATE OR REPLACE FUNCTION public.assign_daily_leads(p_target_cap INT DEFAULT 30)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller RECORD;
  v_needed INT;
  v_lead_ids UUID[];
  v_total_assigned INT := 0;
  v_remaining_pool INT;
BEGIN
  -- Count available unassigned pool
  SELECT COUNT(*) INTO v_remaining_pool
  FROM public.leads
  WHERE status = 'unassigned' AND score >= 70 AND dnc_flag = FALSE AND deleted_at IS NULL;

  IF v_remaining_pool = 0 THEN
    RETURN json_build_object('success', true, 'assigned_count', 0, 'message', 'Unassigned pool is empty');
  END IF;

  -- Iterate through callers ORDERED BY CURRENT ACTIVE QUEUE ASC (lightest caller first)
  FOR v_caller IN 
    SELECT 
      p.id, 
      p.full_name,
      COALESCE(l_count.cnt, 0) AS current_load
    FROM public.profiles p
    LEFT JOIN (
      SELECT assigned_to, COUNT(*) AS cnt 
      FROM public.leads 
      WHERE deleted_at IS NULL 
        AND status NOT IN ('closed_won', 'closed_lost', 'dnc', 'not_interested')
      GROUP BY assigned_to
    ) l_count ON l_count.assigned_to = p.id
    WHERE p.role = 'caller' AND p.is_available = TRUE AND p.active = TRUE AND p.deleted_at IS NULL
    ORDER BY current_load ASC, p.created_at ASC
  LOOP
    EXIT WHEN v_remaining_pool <= 0;

    v_needed := GREATEST(0, p_target_cap - v_caller.current_load);
    v_needed := LEAST(v_needed, v_remaining_pool);

    IF v_needed > 0 THEN
      SELECT ARRAY_AGG(id) INTO v_lead_ids FROM (
        SELECT id FROM public.leads 
        WHERE status = 'unassigned' AND score >= 70 AND dnc_flag = FALSE AND deleted_at IS NULL
        ORDER BY score DESC, created_at ASC
        LIMIT v_needed
        FOR UPDATE SKIP LOCKED
      ) sub;

      IF v_lead_ids IS NOT NULL AND ARRAY_LENGTH(v_lead_ids, 1) > 0 THEN
        UPDATE public.leads 
        SET status = 'assigned', assigned_to = v_caller.id, assigned_date = CURRENT_DATE, updated_at = NOW()
        WHERE id = ANY(v_lead_ids);

        INSERT INTO public.assignment_history (lead_id, to_caller_id, reason)
        SELECT unnest(v_lead_ids), v_caller.id, 'daily_6am_topup';

        INSERT INTO public.notifications (user_id, type, title, body, link)
        VALUES (v_caller.id, 'leads_ready', 'Leads Assigned', 'Your queue has been refreshed with new leads.', '/studio/queue');

        v_total_assigned := v_total_assigned + ARRAY_LENGTH(v_lead_ids, 1);
        v_remaining_pool := v_remaining_pool - ARRAY_LENGTH(v_lead_ids, 1);
      END IF;
    END IF;
  END LOOP;

  RETURN json_build_object('success', true, 'assigned_count', v_total_assigned);
END;
$$;

REVOKE ALL ON FUNCTION public.assign_daily_leads(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_daily_leads(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_daily_leads(INT) TO service_role;


-- 2. 1-Click Lead Redistribution
CREATE OR REPLACE FUNCTION public.redistribute_caller_leads(
  p_inactive_caller_id UUID,
  p_reason TEXT DEFAULT 'caller_inactive_10am'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lead RECORD;
  v_target UUID;
  v_assigned INTEGER := 0;
BEGIN
  IF current_user_role() NOT IN ('manager', 'admin') THEN
    RAISE EXCEPTION 'Only managers can redistribute leads';
  END IF;

  -- Safety Check: Ensure caller has not made any dials today
  IF EXISTS (
    SELECT 1 FROM public.calls
    WHERE caller_id = p_inactive_caller_id
      AND called_at >= CURRENT_DATE::timestamptz
  ) THEN
    RAISE EXCEPTION 'Cannot redistribute: caller has already made calls today';
  END IF;

  FOR v_lead IN
    SELECT id FROM public.leads
    WHERE assigned_to = p_inactive_caller_id
      AND status = 'assigned'
      AND deleted_at IS NULL
    ORDER BY score DESC
  LOOP
    SELECT id INTO v_target
    FROM public.profiles
    WHERE role = 'caller'
      AND is_available = TRUE
      AND active = TRUE
      AND id <> p_inactive_caller_id
      AND deleted_at IS NULL
    ORDER BY (SELECT COUNT(*) FROM public.leads WHERE assigned_to = profiles.id AND status = 'assigned') ASC
    LIMIT 1;

    IF v_target IS NOT NULL THEN
      UPDATE public.leads 
      SET assigned_to = v_target, assigned_date = CURRENT_DATE, updated_at = NOW()
      WHERE id = v_lead.id;

      INSERT INTO public.assignment_history (lead_id, from_caller_id, to_caller_id, assigned_by, reason)
      VALUES (v_lead.id, p_inactive_caller_id, v_target, auth.uid(), p_reason);

      INSERT INTO public.notifications (user_id, type, title, body, entity_type, entity_id, link)
      VALUES (v_target, 'lead_assigned', 'Lead Reassigned', 'A new lead has been assigned to your queue', 'lead', v_lead.id, '/studio/queue');

      v_assigned := v_assigned + 1;
    END IF;
  END LOOP;

  RETURN v_assigned;
END;
$$;

REVOKE ALL ON FUNCTION public.redistribute_caller_leads(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redistribute_caller_leads(UUID, TEXT) TO authenticated;


-- 3. Inactive Caller Detection
CREATE OR REPLACE FUNCTION public.detect_inactive_callers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller RECORD;
  v_calls_today INT;
  v_manager_id UUID;
BEGIN
  FOR v_caller IN 
    SELECT id, full_name FROM public.profiles 
    WHERE role = 'caller' AND is_available = TRUE AND active = TRUE AND deleted_at IS NULL
  LOOP
    IF EXISTS (SELECT 1 FROM public.leads WHERE assigned_to = v_caller.id AND assigned_date = CURRENT_DATE AND deleted_at IS NULL) THEN
      SELECT COUNT(*) INTO v_calls_today 
      FROM public.calls 
      WHERE caller_id = v_caller.id AND called_at >= CURRENT_DATE::timestamptz;

      IF v_calls_today = 0 THEN
        FOR v_manager_id IN SELECT id FROM public.profiles WHERE role IN ('manager', 'admin') AND active = TRUE LOOP
          INSERT INTO public.notifications (user_id, type, title, body, link)
          VALUES (
            v_manager_id, 
            'caller_inactive', 
            'Caller Inactive Alert', 
            'Caller ' || v_caller.full_name || ' has made 0 calls as of 10:00 AM IST.',
            '/studio/dashboard'
          );
        END LOOP;
      END IF;
    END IF;
  END LOOP;
END;
$$;


-- 4. 4-Hour Auto-Rebalance Worker Function
CREATE OR REPLACE FUNCTION public.cron_auto_rebalance_leads()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_team_avg NUMERIC;
  v_threshold INT;
  v_overloaded RECORD;
  v_underloaded RECORD;
  v_excess INT;
  v_to_move INT;
  v_lead_ids UUID[];
  v_bot_id UUID := '00000000-0000-0000-0000-000000000001';
  v_total_rebalanced INT := 0;
BEGIN
  -- 1. Calculate average active leads across active callers
  SELECT 
    COALESCE(AVG(cnt), 0) INTO v_team_avg
  FROM (
    SELECT p.id, COUNT(l.id) AS cnt
    FROM public.profiles p
    LEFT JOIN public.leads l ON l.assigned_to = p.id 
      AND l.deleted_at IS NULL 
      AND l.status NOT IN ('closed_won', 'closed_lost', 'dnc', 'not_interested')
    WHERE p.role = 'caller' AND p.active = TRUE AND p.deleted_at IS NULL
    GROUP BY p.id
  ) sub;

  -- 2. Threshold is 1.5x team average, with a minimum difference of 5 leads
  v_threshold := GREATEST(10, CEIL(v_team_avg * 1.5));

  -- 3. Loop over overloaded callers
  FOR v_overloaded IN
    SELECT p.id, p.full_name, COUNT(l.id) AS current_load
    FROM public.profiles p
    JOIN public.leads l ON l.assigned_to = p.id 
      AND l.deleted_at IS NULL 
      AND l.status NOT IN ('closed_won', 'closed_lost', 'dnc', 'not_interested')
    WHERE p.role = 'caller' AND p.active = TRUE AND p.deleted_at IS NULL
    GROUP BY p.id, p.full_name
    HAVING COUNT(l.id) > v_threshold
    ORDER BY current_load DESC
  LOOP
    v_excess := v_overloaded.current_load - FLOOR(v_team_avg)::INT;

    -- Find underloaded callers
    FOR v_underloaded IN
      SELECT p.id, p.full_name, COUNT(l.id) AS current_load
      FROM public.profiles p
      LEFT JOIN public.leads l ON l.assigned_to = p.id 
        AND l.deleted_at IS NULL 
        AND l.status NOT IN ('closed_won', 'closed_lost', 'dnc', 'not_interested')
      WHERE p.role = 'caller' AND p.active = TRUE AND p.deleted_at IS NULL
        AND p.id <> v_overloaded.id
      GROUP BY p.id, p.full_name
      HAVING COUNT(l.id) < FLOOR(v_team_avg)
      ORDER BY current_load ASC
    LOOP
      EXIT WHEN v_excess <= 0;

      v_to_move := LEAST(v_excess, (FLOOR(v_team_avg)::INT - v_underloaded.current_load));
      IF v_to_move <= 0 THEN v_to_move := 5; END IF;
      v_to_move := LEAST(v_to_move, v_excess);

      -- Select uncalled leads first (attempts_count = 0)
      SELECT ARRAY_AGG(id) INTO v_lead_ids FROM (
        SELECT id FROM public.leads
        WHERE assigned_to = v_overloaded.id
          AND deleted_at IS NULL
          AND status NOT IN ('closed_won', 'closed_lost', 'dnc', 'not_interested')
        ORDER BY attempts_count ASC, created_at ASC
        LIMIT v_to_move
        FOR UPDATE SKIP LOCKED
      ) sub;

      IF v_lead_ids IS NOT NULL AND ARRAY_LENGTH(v_lead_ids, 1) > 0 THEN
        UPDATE public.leads
        SET assigned_to = v_underloaded.id, assigned_date = CURRENT_DATE, updated_at = NOW()
        WHERE id = ANY(v_lead_ids);

        INSERT INTO public.assignment_history (lead_id, from_caller_id, to_caller_id, assigned_by, reason)
        SELECT unnest(v_lead_ids), v_overloaded.id, v_underloaded.id, v_bot_id, 'auto_rebalance_4h_cron';

        INSERT INTO public.notifications (user_id, type, title, body, link)
        VALUES (v_underloaded.id, 'lead_assigned', 'Leads Rebalanced', 'Leads rebalanced to your queue.', '/studio/queue');

        v_excess := v_excess - ARRAY_LENGTH(v_lead_ids, 1);
        v_total_rebalanced := v_total_rebalanced + ARRAY_LENGTH(v_lead_ids, 1);
      END IF;
    END LOOP;
  END LOOP;

  RETURN json_build_object('success', true, 'rebalanced_count', v_total_rebalanced);
END;
$$;

REVOKE ALL ON FUNCTION public.cron_auto_rebalance_leads() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cron_auto_rebalance_leads() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cron_auto_rebalance_leads() TO service_role;
