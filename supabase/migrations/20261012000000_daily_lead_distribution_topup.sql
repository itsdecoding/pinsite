-- ============================================================================
-- PINSITE v1.8: DAILY LEAD DISTRIBUTION & TRANSPARENT QUEUE MIGRATION
-- Migration: 20261012000000_daily_lead_distribution_topup.sql
-- ============================================================================

-- 1. Upgraded Depth-Aware assign_daily_leads Function
-- Fixes:
-- - Default target cap upgraded to 100 leads per caller
-- - Excludes 'interested' leads from caller's active queue load (they are in Interested Prospects)
-- - Removes rigid score >= 70 check so all scraped leads in pool are assigned (ordered by score DESC)
-- - Depth-aware calculation: needed = target_cap - current_load (e.g. 100 - 40 = 60)
-- - Distributes to lightest caller first (ORDER BY current_load ASC)
CREATE OR REPLACE FUNCTION public.assign_daily_leads(p_target_cap INT DEFAULT 100)
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
  WHERE status = 'unassigned' AND dnc_flag = FALSE AND deleted_at IS NULL;

  IF v_remaining_pool = 0 THEN
    RETURN json_build_object(
      'success', true, 
      'assigned_count', 0, 
      'remaining_pool', 0,
      'message', 'Unassigned pool is empty'
    );
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
        AND status NOT IN ('closed_won', 'closed_lost', 'dnc', 'not_interested', 'interested')
      GROUP BY assigned_to
    ) l_count ON l_count.assigned_to = p.id
    WHERE p.role = 'caller' 
      AND p.active = TRUE 
      AND COALESCE(p.is_available, TRUE) = TRUE 
      AND p.deleted_at IS NULL
    ORDER BY current_load ASC, p.created_at ASC
  LOOP
    -- Exit immediately when pool is empty
    EXIT WHEN v_remaining_pool <= 0;

    -- Depth-aware target: fill queue up to target cap
    v_needed := GREATEST(0, p_target_cap - v_caller.current_load);

    -- Cap per batch to distribute fairly across callers
    v_needed := LEAST(v_needed, v_remaining_pool);

    IF v_needed > 0 THEN
      SELECT ARRAY_AGG(id) INTO v_lead_ids FROM (
        SELECT id FROM public.leads 
        WHERE status = 'unassigned' AND dnc_flag = FALSE AND deleted_at IS NULL
        ORDER BY score DESC, created_at ASC
        LIMIT v_needed
        FOR UPDATE SKIP LOCKED
      ) sub;

      IF v_lead_ids IS NOT NULL AND ARRAY_LENGTH(v_lead_ids, 1) > 0 THEN
        UPDATE public.leads 
        SET status = 'assigned', 
            assigned_to = v_caller.id, 
            assigned_date = CURRENT_DATE, 
            updated_at = NOW()
        WHERE id = ANY(v_lead_ids);

        INSERT INTO public.assignment_history (lead_id, to_caller_id, reason)
        SELECT unnest(v_lead_ids), v_caller.id, 'daily_distribution_topup';

        INSERT INTO public.notifications (user_id, type, title, body, link)
        VALUES (v_caller.id, 'leads_ready', 'Leads Assigned', 'Your queue has been refreshed with new leads.', '/queue');

        v_total_assigned := v_total_assigned + ARRAY_LENGTH(v_lead_ids, 1);
        v_remaining_pool := v_remaining_pool - ARRAY_LENGTH(v_lead_ids, 1);
      END IF;
    END IF;
  END LOOP;

  RETURN json_build_object(
    'success', true, 
    'assigned_count', v_total_assigned,
    'remaining_pool', v_remaining_pool
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_daily_leads(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_daily_leads(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_daily_leads(INT) TO service_role;

-- 2. Update Transparent RLS Select Policy for Team Lead Flow
-- All authenticated agency members can view transparent queue columns
DROP POLICY IF EXISTS "leads_select" ON public.leads;
CREATE POLICY "leads_select" ON public.leads FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

-- 3. Idempotent Scheduling of Crons in pg_cron (Daily 6:00 AM IST distribution)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('assign-daily-leads');
    PERFORM cron.schedule(
      'assign-daily-leads',
      '30 0 * * *',
      'SELECT public.assign_daily_leads(100)'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
END $$;
