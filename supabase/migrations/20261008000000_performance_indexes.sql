-- ============================================================================
-- PINSITE v1.8: PERFORMANCE & LATENCY INDEXES MIGRATION
-- Migration: 20261008000000_performance_indexes.sql
-- ============================================================================

-- 1. Calls Table Indexes
-- Accelerate fleet-wide range queries (e.g. called_at >= TODAY)
CREATE INDEX IF NOT EXISTS idx_calls_called_at 
  ON public.calls(called_at DESC);

-- Accelerate call history lookups by lead (Mirror Mode, Cockpit Dossier)
CREATE INDEX IF NOT EXISTS idx_calls_lead_id 
  ON public.calls(lead_id);

-- Accelerate outcome and connect rate calculations
CREATE INDEX IF NOT EXISTS idx_calls_called_at_outcome 
  ON public.calls(called_at DESC, outcome);

-- 2. Profiles Table Indexes
-- Accelerate roster, caller filtering, and assignment target lookups
CREATE INDEX IF NOT EXISTS idx_profiles_role_active 
  ON public.profiles(role, active, is_available);

-- 3. Leads Table Indexes
-- Accelerate CSV deduplication and phone lookup
CREATE INDEX IF NOT EXISTS idx_leads_normalized_phone 
  ON public.leads(normalized_phone) 
  WHERE deleted_at IS NULL;

-- Accelerate assigned active lead queries and queue counts
CREATE INDEX IF NOT EXISTS idx_leads_assigned_active 
  ON public.leads(assigned_to, status) 
  WHERE deleted_at IS NULL;

-- 4. RLS Optimization for current_user_role
-- Evaluates directly against JWT user_metadata in 0ms when present,
-- or cleanly evaluates (SELECT role FROM public.profiles WHERE id = auth.uid()) without per-row table scans.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    CASE 
      WHEN (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->'user_metadata'->>'role') IN ('caller', 'developer', 'manager', 'admin')
      THEN (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->'user_metadata'->>'role')::user_role
      ELSE NULL
    END,
    CASE 
      WHEN (NULLIF(current_setting('request.jwt.claim.user_metadata', true), '')::jsonb->>'role') IN ('caller', 'developer', 'manager', 'admin')
      THEN (NULLIF(current_setting('request.jwt.claim.user_metadata', true), '')::jsonb->>'role')::user_role
      ELSE NULL
    END,
    (SELECT role FROM public.profiles WHERE id = auth.uid())
  );
$$;

