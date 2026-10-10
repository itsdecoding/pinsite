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
