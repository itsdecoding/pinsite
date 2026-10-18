-- Migration: 20261018000000_fix_lead_distribution_and_dnc_digest.sql
-- Fixes:
-- 1. assign_daily_leads fair round-robin distribution (prevents 1st caller from monopolizing entire pool)
-- 2. caller_update_lead DNC digest schema resolution (adds extensions to search_path to prevent error 42883)
-- 3. Idempotent scheduling of missing automation crons (callbacks, scoreboard aggregation, email queue, flush held)

-- ============================================================================
-- 1. Fair Round-Robin Lead Distribution Function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.assign_daily_leads(p_target_cap INT DEFAULT 100)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller RECORD;
  v_lead_ids UUID[];
  v_total_assigned INT := 0;
  v_remaining_pool INT := 0;
  v_needed INT := 0;
  v_slice INT := 10; -- Chunk size per round-robin pass to guarantee fair spread
  v_progress_made BOOLEAN := TRUE;
BEGIN
  -- Count total unassigned leads ready in pool
  SELECT COUNT(*) INTO v_remaining_pool
  FROM public.leads
  WHERE status = 'unassigned' AND dnc_flag = FALSE AND deleted_at IS NULL;

  IF v_remaining_pool = 0 THEN
    RETURN jsonb_build_object(
      'status', 'complete',
      'assigned_count', 0,
      'message', 'No unassigned leads found in master pool'
    );
  END IF;

  -- Fair multi-pass round-robin loop: distributes up to 10 leads per caller per pass
  WHILE v_remaining_pool > 0 AND v_progress_made LOOP
    v_progress_made := FALSE;

    FOR v_caller IN
      SELECT p.id, COALESCE(l_count.cnt, 0) AS current_load
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
      EXIT WHEN v_remaining_pool <= 0;

      v_needed := GREATEST(0, p_target_cap - v_caller.current_load);

      IF v_needed > 0 THEN
        v_needed := LEAST(v_needed, v_slice, v_remaining_pool);

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

          v_total_assigned := v_total_assigned + ARRAY_LENGTH(v_lead_ids, 1);
          v_remaining_pool := v_remaining_pool - ARRAY_LENGTH(v_lead_ids, 1);
          v_progress_made := TRUE;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  -- Notify callers who received new leads
  IF v_total_assigned > 0 THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    SELECT DISTINCT to_caller_id, 'leads_ready', 'Leads Assigned', 'Your queue has been refreshed with new leads.', '/queue'
    FROM public.assignment_history
    WHERE assigned_at >= NOW() - INTERVAL '10 seconds'
      AND reason = 'daily_distribution_topup';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'success',
    'assigned_count', v_total_assigned,
    'total_assigned', v_total_assigned,
    'remaining_pool', v_remaining_pool
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_daily_leads(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_daily_leads(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_daily_leads(INT) TO service_role;

-- ============================================================================
-- 2. Fix caller_update_lead DNC Digest Schema Resolution
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.caller_update_lead(
  p_lead_id UUID,
  p_status lead_status,
  p_callback_at TIMESTAMPTZ DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_duration_seconds INTEGER DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_normalized_phone TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.leads
    WHERE id = p_lead_id AND assigned_to = auth.uid() AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Not authorized to update this lead';
  END IF;

  SELECT normalized_phone INTO v_normalized_phone FROM public.leads WHERE id = p_lead_id;

  -- If DNC selected, atomically blacklist phone hash (DPDP compliance)
  IF p_status = 'dnc' AND v_normalized_phone IS NOT NULL THEN
    INSERT INTO public.dnc_blacklist (phone_hash, reason)
    VALUES (encode(extensions.digest(v_normalized_phone::text, 'sha256'::text), 'hex'), 'caller_dnc_request')
    ON CONFLICT (phone_hash) DO NOTHING;
  END IF;

  UPDATE public.leads
  SET status = p_status,
      dnc_flag = CASE WHEN p_status = 'dnc' THEN TRUE ELSE dnc_flag END,
      next_callback_at = COALESCE(p_callback_at, next_callback_at),
      last_called_at = NOW(),
      attempts_count = attempts_count + 1,
      updated_at = NOW()
  WHERE id = p_lead_id;

  INSERT INTO public.calls (lead_id, caller_id, outcome, notes, duration_seconds, callback_at)
  VALUES (p_lead_id, auth.uid(), p_status, p_notes, p_duration_seconds, p_callback_at);
END;
$$;

REVOKE ALL ON FUNCTION public.caller_update_lead(UUID, lead_status, TIMESTAMPTZ, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caller_update_lead(UUID, lead_status, TIMESTAMPTZ, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_update_lead(UUID, lead_status, TIMESTAMPTZ, TEXT, INTEGER) TO service_role;

-- ============================================================================
-- 3. Idempotent Scheduling of Missing Automation Crons
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- CRON 4: Due Notification Scanner (Every 5 Minutes)
    PERFORM cron.unschedule('cron_dispatch_due_notifications');
    PERFORM cron.schedule(
      'cron_dispatch_due_notifications',
      '*/5 * * * *',
      'SELECT public.dispatch_due_notifications()'
    );

    -- CRON 5: 11:59 PM IST (18:29 UTC) Nightly Scoreboard Aggregation
    PERFORM cron.unschedule('cron_aggregate_daily_scores');
    PERFORM cron.schedule(
      'cron_aggregate_daily_scores',
      '29 18 * * *',
      'SELECT public.aggregate_daily_scores()'
    );

    -- CRON 6: Email Queue Dispatcher (Every 2 Minutes)
    PERFORM cron.unschedule('cron_dispatch_email_queue');
    PERFORM cron.schedule(
      'cron_dispatch_email_queue',
      '*/2 * * * *',
      'SELECT public.dispatch_email_queue()'
    );

    -- CRON 7: Reset Held Emails at 00:01 AM IST (18:31 UTC previous day)
    PERFORM cron.unschedule('cron_flush_held_emails');
    PERFORM cron.schedule(
      'cron_flush_held_emails',
      '31 18 * * *',
      'SELECT public.flush_held_emails()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduling notice: %', SQLERRM;
END $$;
