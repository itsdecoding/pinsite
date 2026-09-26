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
