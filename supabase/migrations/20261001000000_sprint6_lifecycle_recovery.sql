-- ============================================================================
-- PINSITE v1.8: DATABASE FOUNDATION & SECURITY MIGRATION (SPRINT 6)
-- Migration: 20261001000000_sprint6_lifecycle_recovery.sql
-- ============================================================================

-- 1. Ensure pgcrypto extension is active
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Extend public.leads for Quarantine, Cooldown, and Escalation
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS dnc_flag BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS quarantined_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disposal_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_by_manager UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ;

-- 3. Extend public.profiles for Password Management Gate
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS require_password_change BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS temp_password_issued_at TIMESTAMPTZ;

-- 4. Extend public.calls and public.assignment_history for Mirror Mode Audit
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS acted_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS on_behalf_of UUID REFERENCES public.profiles(id);

ALTER TABLE public.assignment_history
  ADD COLUMN IF NOT EXISTS acted_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS on_behalf_of UUID REFERENCES public.profiles(id);

-- 5. FCM Device Token Table
CREATE TABLE IF NOT EXISTS public.fcm_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  device_type TEXT CHECK (device_type IN ('mobile_ios', 'mobile_android', 'desktop', 'unknown')),
  user_agent TEXT,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. RLS Policies on public.fcm_tokens
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own fcm tokens" ON public.fcm_tokens;
CREATE POLICY "Users view own fcm tokens"
  ON public.fcm_tokens FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own fcm tokens" ON public.fcm_tokens;
CREATE POLICY "Users insert own fcm tokens"
  ON public.fcm_tokens FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own fcm tokens" ON public.fcm_tokens;
CREATE POLICY "Users update own fcm tokens"
  ON public.fcm_tokens FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own fcm tokens" ON public.fcm_tokens;
CREATE POLICY "Users delete own fcm tokens"
  ON public.fcm_tokens FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access on fcm tokens" ON public.fcm_tokens;
CREATE POLICY "Service role full access on fcm tokens"
  ON public.fcm_tokens FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 7. Seed Pinsite System Bot (Safely inserting auth user first to satisfy foreign key)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000001') THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud
    )
    VALUES (
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000000',
      'bot@pinsite.pro',
      crypt('PinsiteBotInternal2026!', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Pinsite Bot"}'::jsonb,
      NOW(),
      NOW(),
      'authenticated',
      'authenticated'
    );
  END IF;

  INSERT INTO public.profiles (id, full_name, role, is_available, active)
  VALUES ('00000000-0000-0000-0000-000000000001', 'Pinsite Bot', 'admin', false, true)
  ON CONFLICT (id) DO UPDATE 
  SET full_name = 'Pinsite Bot', role = 'admin', is_available = false, active = true;
END $$;

-- 8. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_leads_disposal 
  ON public.leads(disposal_scheduled_at) 
  WHERE deleted_at IS NULL AND disposal_scheduled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_quarantined 
  ON public.leads(status, quarantined_at) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_cooldown 
  ON public.leads(cooldown_until) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user 
  ON public.fcm_tokens(user_id);

-- 9. Trigger function: handle_lead_disposition_lifecycle
CREATE OR REPLACE FUNCTION public.handle_lead_disposition_lifecycle()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role user_role;
BEGIN
  -- 1. Security Check: Callers must not manually modify manager-restricted columns
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role = 'caller' THEN
    IF NEW.claimed_by_manager IS DISTINCT FROM OLD.claimed_by_manager THEN
      RAISE EXCEPTION 'Callers are not permitted to modify claimed_by_manager';
    END IF;
    IF NEW.supervisor_id IS DISTINCT FROM OLD.supervisor_id THEN
      RAISE EXCEPTION 'Callers are not permitted to modify supervisor_id';
    END IF;
    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at AND NEW.status != 'dnc' THEN
      RAISE EXCEPTION 'Callers are not permitted to modify deleted_at directly';
    END IF;
  END IF;

  -- 2. State Machine Transitions
  -- Branch A: Entering 'not_interested' -> 7-Day Quarantine
  IF NEW.status = 'not_interested' AND (OLD.status IS DISTINCT FROM 'not_interested') THEN
    NEW.quarantined_at := NOW();
    NEW.disposal_scheduled_at := NOW() + INTERVAL '7 days';
    NEW.rejected_by := COALESCE(OLD.assigned_to, NEW.assigned_to, auth.uid());
    NEW.assigned_to := NULL; -- Frees caller quota immediately
    NEW.cooldown_until := NULL;
  
  -- Branch B: Rescuing from 'not_interested' -> Clear All Quarantine Metadata & Attribution
  ELSIF OLD.status = 'not_interested' AND NEW.status != 'not_interested' THEN
    NEW.quarantined_at := NULL;
    NEW.disposal_scheduled_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.rejected_by := NULL;

  -- Branch C: Entering 'dnc' -> Immediate Soft-Delete & SHA-256 Hash (DPDP Compliance)
  ELSIF NEW.status = 'dnc' AND (OLD.status IS DISTINCT FROM 'dnc') THEN
    NEW.deleted_at := NOW();
    NEW.assigned_to := NULL;
    NEW.dnc_flag := TRUE;
    
    IF COALESCE(NEW.normalized_phone, NEW.phone) IS NOT NULL THEN
      INSERT INTO public.dnc_blacklist (phone_hash, reason)
      VALUES (
        encode(digest(COALESCE(NEW.normalized_phone, NEW.phone), 'sha256'), 'hex'), 
        COALESCE(NEW.rejection_reason, 'caller_dnc_request')
      )
      ON CONFLICT (phone_hash) DO NOTHING;
    END IF;

  -- Branch D: Entering 'interested' -> Hot Escalation Timestamp
  ELSIF NEW.status = 'interested' AND (OLD.status IS DISTINCT FROM 'interested') THEN
    NEW.escalated_at := NOW();
    NEW.cooldown_until := NULL;

  -- Branch E: No Answer / Gatekeeper Cadence Cooldown
  ELSIF NEW.status IN ('no_answer', 'gatekeeper') 
    AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.attempts_count IS DISTINCT FROM NEW.attempts_count) THEN
    IF NEW.attempts_count = 1 THEN
      NEW.cooldown_until := NOW() + INTERVAL '3 hours';
    ELSIF NEW.attempts_count = 2 THEN
      NEW.cooldown_until := NOW() + INTERVAL '24 hours';
    ELSIF NEW.attempts_count = 3 THEN
      NEW.cooldown_until := NOW() + INTERVAL '48 hours';
    ELSIF NEW.attempts_count = 4 THEN
      NEW.cooldown_until := NOW() + INTERVAL '72 hours';
    ELSE
      -- Attempt >= 5 exhausted -> auto-quarantine
      NEW.status := 'not_interested';
      NEW.quarantined_at := NOW();
      NEW.disposal_scheduled_at := NOW() + INTERVAL '7 days';
      NEW.rejected_by := COALESCE(OLD.assigned_to, auth.uid());
      NEW.assigned_to := NULL;
      NEW.cooldown_until := NULL;
      NEW.rejection_reason := 'Cadence exhausted (5 attempts with no contact)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_lifecycle ON public.leads;
CREATE TRIGGER trg_lead_lifecycle
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_lead_disposition_lifecycle();

-- 10. Nightly Quarantine Disposal Worker (Targets not_interested only)
CREATE OR REPLACE FUNCTION public.cron_dispose_quarantined_leads()
RETURNS void 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.leads
  SET deleted_at = NOW()
  WHERE disposal_scheduled_at <= NOW()
    AND deleted_at IS NULL
    AND status = 'not_interested';
END;
$$;

-- 11. Update CRON 3: Exclude Quarantined Leads from 7-Day Stale Recycling
CREATE OR REPLACE FUNCTION public.recycle_stale_leads()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 1. Recycle leads with 3+ attempts and no call in 7 days, excluding closed, dnc, and quarantined
  UPDATE public.leads 
  SET status = 'unassigned', assigned_to = NULL, assigned_date = NULL, updated_at = NOW()
  WHERE attempts_count >= 3 
    AND last_called_at < NOW() - INTERVAL '7 days'
    AND status NOT IN ('closed_won', 'closed_lost', 'dnc', 'not_interested');

  -- 2. Prune idempotency keys older than 48 hours
  DELETE FROM public.idempotency_keys WHERE created_at < NOW() - INTERVAL '48 hours';

  -- 3. Recover orphaned 'sending' emails older than 5 minutes
  UPDATE public.email_queue
  SET status = 'pending', retry_count = retry_count + 1
  WHERE status = 'sending' AND claimed_at < NOW() - INTERVAL '5 minutes' AND retry_count < 3;

  -- 4. Retry transient 'failed' emails created in the last 24 hours
  UPDATE public.email_queue
  SET status = 'pending', retry_count = retry_count + 1
  WHERE status = 'failed' 
    AND retry_count < 3 
    AND created_at > NOW() - INTERVAL '24 hours';

  -- 5. Mark permanently failed if retry_count >= 3
  UPDATE public.email_queue
  SET status = 'failed', error_message = 'Dispatch timeout after 3 attempts'
  WHERE status = 'pending' AND retry_count >= 3;
END;
$$;

-- 12. Safe Idempotent Schedule for Nightly Quarantine Disposal Worker
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('dispose-quarantined-leads');
  END IF;
EXCEPTION WHEN OTHERS THEN
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'dispose-quarantined-leads',
      '0 2 * * *',
      'SELECT public.cron_dispose_quarantined_leads()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
END $$;
