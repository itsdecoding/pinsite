-- =========================================================
-- Pinsite — Supabase Database Schema
-- Run this in your Supabase Project > SQL Editor
-- =========================================================

-- 1. Create leads table
create table if not exists public.leads (
  id text primary key,
  clinic text default '',
  doctor text default '',
  specialty text default '',
  phone text default '',
  email text default '',
  website text default '',
  address text default '',
  city text default '',
  google text default '',
  web text default 'unknown',
  attempts integer default 0,
  source text default '',
  owner text default 'Unassigned',
  priority text default 'Medium',
  notes text default '',
  stage text default 'not_called',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  duplicate_of text,
  matched_on jsonb default '[]'::jsonb,
  flagged boolean default false,
  log jsonb default '[]'::jsonb
);

-- 2. Enable Row Level Security (RLS)
alter table public.leads enable row level security;

-- 3. Allow anonymous access for the client dashboard
drop policy if exists "Allow public all access on leads" on public.leads;
create policy "Allow public all access on leads"
  on public.leads
  for all
  to anon
  using (true)
  with check (true);

-- 4. Enable Supabase Realtime for live multi-user sync
alter publication supabase_realtime add table public.leads;
