-- ============================================================================
-- PINSITE v1.8: LEAD DISTRIBUTION & AUTO-REBALANCE MIGRATION (SPRINT 6)
-- Migration: 20261001010000_sprint6_distribution_rebalance.sql
-- ============================================================================

-- 1. Upgraded Depth-Aware assign_daily_leads Function
-- Fixes:
-- - ORDER BY current_load ASC so lightest caller goes first
-- - Early EXIT WHEN pool is empty
-- - Depth-aware target (does not give leads to callers already holding heavy queues)
CREATE OR REPLACE FUNCTION public.assign_daily_leads(p_target_cap INT DEFAULT 30)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller RECORD;
  v_uncalled INT;
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

  -- Iterate through callers ORDERED BY CURRENT ACTIVE QUEUE ASC (lightest first)
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
    -- Exit immediately when pool is empty
    EXIT WHEN v_remaining_pool <= 0;

    -- Depth-aware target: don't give leads to someone already holding more than target cap
    v_needed := GREATEST(0, p_target_cap - v_caller.current_load);

    -- Cap per batch to distribute fairly across callers
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
        VALUES (v_caller.id, 'leads_ready', 'Leads Assigned', 'Your queue has been refreshed with new leads.', '/queue');

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

-- 2. 4-Hour Auto-Rebalance Worker Function
-- If any caller > 1.5x team average, automatically moves excess to lightest callers
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
        VALUES (v_underloaded.id, 'lead_assigned', 'Leads Rebalanced', 'Leads rebalanced to your queue.', '/queue');

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

-- 3. Idempotent Scheduling of Crons in pg_cron
-- assign-daily-leads at 6:00 AM IST (00:30 UTC)
-- auto-rebalance-leads every 4 hours
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('assign-daily-leads');
    PERFORM cron.schedule(
      'assign-daily-leads',
      '30 0 * * *',
      'SELECT public.assign_daily_leads()'
    );

    PERFORM cron.unschedule('auto-rebalance-leads');
    PERFORM cron.schedule(
      'auto-rebalance-leads',
      '0 */4 * * *',
      'SELECT public.cron_auto_rebalance_leads()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
END $$;
