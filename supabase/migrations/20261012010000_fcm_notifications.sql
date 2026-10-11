-- Migration: Firebase Cloud Messaging (FCM) Push Notifications Setup
-- Creates fcm_tokens table for storing device registration tokens across web & mobile devices

CREATE TABLE IF NOT EXISTS public.fcm_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  device_type TEXT DEFAULT 'web',
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for speedy token lookup per user
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_id ON public.fcm_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_token ON public.fcm_tokens(token);

-- Enable Row Level Security
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Authenticated users manage their own registration tokens
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fcm_tokens' AND policyname = 'fcm_tokens_select_own'
  ) THEN
    CREATE POLICY fcm_tokens_select_own ON public.fcm_tokens
      FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fcm_tokens' AND policyname = 'fcm_tokens_insert_own'
  ) THEN
    CREATE POLICY fcm_tokens_insert_own ON public.fcm_tokens
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fcm_tokens' AND policyname = 'fcm_tokens_delete_own'
  ) THEN
    CREATE POLICY fcm_tokens_delete_own ON public.fcm_tokens
      FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;
