-- ============================================================================
-- Sprint 8 / Production Patch: Fix DNC Trigger Digest Schema Resolution
-- ============================================================================

-- Ensure pgcrypto is installed in extensions schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- Update trigger function to search extensions schema or explicitly use extensions.digest
CREATE OR REPLACE FUNCTION public.handle_lead_disposition_lifecycle()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
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
        encode(extensions.digest(COALESCE(NEW.normalized_phone, NEW.phone)::text, 'sha256'::text), 'hex'), 
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
