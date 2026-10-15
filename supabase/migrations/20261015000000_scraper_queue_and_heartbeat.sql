-- Migration: Scraper Queue and Heartbeat Tables
-- Author: Stage 5 Lead Finder Engine
-- Date: 2026-10-15

-- 1. Scraper Status Table (Singleton heartbeat record)
CREATE TABLE IF NOT EXISTS public.scraper_status (
  id TEXT PRIMARY KEY DEFAULT 'default',
  is_online BOOLEAN NOT NULL DEFAULT false,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_area TEXT,
  current_batch INT DEFAULT 0,
  total_batches INT DEFAULT 4,
  leads_collected INT DEFAULT 0,
  target_leads INT DEFAULT 1000,
  ip_address TEXT,
  active_job_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default singleton row if not exists
INSERT INTO public.scraper_status (id, is_online, last_heartbeat)
VALUES ('default', false, now() - INTERVAL '1 hour')
ON CONFLICT (id) DO NOTHING;

-- 2. Scraper Jobs Table
CREATE TABLE IF NOT EXISTS public.scraper_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  broad_area TEXT NOT NULL DEFAULT 'Hadapsar',
  niche TEXT NOT NULL DEFAULT 'Dentist',
  target_leads INT NOT NULL DEFAULT 1000,
  current_batch INT NOT NULL DEFAULT 0,
  total_batches INT NOT NULL DEFAULT 4,
  current_area TEXT,
  leads_collected INT NOT NULL DEFAULT 0,
  current_sublocations JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for speedy polling of pending jobs
CREATE INDEX IF NOT EXISTS idx_scraper_jobs_status_created ON public.scraper_jobs(status, created_at ASC);

-- Enable RLS
ALTER TABLE public.scraper_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraper_jobs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated and anon reading of scraper_status
DROP POLICY IF EXISTS "Public read scraper_status" ON public.scraper_status;
CREATE POLICY "Public read scraper_status" ON public.scraper_status FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public update scraper_status" ON public.scraper_status;
CREATE POLICY "Public update scraper_status" ON public.scraper_status FOR ALL USING (true);

-- Allow authenticated and anon reading and inserting of scraper_jobs
DROP POLICY IF EXISTS "Public read scraper_jobs" ON public.scraper_jobs;
CREATE POLICY "Public read scraper_jobs" ON public.scraper_jobs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert scraper_jobs" ON public.scraper_jobs;
CREATE POLICY "Public insert scraper_jobs" ON public.scraper_jobs FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public update scraper_jobs" ON public.scraper_jobs;
CREATE POLICY "Public update scraper_jobs" ON public.scraper_jobs FOR ALL USING (true);

-- Add to supabase_realtime publication safely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'scraper_status'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.scraper_status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'scraper_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.scraper_jobs;
  END IF;
END $$;
