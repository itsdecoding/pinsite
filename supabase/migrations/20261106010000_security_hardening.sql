-- 1. Leads: callers see only their own assigned leads; managers/admins see all.
DROP POLICY IF EXISTS "leads_select" ON public.leads;
CREATE POLICY "leads_select" ON public.leads FOR SELECT TO authenticated
  USING (
    (current_user_role() = 'caller' AND assigned_to = auth.uid() AND deleted_at IS NULL)
    OR current_user_role() IN ('manager', 'admin')
  );

-- 2. Scraper tables: managers/admins only (the scraper daemon uses a service key and bypasses RLS).
DROP POLICY IF EXISTS "Public read scraper_status" ON public.scraper_status;
DROP POLICY IF EXISTS "Public update scraper_status" ON public.scraper_status;
DROP POLICY IF EXISTS "Public read scraper_jobs" ON public.scraper_jobs;
DROP POLICY IF EXISTS "Public insert scraper_jobs" ON public.scraper_jobs;
DROP POLICY IF EXISTS "Public update scraper_jobs" ON public.scraper_jobs;

DROP POLICY IF EXISTS "scraper_status_manager_all" ON public.scraper_status;
CREATE POLICY "scraper_status_manager_all" ON public.scraper_status FOR ALL TO authenticated
  USING (current_user_role() IN ('manager', 'admin'))
  WITH CHECK (current_user_role() IN ('manager', 'admin'));

DROP POLICY IF EXISTS "scraper_jobs_manager_all" ON public.scraper_jobs;
CREATE POLICY "scraper_jobs_manager_all" ON public.scraper_jobs FOR ALL TO authenticated
  USING (current_user_role() IN ('manager', 'admin'))
  WITH CHECK (current_user_role() IN ('manager', 'admin'));

-- 3. Website previews are served server-side with the service role; no public table reads.
DROP POLICY IF EXISTS "Public can view website previews" ON public.website_previews;

CREATE OR REPLACE FUNCTION public.increment_preview_view(p_slug TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.website_previews
  SET view_count = view_count + 1, last_viewed_at = NOW()
  WHERE slug = p_slug;
$$;

-- 4. Internal / cron functions: service role only.
DROP FUNCTION IF EXISTS public.assign_daily_leads();

DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.assign_daily_leads(INT)',
    'public.cron_auto_rebalance_leads()',
    'public.cron_dispose_quarantined_leads()',
    'public.recycle_stale_leads()',
    'public.detect_inactive_callers()',
    'public.aggregate_daily_scores()',
    'public.dispatch_due_notifications()',
    'public.dispatch_email_queue()',
    'public.flush_held_emails()',
    'public.claim_email_batch(INT)',
    'public.increment_preview_view(TEXT)'
  ]
  LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END $$;

-- 5. Profiles: only admins may grant/revoke admin or modify admin accounts;
--    users cannot change their own account-state columns.
CREATE OR REPLACE FUNCTION public.prevent_role_self_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_role user_role;
BEGIN
  IF current_setting('agency_os.invite_bypass', true) = 'true' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_actor_role := current_user_role();

  IF OLD.role IS DISTINCT FROM NEW.role AND v_actor_role IS DISTINCT FROM 'manager' AND v_actor_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Unauthorized: Only managers and admins can modify user roles';
  END IF;

  IF v_actor_role IS DISTINCT FROM 'admin'
     AND (NEW.role = 'admin' OR (OLD.role = 'admin' AND OLD.id <> auth.uid())) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can grant admin or modify admin accounts';
  END IF;

  IF v_actor_role IS DISTINCT FROM 'manager' AND v_actor_role IS DISTINCT FROM 'admin'
     AND (OLD.active IS DISTINCT FROM NEW.active
       OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
       OR OLD.require_password_change IS DISTINCT FROM NEW.require_password_change) THEN
    RAISE EXCEPTION 'Unauthorized: Account status fields can only be changed by managers or admins';
  END IF;

  RETURN NEW;
END;
$$;

-- 6. Messaging: senders must belong to the channel / DM thread.
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
CREATE POLICY "messages_insert" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.channels c
        WHERE c.id = channel_id
          AND (c.is_private = FALSE OR is_channel_member(c.id, auth.uid()))
      )
      OR current_user_role() IN ('manager', 'admin')
    )
  );

DROP POLICY IF EXISTS "dm_messages_insert" ON public.dm_messages;
CREATE POLICY "dm_messages_insert" ON public.dm_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.dm_threads t
      WHERE t.id = thread_id AND (t.user_a = auth.uid() OR t.user_b = auth.uid())
    )
  );

-- Read receipts are written server-side; this policy let recipients rewrite message bodies.
DROP POLICY IF EXISTS "dm_messages_mark_read" ON public.dm_messages;

DROP POLICY IF EXISTS "entity_comments_insert" ON public.entity_comments;
CREATE POLICY "entity_comments_insert" ON public.entity_comments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      current_user_role() IN ('manager', 'admin')
      OR (entity_type = 'lead' AND EXISTS (SELECT 1 FROM public.leads WHERE id = entity_id AND assigned_to = auth.uid()))
      OR (entity_type = 'task' AND EXISTS (SELECT 1 FROM public.tasks WHERE id = entity_id AND dev_id = auth.uid()))
    )
  );

-- 7. Attachments: users can list only their own folder (uploads go through the API).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    DROP POLICY IF EXISTS comms_attachments_select ON storage.objects;
    CREATE POLICY comms_attachments_select ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'comms-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;

-- 8. Fixed-window rate limiter for public auth endpoints (service role only).
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  count INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key TEXT, p_max INT, p_window_seconds INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO public.rate_limits AS r (key, window_start, count)
  VALUES (p_key, NOW(), 1)
  ON CONFLICT (key) DO UPDATE SET
    count = CASE WHEN r.window_start < NOW() - make_interval(secs => p_window_seconds) THEN 1 ELSE r.count + 1 END,
    window_start = CASE WHEN r.window_start < NOW() - make_interval(secs => p_window_seconds) THEN NOW() ELSE r.window_start END
  RETURNING count INTO v_count;

  RETURN v_count <= p_max;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INT, INT) TO service_role;
