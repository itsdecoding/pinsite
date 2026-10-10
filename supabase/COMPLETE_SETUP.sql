-- Agency OS — Sprint 1 Master Schema Migration (v1.7 Frozen Specification)
-- Target: Supabase PostgreSQL

--------------------------------------------------------------------------------
-- 0. CLEAN RESET: Wipe previous tables, views, triggers & crons safely
--------------------------------------------------------------------------------

-- Unschedules existing pg_cron jobs if any exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- ignore if cron not active
END $$;

-- Drop triggers on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS trg_handle_new_user ON auth.users;

-- Drop all old application tables with CASCADE (deletes foreign keys & indexes)
DROP TABLE IF EXISTS public.email_queue CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.entity_comments CASCADE;
DROP TABLE IF EXISTS public.dm_messages CASCADE;
DROP TABLE IF EXISTS public.dm_threads CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.channel_reads CASCADE;
DROP TABLE IF EXISTS public.channel_members CASCADE;
DROP TABLE IF EXISTS public.channels CASCADE;
DROP TABLE IF EXISTS public.scores_daily CASCADE;
DROP TABLE IF EXISTS public.tasks CASCADE;
DROP TABLE IF EXISTS public.projects CASCADE;
DROP TABLE IF EXISTS public.deals CASCADE;
DROP TABLE IF EXISTS public.calls CASCADE;
DROP TABLE IF EXISTS public.assignment_history CASCADE;
DROP TABLE IF EXISTS public.leads CASCADE;
DROP TABLE IF EXISTS public.idempotency_keys CASCADE;
DROP TABLE IF EXISTS public.dnc_blacklist CASCADE;
DROP TABLE IF EXISTS public.invites CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Drop old views
DROP VIEW IF EXISTS public.profiles_public CASCADE;

-- Drop old functions
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.prevent_role_self_change() CASCADE;
DROP FUNCTION IF EXISTS public.caller_update_lead(UUID, lead_status, TIMESTAMPTZ, TEXT, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS public.dev_update_task(UUID, task_status, NUMERIC, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.redistribute_caller_leads(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.get_system_health() CASCADE;
DROP FUNCTION IF EXISTS public.claim_email_batch(INT) CASCADE;
DROP FUNCTION IF EXISTS public.assign_daily_leads() CASCADE;
DROP FUNCTION IF EXISTS public.detect_inactive_callers() CASCADE;
DROP FUNCTION IF EXISTS public.recycle_stale_leads() CASCADE;
DROP FUNCTION IF EXISTS public.dispatch_due_notifications() CASCADE;
DROP FUNCTION IF EXISTS public.aggregate_daily_scores() CASCADE;
DROP FUNCTION IF EXISTS public.dispatch_email_queue() CASCADE;
DROP FUNCTION IF EXISTS public.flush_held_emails() CASCADE;
DROP FUNCTION IF EXISTS public.is_channel_member(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.user_commented_on_entity(TEXT, UUID, UUID) CASCADE;

-- Drop old custom types / enums with CASCADE
DROP TYPE IF EXISTS public.email_status CASCADE;
DROP TYPE IF EXISTS public.entity_type CASCADE;
DROP TYPE IF EXISTS public.task_status CASCADE;
DROP TYPE IF EXISTS public.deal_stage CASCADE;
DROP TYPE IF EXISTS public.lead_status CASCADE;
DROP TYPE IF EXISTS public.user_role CASCADE;

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('caller', 'developer', 'manager', 'admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_status') THEN
    CREATE TYPE lead_status AS ENUM (
      'unassigned', 'assigned', 'attempted', 'no_answer', 
      'gatekeeper', 'dm_reached', 'interested', 'callback', 
      'not_interested', 'dnc', 'closed_won', 'closed_lost'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deal_stage') THEN
    CREATE TYPE deal_stage AS ENUM ('proposal_sent', 'negotiation', 'won', 'lost');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'review', 'blocked', 'done');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entity_type') THEN
    CREATE TYPE entity_type AS ENUM ('lead', 'project', 'task', 'deal');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_status') THEN
    CREATE TYPE email_status AS ENUM ('pending', 'sending', 'sent', 'failed', 'held_cap');
  END IF;
END $$;

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'caller',
  phone TEXT,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Public View (Hides phone numbers for member pickers)
CREATE OR REPLACE VIEW public.profiles_public AS
  SELECT id, full_name, role, is_available, active
  FROM public.profiles
  WHERE active = TRUE AND deleted_at IS NULL;

-- 2. Invites Table
CREATE TABLE IF NOT EXISTS public.invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'caller',
  invited_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  accepted_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invites_email_pending ON public.invites(LOWER(email)) WHERE accepted_at IS NULL;

-- 3. DNC Blacklist
CREATE TABLE IF NOT EXISTS public.dnc_blacklist (
  phone_hash CHAR(64) PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT 'caller_requested',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Idempotency & Rate Limiting Keys
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'scraper',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_source_time ON public.idempotency_keys(source, created_at);

-- 5. Master Leads Pool
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id TEXT UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  normalized_phone TEXT NOT NULL,
  website TEXT,
  has_website BOOLEAN DEFAULT FALSE,
  website_status TEXT,
  address TEXT,
  niche TEXT NOT NULL,
  area TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  dnc_flag BOOLEAN NOT NULL DEFAULT FALSE,
  status lead_status NOT NULL DEFAULT 'unassigned',
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_date DATE,
  attempts_count INTEGER NOT NULL DEFAULT 0,
  last_called_at TIMESTAMPTZ,
  next_callback_at TIMESTAMPTZ,
  next_callback_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 6. Assignment History
CREATE TABLE IF NOT EXISTS public.assignment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_caller_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  to_caller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Call Logs
CREATE TABLE IF NOT EXISTS public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  caller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  outcome lead_status NOT NULL,
  notes TEXT,
  duration_seconds INTEGER DEFAULT 0,
  callback_at TIMESTAMPTZ,
  called_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_offline_id UUID UNIQUE
);

-- 8. Deals Table
CREATE TABLE IF NOT EXISTS public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
  caller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  deal_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  stage deal_stage NOT NULL DEFAULT 'proposal_sent',
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_lead_active ON public.deals(lead_id) WHERE deleted_at IS NULL;

-- 9. Projects & Tasks
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name TEXT NOT NULL,
  lead_id UUID REFERENCES public.leads(id),
  deal_id UUID REFERENCES public.deals(id),
  assigned_dev_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'onboarding',
  staging_url TEXT,
  production_url TEXT,
  deadline DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  dev_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT,
  status task_status NOT NULL DEFAULT 'todo',
  due_date TIMESTAMPTZ,
  hours_logged NUMERIC(6, 2) DEFAULT 0.00,
  task_due_notified_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 10. Scores Daily
CREATE TABLE IF NOT EXISTS public.scores_daily (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  dials INTEGER NOT NULL DEFAULT 0,
  connects INTEGER NOT NULL DEFAULT 0,
  meetings_booked INTEGER NOT NULL DEFAULT 0,
  deals_closed INTEGER NOT NULL DEFAULT 0,
  revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  on_time_deliveries INTEGER NOT NULL DEFAULT 0,
  revisions INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, date)
);

-- 11. Communication Hub
CREATE TABLE IF NOT EXISTS public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.channel_members (
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.channel_reads (
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  body TEXT NOT NULL,
  parent_message_id UUID REFERENCES public.messages(id),
  attachments JSONB DEFAULT '[]'::jsonb,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.dm_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  user_b UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_canonical_order CHECK (user_a < user_b),
  UNIQUE(user_a, user_b)
);

CREATE TABLE IF NOT EXISTS public.dm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.dm_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  body TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  read_at TIMESTAMPTZ,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.entity_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type entity_type NOT NULL,
  entity_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  body TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 12. Notifications & Email Queue
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  entity_type entity_type,
  entity_id UUID,
  link TEXT,
  read_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  email_to TEXT NOT NULL,
  subject TEXT NOT NULL,
  template TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status email_status NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_assignment ON public.leads(assigned_to, assigned_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_queue_order ON public.leads(assigned_to, status, next_callback_at ASC, score DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_unassigned_pool ON public.leads(status, score DESC) WHERE status = 'unassigned' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_calls_caller_history ON public.calls(caller_id, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_channel_feed ON public.messages(channel_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_entity_comments_feed ON public.entity_comments(entity_type, entity_id, created_at ASC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dm_messages_thread ON public.dm_messages(thread_id, created_at ASC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_email_queue_pending ON public.email_queue(status, created_at ASC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_calls_called_at ON public.calls(called_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_lead_id ON public.calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_calls_called_at_outcome ON public.calls(called_at DESC, outcome);
CREATE INDEX IF NOT EXISTS idx_profiles_role_active ON public.profiles(role, active, is_available);
CREATE INDEX IF NOT EXISTS idx_leads_normalized_phone ON public.leads(normalized_phone) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_assigned_active ON public.leads(assigned_to, status) WHERE deleted_at IS NULL;

--------------------------------------------------------------------------------
-- 5.1 Universal Updated-At & Defensive Triggers
--------------------------------------------------------------------------------

-- Universal updated_at Trigger Function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_updated_at_profiles ON public.profiles;
CREATE TRIGGER trg_set_updated_at_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_leads ON public.leads;
CREATE TRIGGER trg_set_updated_at_leads BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_deals ON public.deals;
CREATE TRIGGER trg_set_updated_at_deals BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_projects ON public.projects;
CREATE TRIGGER trg_set_updated_at_projects BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_tasks ON public.tasks;
CREATE TRIGGER trg_set_updated_at_tasks BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_channels ON public.channels;
CREATE TRIGGER trg_set_updated_at_channels BEFORE UPDATE ON public.channels FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_entity_comments ON public.entity_comments;
CREATE TRIGGER trg_set_updated_at_entity_comments BEFORE UPDATE ON public.entity_comments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_scores_daily ON public.scores_daily;
CREATE TRIGGER trg_set_updated_at_scores_daily BEFORE UPDATE ON public.scores_daily FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper: Current User Role
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Decoupled RLS Helper: Is Channel Member (Zero Recursion)
CREATE OR REPLACE FUNCTION public.is_channel_member(p_channel_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channel_members
    WHERE channel_id = p_channel_id AND user_id = p_user_id
  );
$$;

-- Decoupled RLS Helper: User Commented On Entity (Zero Recursion)
CREATE OR REPLACE FUNCTION public.user_commented_on_entity(p_entity_type entity_type, p_entity_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.entity_comments
    WHERE entity_type = p_entity_type AND entity_id = p_entity_id AND user_id = p_user_id
  );
$$;

-- Trigger: Prevent Self-Promotion on Profiles (With session override for atomic invite consumption)
CREATE OR REPLACE FUNCTION public.prevent_role_self_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Allow bypass only if explicitly enabled inside trusted consume_invite RPC
  IF current_setting('agency_os.invite_bypass', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.role IS DISTINCT FROM NEW.role AND current_user_role() NOT IN ('manager', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only managers and admins can modify user roles';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_self_change ON public.profiles;
CREATE TRIGGER trg_prevent_role_self_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_self_change();

-- Trigger: Auto Create Profile on Auth Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    'caller'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger: Prevent Project Field Tampering
CREATE OR REPLACE FUNCTION public.prevent_project_field_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user_role() = 'developer' THEN
    IF OLD.assigned_dev_id IS DISTINCT FROM NEW.assigned_dev_id
       OR OLD.deal_id IS DISTINCT FROM NEW.deal_id
       OR OLD.deadline IS DISTINCT FROM NEW.deadline THEN
      RAISE EXCEPTION 'Unauthorized: Developers cannot modify project assignments, deals, or deadlines';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_project_tampering ON public.projects;
CREATE TRIGGER trg_prevent_project_tampering
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.prevent_project_field_tampering();

-- Trigger: Prevent Message Metadata Tampering
CREATE OR REPLACE FUNCTION public.prevent_message_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.sender_id IS DISTINCT FROM NEW.sender_id
     OR OLD.channel_id IS DISTINCT FROM NEW.channel_id
     OR OLD.parent_message_id IS DISTINCT FROM NEW.parent_message_id
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'Unauthorized: Message metadata (sender, channel, parent, timestamp) cannot be modified';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_message_tampering ON public.messages;
CREATE TRIGGER trg_prevent_message_tampering
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.prevent_message_tampering();

-- Trigger: Prevent DM Message Metadata Tampering
CREATE OR REPLACE FUNCTION public.prevent_dm_message_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.sender_id IS DISTINCT FROM NEW.sender_id
     OR OLD.thread_id IS DISTINCT FROM NEW.thread_id
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'Unauthorized: DM metadata (sender, thread, timestamp) cannot be modified';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_dm_message_tampering ON public.dm_messages;
CREATE TRIGGER trg_prevent_dm_message_tampering
  BEFORE UPDATE ON public.dm_messages
  FOR EACH ROW EXECUTE FUNCTION public.prevent_dm_message_tampering();

-- Trigger: Maintain tasks.completed_at
CREATE OR REPLACE FUNCTION public.set_task_completed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    NEW.completed_at = NOW();
  ELSIF NEW.status != 'done' AND OLD.status = 'done' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_task_completed_at ON public.tasks;
CREATE TRIGGER trg_set_task_completed_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_task_completed_at();

-- Trigger: Maintain deals.closed_at
CREATE OR REPLACE FUNCTION public.set_deal_closed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.stage IN ('won', 'lost') AND (OLD.stage NOT IN ('won', 'lost')) THEN
    NEW.closed_at = NOW();
  ELSIF NEW.stage NOT IN ('won', 'lost') AND OLD.stage IN ('won', 'lost') THEN
    NEW.closed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_deal_closed_at ON public.deals;
CREATE TRIGGER trg_set_deal_closed_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.set_deal_closed_at();

--------------------------------------------------------------------------------
-- 5.2 Codified RPC Stored Procedures
--------------------------------------------------------------------------------

-- 1. RPC: Validate Invite Token
CREATE OR REPLACE FUNCTION public.validate_invite(p_token TEXT)
RETURNS TABLE(email TEXT, role user_role)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT email, role FROM public.invites
  WHERE token = p_token
    AND expires_at > NOW()
    AND accepted_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.validate_invite(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_invite(TEXT) TO anon, authenticated;

-- 2. RPC: Atomic Consume Invite
CREATE OR REPLACE FUNCTION public.consume_invite(p_token TEXT, p_user_id UUID)
RETURNS user_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invite RECORD;
  v_user_email TEXT;
BEGIN
  SELECT id, email, role INTO v_invite
  FROM public.invites
  WHERE token = p_token AND expires_at > NOW() AND accepted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invite token';
  END IF;

  -- Verify authenticated email matches invited email (case-insensitive)
  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;

  IF v_user_email IS NULL OR LOWER(v_user_email) <> LOWER(v_invite.email) THEN
    RAISE EXCEPTION 'Invite email does not match authenticated user';
  END IF;

  UPDATE public.invites 
  SET accepted_at = NOW(), accepted_by = p_user_id 
  WHERE id = v_invite.id;

  -- Enable bypass for invite consumption to satisfy prevent_role_self_change trigger
  PERFORM set_config('agency_os.invite_bypass', 'true', true);

  UPDATE public.profiles 
  SET role = v_invite.role, updated_at = NOW() 
  WHERE id = p_user_id;

  RETURN v_invite.role;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_invite(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_invite(TEXT, UUID) TO authenticated;

-- 3. RPC: Caller Update Lead
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
SET search_path = public, pg_temp
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
    VALUES (encode(digest(v_normalized_phone, 'sha256'), 'hex'), 'caller_dnc_request')
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

-- 4. RPC: Developer Update Task
CREATE OR REPLACE FUNCTION public.dev_update_task(
  p_task_id UUID,
  p_status task_status,
  p_hours_delta NUMERIC DEFAULT 0,
  p_description TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tasks WHERE id = p_task_id AND dev_id = auth.uid() AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Not authorized to update this task';
  END IF;

  UPDATE public.tasks
  SET status = p_status,
      hours_logged = hours_logged + COALESCE(p_hours_delta, 0),
      description = COALESCE(p_description, description),
      updated_at = NOW()
  WHERE id = p_task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.dev_update_task(UUID, task_status, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dev_update_task(UUID, task_status, NUMERIC, TEXT) TO authenticated;

-- 5. RPC: 1-Click Lead Redistribution
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
      VALUES (v_target, 'lead_assigned', 'Lead Reassigned', 'A new lead has been assigned to your queue', 'lead', v_lead.id, '/queue');

      v_assigned := v_assigned + 1;
    END IF;
  END LOOP;

  RETURN v_assigned;
END;
$$;

REVOKE ALL ON FUNCTION public.redistribute_caller_leads(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redistribute_caller_leads(UUID, TEXT) TO authenticated;

-- 6. RPC: System Health Meters
CREATE OR REPLACE FUNCTION public.get_system_health()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_db_bytes BIGINT;
  v_emails_today INT;
  v_active_callers INT;
BEGIN
  SELECT pg_database_size(current_database()) INTO v_db_bytes;
  SELECT COUNT(*) INTO v_emails_today FROM public.email_queue WHERE sent_at >= CURRENT_DATE::timestamptz;
  SELECT COUNT(*) INTO v_active_callers FROM public.profiles WHERE role = 'caller' AND is_available = TRUE AND active = TRUE;

  RETURN json_build_object(
    'db_size_mb', ROUND(v_db_bytes / (1024.0 * 1024.0), 2),
    'db_limit_mb', 500,
    'emails_sent_today', v_emails_today,
    'emails_limit_daily', 100,
    'active_callers', v_active_callers
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_system_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_system_health() TO authenticated;

-- 7. RPC: Atomic Claim Email Batch (FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.claim_email_batch(p_limit INT DEFAULT 10)
RETURNS SETOF public.email_queue
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.email_queue
  SET status = 'sending', claimed_at = NOW()
  WHERE id IN (
    SELECT id FROM public.email_queue
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.claim_email_batch(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_email_batch(INT) TO service_role;

--------------------------------------------------------------------------------
-- 5.3 Codified SQL Bodies for All 7 Automation Functions
--------------------------------------------------------------------------------

-- CRON 1: Daily 6:00 AM IST Lead Top-Up (v1.8 Depth-Aware Algorithm)
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
        VALUES (v_caller.id, 'leads_ready', 'Leads Assigned', 'Your queue has been refreshed with new leads.', '/queue');

        v_total_assigned := v_total_assigned + ARRAY_LENGTH(v_lead_ids, 1);
        v_remaining_pool := v_remaining_pool - ARRAY_LENGTH(v_lead_ids, 1);
      END IF;
    END IF;
  END LOOP;

  RETURN json_build_object('success', true, 'assigned_count', v_total_assigned);
END;
$$;

-- CRON 2: 10:00 AM IST Inactive Caller Detection
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
            '/dashboard'
          );
        END LOOP;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- CRON 3: 02:00 AM IST Stale Lead Recycling & Orphaned Email Recovery
CREATE OR REPLACE FUNCTION public.recycle_stale_leads()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 1. Recycle leads with 3+ attempts and no call in 7 days
  UPDATE public.leads 
  SET status = 'unassigned', assigned_to = NULL, assigned_date = NULL, updated_at = NOW()
  WHERE attempts_count >= 3 
    AND last_called_at < NOW() - INTERVAL '7 days'
    AND status NOT IN ('closed_won', 'closed_lost', 'dnc');

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
  WHERE status = 'sending' AND claimed_at < NOW() - INTERVAL '5 minutes' AND retry_count >= 3;
END;
$$;

-- CRON 4: Due Notification Scanner (Every 5 Minutes)
CREATE OR REPLACE FUNCTION public.dispatch_due_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lead RECORD;
  v_task RECORD;
  v_user_email TEXT;
BEGIN
  -- 1. Scan Callbacks due within 15 minutes (O(1) state match)
  FOR v_lead IN 
    SELECT id, name, assigned_to, next_callback_at 
    FROM public.leads 
    WHERE next_callback_at BETWEEN NOW() AND NOW() + INTERVAL '15 minutes'
      AND (next_callback_notified_at IS DISTINCT FROM next_callback_at)
      AND assigned_to IS NOT NULL AND deleted_at IS NULL
  LOOP
    -- Lock notification to this specific callback timestamp
    UPDATE public.leads SET next_callback_notified_at = next_callback_at WHERE id = v_lead.id;

    INSERT INTO public.notifications (user_id, type, title, body, entity_type, entity_id, link)
    VALUES (v_lead.assigned_to, 'urgent_callback', 'Upcoming Callback in 15m', 'Callback scheduled for ' || v_lead.name, 'lead', v_lead.id, '/queue');

    SELECT email INTO v_user_email FROM auth.users WHERE id = v_lead.assigned_to;
    IF v_user_email IS NOT NULL THEN
      INSERT INTO public.email_queue (user_id, email_to, subject, template, payload)
      VALUES (v_lead.assigned_to, v_user_email, 'Urgent: Callback in 15 Minutes', 'urgent_callback', json_build_object('lead_name', v_lead.name, 'lead_id', v_lead.id));
    END IF;
  END LOOP;

  -- 2. Scan Tasks due within 2 hours
  FOR v_task IN 
    SELECT id, title, dev_id, due_date 
    FROM public.tasks 
    WHERE due_date BETWEEN NOW() AND NOW() + INTERVAL '2 hours'
      AND status != 'done'
      AND (task_due_notified_at IS DISTINCT FROM due_date)
      AND dev_id IS NOT NULL AND deleted_at IS NULL
  LOOP
    -- Lock notification to this specific due timestamp
    UPDATE public.tasks SET task_due_notified_at = due_date WHERE id = v_task.id;

    INSERT INTO public.notifications (user_id, type, title, body, entity_type, entity_id, link)
    VALUES (v_task.dev_id, 'task_due_soon', 'Task Due in 2 Hours', 'Task "' || v_task.title || '" is due soon.', 'task', v_task.id, '/projects');

    SELECT email INTO v_user_email FROM auth.users WHERE id = v_task.dev_id;
    IF v_user_email IS NOT NULL THEN
      INSERT INTO public.email_queue (user_id, email_to, subject, template, payload)
      VALUES (v_task.dev_id, v_user_email, 'Task Due Soon', 'task_due_soon', json_build_object('task_title', v_task.title, 'task_id', v_task.id));
    END IF;
  END LOOP;
END;
$$;

-- CRON 5: 11:59 PM IST Nightly Scoreboard Aggregation
CREATE OR REPLACE FUNCTION public.aggregate_daily_scores()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user RECORD;
  v_dials INT;
  v_connects INT;
  v_meetings INT;
  v_deals_closed INT;
  v_revenue NUMERIC(12,2);
  v_tasks_completed INT;
  v_on_time INT;
BEGIN
  FOR v_user IN SELECT id, role FROM public.profiles WHERE active = TRUE AND deleted_at IS NULL LOOP
    IF v_user.role = 'caller' THEN
      SELECT COUNT(*) INTO v_dials FROM public.calls WHERE caller_id = v_user.id AND called_at::date = CURRENT_DATE;
      SELECT COUNT(*) INTO v_connects FROM public.calls 
        WHERE caller_id = v_user.id AND called_at::date = CURRENT_DATE
          AND (outcome IN ('gatekeeper', 'dm_reached', 'interested', 'callback', 'closed_won') OR duration_seconds >= 30);
      SELECT COUNT(*) INTO v_meetings FROM public.calls 
        WHERE caller_id = v_user.id AND called_at::date = CURRENT_DATE AND outcome = 'callback';
      SELECT COUNT(*), COALESCE(SUM(deal_value), 0) INTO v_deals_closed, v_revenue 
        FROM public.deals 
        WHERE caller_id = v_user.id AND closed_at::date = CURRENT_DATE AND stage = 'won';

      INSERT INTO public.scores_daily (user_id, date, dials, connects, meetings_booked, deals_closed, revenue, updated_at)
      VALUES (v_user.id, CURRENT_DATE, v_dials, v_connects, v_meetings, v_deals_closed, v_revenue, NOW())
      ON CONFLICT (user_id, date) DO UPDATE 
      SET dials = EXCLUDED.dials, connects = EXCLUDED.connects, meetings_booked = EXCLUDED.meetings_booked,
          deals_closed = EXCLUDED.deals_closed, revenue = EXCLUDED.revenue, updated_at = NOW();

    ELSIF v_user.role = 'developer' THEN
      SELECT COUNT(*) INTO v_tasks_completed FROM public.tasks 
        WHERE dev_id = v_user.id AND status = 'done' AND completed_at::date = CURRENT_DATE;
      SELECT COUNT(*) INTO v_on_time FROM public.tasks 
        WHERE dev_id = v_user.id AND status = 'done' AND completed_at::date = CURRENT_DATE AND completed_at <= due_date;

      INSERT INTO public.scores_daily (user_id, date, tasks_completed, on_time_deliveries, updated_at)
      VALUES (v_user.id, CURRENT_DATE, v_tasks_completed, v_on_time, NOW())
      ON CONFLICT (user_id, date) DO UPDATE 
      SET tasks_completed = EXCLUDED.tasks_completed, on_time_deliveries = EXCLUDED.on_time_deliveries, updated_at = NOW();
    END IF;
  END LOOP;
END;
$$;

-- CRON 6: Email Queue Dispatcher
CREATE OR REPLACE FUNCTION public.dispatch_email_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sent_today INT;
  v_batch_limit INT;
  v_dispatch_secret TEXT;
  v_edge_url TEXT;
  v_manager_id UUID;
BEGIN
  -- Read secrets from Supabase Vault if available
  BEGIN
    SELECT decrypted_secret INTO v_dispatch_secret FROM vault.decrypted_secrets WHERE name = 'DISPATCH_SECRET' LIMIT 1;
    SELECT decrypted_secret INTO v_edge_url FROM vault.decrypted_secrets WHERE name = 'EDGE_FUNCTION_URL' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_dispatch_secret := NULL;
    v_edge_url := NULL;
  END;

  IF v_dispatch_secret IS NULL OR v_edge_url IS NULL THEN
    FOR v_manager_id IN SELECT id FROM public.profiles WHERE role IN ('manager', 'admin') AND active = TRUE LOOP
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (v_manager_id, 'system_alert', 'Vault Secrets Missing', 'DISPATCH_SECRET or EDGE_FUNCTION_URL missing from Vault. Email queue paused.', '/dashboard');
    END LOOP;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_sent_today FROM public.email_queue WHERE sent_at >= CURRENT_DATE::timestamptz;

  IF v_sent_today >= 90 THEN
    UPDATE public.email_queue SET status = 'held_cap' WHERE status = 'pending';
    RETURN;
  END IF;

  v_batch_limit := 90 - v_sent_today;

  PERFORM net.http_post(
    url := v_edge_url || '/dispatch-emails',
    headers := json_build_object(
      'Content-Type', 'application/json',
      'x-dispatch-secret', v_dispatch_secret
    )::jsonb,
    body := json_build_object('limit', v_batch_limit)::jsonb
  );
END;
$$;

-- CRON 7: Reset Held Emails at 00:01 AM IST
CREATE OR REPLACE FUNCTION public.flush_held_emails()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.email_queue SET status = 'pending' WHERE status = 'held_cap';
END;
$$;

--------------------------------------------------------------------------------
-- 6. Comprehensive Row-Level Security (RLS) Matrix
--------------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dnc_blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;

-- 1. PROFILES
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
  USING (active = TRUE AND deleted_at IS NULL);

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR current_user_role() IN ('manager', 'admin'))
  WITH CHECK (id = auth.uid() OR current_user_role() IN ('manager', 'admin'));

-- 2. INVITES
DROP POLICY IF EXISTS "invites_manager_all" ON public.invites;
CREATE POLICY "invites_manager_all" ON public.invites FOR ALL TO authenticated
  USING (current_user_role() IN ('manager', 'admin'))
  WITH CHECK (current_user_role() IN ('manager', 'admin'));

-- 3. DNC BLACKLIST
DROP POLICY IF EXISTS "dnc_read" ON public.dnc_blacklist;
CREATE POLICY "dnc_read" ON public.dnc_blacklist FOR SELECT TO authenticated
  USING (current_user_role() IN ('manager', 'admin'));

DROP POLICY IF EXISTS "dnc_insert" ON public.dnc_blacklist;
CREATE POLICY "dnc_insert" ON public.dnc_blacklist FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('manager', 'admin'));

-- 4. IDEMPOTENCY KEYS
DROP POLICY IF EXISTS "idempotency_admin_only" ON public.idempotency_keys;
CREATE POLICY "idempotency_admin_only" ON public.idempotency_keys FOR ALL TO authenticated
  USING (current_user_role() IN ('manager', 'admin'))
  WITH CHECK (current_user_role() IN ('manager', 'admin'));

-- 5. LEADS
DROP POLICY IF EXISTS "leads_select" ON public.leads;
CREATE POLICY "leads_select" ON public.leads FOR SELECT TO authenticated
  USING (
    (current_user_role() = 'caller' AND assigned_to = auth.uid() AND deleted_at IS NULL)
    OR current_user_role() IN ('manager', 'admin')
  );

DROP POLICY IF EXISTS "leads_manager_update" ON public.leads;
CREATE POLICY "leads_manager_update" ON public.leads FOR UPDATE TO authenticated
  USING (current_user_role() IN ('manager', 'admin'))
  WITH CHECK (current_user_role() IN ('manager', 'admin'));

DROP POLICY IF EXISTS "leads_manager_insert" ON public.leads;
CREATE POLICY "leads_manager_insert" ON public.leads FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('manager', 'admin'));

-- 6. ASSIGNMENT HISTORY
DROP POLICY IF EXISTS "assignment_history_select" ON public.assignment_history;
CREATE POLICY "assignment_history_select" ON public.assignment_history FOR SELECT TO authenticated
  USING (current_user_role() IN ('manager', 'admin') OR to_caller_id = auth.uid());

-- 7. CALLS
DROP POLICY IF EXISTS "calls_select" ON public.calls;
CREATE POLICY "calls_select" ON public.calls FOR SELECT TO authenticated
  USING (caller_id = auth.uid() OR current_user_role() IN ('manager', 'admin'));

DROP POLICY IF EXISTS "calls_insert" ON public.calls;
CREATE POLICY "calls_insert" ON public.calls FOR INSERT TO authenticated
  WITH CHECK (caller_id = auth.uid() OR current_user_role() IN ('manager', 'admin'));

-- 8. DEALS
DROP POLICY IF EXISTS "deals_select" ON public.deals;
CREATE POLICY "deals_select" ON public.deals FOR SELECT TO authenticated
  USING (caller_id = auth.uid() OR current_user_role() IN ('manager', 'admin'));

DROP POLICY IF EXISTS "deals_manager_update" ON public.deals;
CREATE POLICY "deals_manager_update" ON public.deals FOR UPDATE TO authenticated
  USING (current_user_role() IN ('manager', 'admin'))
  WITH CHECK (current_user_role() IN ('manager', 'admin'));

-- 9. PROJECTS & TASKS
DROP POLICY IF EXISTS "projects_select" ON public.projects;
CREATE POLICY "projects_select" ON public.projects FOR SELECT TO authenticated
  USING (assigned_dev_id = auth.uid() OR current_user_role() IN ('manager', 'admin'));

DROP POLICY IF EXISTS "projects_update" ON public.projects;
CREATE POLICY "projects_update" ON public.projects FOR UPDATE TO authenticated
  USING (assigned_dev_id = auth.uid() OR current_user_role() IN ('manager', 'admin'))
  WITH CHECK (assigned_dev_id = auth.uid() OR current_user_role() IN ('manager', 'admin'));

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated
  USING (dev_id = auth.uid() OR current_user_role() IN ('manager', 'admin'));

DROP POLICY IF EXISTS "tasks_manager_update" ON public.tasks;
CREATE POLICY "tasks_manager_update" ON public.tasks FOR UPDATE TO authenticated
  USING (current_user_role() IN ('manager', 'admin'))
  WITH CHECK (current_user_role() IN ('manager', 'admin'));

-- 10. SCORES DAILY
DROP POLICY IF EXISTS "scores_daily_select" ON public.scores_daily;
CREATE POLICY "scores_daily_select" ON public.scores_daily FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR current_user_role() IN ('manager', 'admin'));

-- 11. CHANNELS & MEMBERS (Decoupled, Zero-Recursion)
DROP POLICY IF EXISTS "channels_select" ON public.channels;
CREATE POLICY "channels_select" ON public.channels FOR SELECT TO authenticated
  USING (
    is_private = FALSE 
    OR is_channel_member(id, auth.uid())
    OR current_user_role() IN ('manager', 'admin')
  );

DROP POLICY IF EXISTS "channels_manager_insert" ON public.channels;
CREATE POLICY "channels_manager_insert" ON public.channels FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('manager', 'admin'));

DROP POLICY IF EXISTS "channels_manager_update" ON public.channels;
CREATE POLICY "channels_manager_update" ON public.channels FOR UPDATE TO authenticated
  USING (current_user_role() IN ('manager', 'admin'))
  WITH CHECK (current_user_role() IN ('manager', 'admin'));

DROP POLICY IF EXISTS "channel_members_select" ON public.channel_members;
CREATE POLICY "channel_members_select" ON public.channel_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR current_user_role() IN ('manager', 'admin'));

DROP POLICY IF EXISTS "channel_members_insert" ON public.channel_members;
CREATE POLICY "channel_members_insert" ON public.channel_members FOR INSERT TO authenticated
  WITH CHECK (
    current_user_role() IN ('manager', 'admin')
    OR is_channel_member(channel_members.channel_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.channels WHERE id = channel_members.channel_id AND created_by = auth.uid())
  );

-- 12. CHANNEL READS (No DELETE Policy Permitted)
DROP POLICY IF EXISTS "channel_reads_select" ON public.channel_reads;
CREATE POLICY "channel_reads_select" ON public.channel_reads FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "channel_reads_insert" ON public.channel_reads;
CREATE POLICY "channel_reads_insert" ON public.channel_reads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "channel_reads_update" ON public.channel_reads;
CREATE POLICY "channel_reads_update" ON public.channel_reads FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 13. MESSAGES & DMS
DROP POLICY IF EXISTS "messages_select" ON public.messages;
CREATE POLICY "messages_select" ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.channels c 
      WHERE c.id = channel_id 
        AND (c.is_private = FALSE OR is_channel_member(c.id, auth.uid()))
    )
    OR current_user_role() IN ('manager', 'admin')
  );

DROP POLICY IF EXISTS "messages_insert" ON public.messages;
CREATE POLICY "messages_insert" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "messages_update_own" ON public.messages;
CREATE POLICY "messages_update_own" ON public.messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "dm_threads_select" ON public.dm_threads;
CREATE POLICY "dm_threads_select" ON public.dm_threads FOR SELECT TO authenticated
  USING (user_a = auth.uid() OR user_b = auth.uid() OR current_user_role() IN ('manager', 'admin'));

DROP POLICY IF EXISTS "dm_threads_insert" ON public.dm_threads;
CREATE POLICY "dm_threads_insert" ON public.dm_threads FOR INSERT TO authenticated
  WITH CHECK (user_a = auth.uid() OR user_b = auth.uid() OR current_user_role() IN ('manager', 'admin'));

DROP POLICY IF EXISTS "dm_messages_select" ON public.dm_messages;
CREATE POLICY "dm_messages_select" ON public.dm_messages FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.dm_threads t WHERE t.id = thread_id AND (t.user_a = auth.uid() OR t.user_b = auth.uid()))
    OR current_user_role() IN ('manager', 'admin')
  );

DROP POLICY IF EXISTS "dm_messages_insert" ON public.dm_messages;
CREATE POLICY "dm_messages_insert" ON public.dm_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "dm_messages_update_own" ON public.dm_messages;
CREATE POLICY "dm_messages_update_own" ON public.dm_messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "dm_messages_mark_read" ON public.dm_messages;
CREATE POLICY "dm_messages_mark_read" ON public.dm_messages FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dm_threads t 
      WHERE t.id = thread_id AND (t.user_a = auth.uid() OR t.user_b = auth.uid())
    )
  )
  WITH CHECK (read_at IS NOT NULL);

-- 14. ENTITY COMMENTS (Zero-Recursion)
DROP POLICY IF EXISTS "entity_comments_select" ON public.entity_comments;
CREATE POLICY "entity_comments_select" ON public.entity_comments FOR SELECT TO authenticated
  USING (
    current_user_role() IN ('manager', 'admin')
    OR (entity_type = 'lead' AND EXISTS (SELECT 1 FROM public.leads WHERE id = entity_id AND assigned_to = auth.uid()))
    OR (entity_type = 'task' AND EXISTS (SELECT 1 FROM public.tasks WHERE id = entity_id AND dev_id = auth.uid()))
    OR user_commented_on_entity(entity_type, entity_id, auth.uid())
  );

DROP POLICY IF EXISTS "entity_comments_insert" ON public.entity_comments;
CREATE POLICY "entity_comments_insert" ON public.entity_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "entity_comments_update_own" ON public.entity_comments;
CREATE POLICY "entity_comments_update_own" ON public.entity_comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 15. NOTIFICATIONS & EMAIL QUEUE
DROP POLICY IF EXISTS "notifications_all" ON public.notifications;
CREATE POLICY "notifications_all" ON public.notifications FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "email_queue_admin" ON public.email_queue;
CREATE POLICY "email_queue_admin" ON public.email_queue FOR ALL TO authenticated
  USING (current_user_role() IN ('manager', 'admin'))
  WITH CHECK (current_user_role() IN ('manager', 'admin'));
-- Agency OS — Sprint 1 Initial Seed Data
-- Default Seed Channels: #general, #callers, #developers, #management, #wins, #alerts

INSERT INTO public.channels (name, description, is_private)
VALUES 
  ('general', 'Company-wide announcements and watercooler discussions', FALSE),
  ('callers', 'Outreach squad updates, lead feedback, and objection handling', FALSE),
  ('developers', 'Dev pipeline, technical blockers, staging links, and reviews', FALSE),
  ('management', 'Operations, daily KPIs, capacity planning, and escalations', TRUE),
  ('wins', 'Celebrations, closed deals, launched client sites, and milestones', FALSE),
  ('alerts', 'Automated system alerts, cron notifications, and critical health warnings', FALSE)
ON CONFLICT (name) DO NOTHING;

--------------------------------------------------------------------------------
-- 8. Admin Profile Bootstrap for Muzammil (Owner)
-- Wrapped safely so fresh deployments without this auth user don't crash migrations
--------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = 'a87c7c79-6c4c-4787-8132-8cff8f7a1e74') THEN
    INSERT INTO public.profiles (id, full_name, role)
    VALUES ('a87c7c79-6c4c-4787-8132-8cff8f7a1e74', 'Muzammil (Owner)', 'admin')
    ON CONFLICT (id) DO UPDATE 
    SET role = 'admin', full_name = 'Muzammil (Owner)';
  END IF;
END $$;

