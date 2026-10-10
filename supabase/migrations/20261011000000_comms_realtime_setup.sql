-- Migration: Comms & Direct Messaging Realtime Publications & Setup
-- Enables realtime replication for communications tables, full replica identity, attachment storage, and performance indexes

DO $$
BEGIN
  -- 1. Ensure supabase_realtime publication exists
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  -- 2. Add communication tables to supabase_realtime publication (if table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'messages') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'dm_messages') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dm_messages') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'channels') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'channels') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.channels;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'channel_reads') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'channel_reads') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_reads;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'channel_members') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'channel_members') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_members;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'entity_comments') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'entity_comments') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.entity_comments;
    END IF;
  END IF;

  -- 3. Set REPLICA IDENTITY FULL to ensure complete row payload on update/delete events
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'messages') THEN
    ALTER TABLE public.messages REPLICA IDENTITY FULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'dm_messages') THEN
    ALTER TABLE public.dm_messages REPLICA IDENTITY FULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'channels') THEN
    ALTER TABLE public.channels REPLICA IDENTITY FULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'channel_reads') THEN
    ALTER TABLE public.channel_reads REPLICA IDENTITY FULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'channel_members') THEN
    ALTER TABLE public.channel_members REPLICA IDENTITY FULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
    ALTER TABLE public.notifications REPLICA IDENTITY FULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'entity_comments') THEN
    ALTER TABLE public.entity_comments REPLICA IDENTITY FULL;
  END IF;
END $$;

-- 4. Storage Bucket Setup for Comms Attachments (if storage schema exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'comms-attachments',
      'comms-attachments',
      true,
      10485760, -- 10MB limit
      ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'text/plain']
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Storage RLS policies for comms-attachments
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    -- Allow authenticated users to view attachments
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'comms_attachments_select') THEN
      CREATE POLICY comms_attachments_select ON storage.objects
        FOR SELECT TO authenticated
        USING (bucket_id = 'comms-attachments');
    END IF;

    -- Allow authenticated users to upload attachments
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'comms_attachments_insert') THEN
      CREATE POLICY comms_attachments_insert ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'comms-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
    END IF;
  END IF;
END $$;

-- 5. Performance Indexes for Comms & Direct Messages
CREATE INDEX IF NOT EXISTS idx_dm_messages_unread_speed 
  ON public.dm_messages(thread_id, sender_id) 
  WHERE read_at IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dm_messages_thread_latest 
  ON public.dm_messages(thread_id, created_at DESC) 
  WHERE deleted_at IS NULL;
