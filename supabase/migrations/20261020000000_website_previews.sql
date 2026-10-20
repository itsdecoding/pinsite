-- Migration: 20261020000000_website_previews.sql
-- Description: Storage and public preview routes for on-demand generated websites with strict RLS

CREATE TABLE IF NOT EXISTS public.website_previews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  theme TEXT NOT NULL DEFAULT 'industrial-slate',
  font_pairing TEXT NOT NULL DEFAULT 'editorial-newsreader',
  site_data JSONB NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  view_count INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup index for incoming client traffic
CREATE INDEX IF NOT EXISTS idx_website_previews_slug ON public.website_previews(slug);
CREATE INDEX IF NOT EXISTS idx_website_previews_lead_id ON public.website_previews(lead_id);

-- Foreign column on public.leads for instantaneous lookup in the dialer deck
ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS active_preview_slug TEXT;

-- Enable Row Level Security
ALTER TABLE public.website_previews ENABLE ROW LEVEL SECURITY;

-- 1. Anyone (public anon) can read previews by slug to view the website
DROP POLICY IF EXISTS "Public can view website previews" ON public.website_previews;
CREATE POLICY "Public can view website previews"
  ON public.website_previews
  FOR SELECT
  TO public
  USING (true);

-- 2. Only active managers and admins can insert new previews
DROP POLICY IF EXISTS "Managers and Admins can insert website previews" ON public.website_previews;
CREATE POLICY "Managers and Admins can insert website previews"
  ON public.website_previews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('manager', 'admin')
        AND profiles.active = true
    )
  );

-- 3. Only active managers and admins can update previews
DROP POLICY IF EXISTS "Managers and Admins can update website previews" ON public.website_previews;
CREATE POLICY "Managers and Admins can update website previews"
  ON public.website_previews
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('manager', 'admin')
        AND profiles.active = true
    )
  );
