-- Supersedes national-id-reminders (send-national-id-reminders) with the
-- broader send-missing-document-reminders (0186_missing_documents_view.sql) -
-- running both would double-nag a website renter missing both national_id
-- and a license photo, so the old job is unscheduled in the same migration
-- that schedules the new one (never a window with neither/both running).
-- send-national-id-reminders itself is left deployed but dormant (zero cost
-- once unscheduled, stays as a readable rollback path).
--
-- NOTE: this file's net.http_post URL + anon key are project-specific -
-- applied separately per project, each with its own values (never copy one
-- project's into the other's run of this migration).

select cron.unschedule('national-id-reminders');

select cron.schedule(
  'missing-document-reminders',
  '0 8 * * 3', -- Wednesday 08:00 UTC, one day off the old Tuesday slot purely to spread load
  $$
  select net.http_post(
    url := 'https://<PROJECT-REF>.supabase.co/functions/v1/send-missing-document-reminders',
    headers := jsonb_build_object(
      'x-cron-secret', (select value from public.internal_secrets where name = 'cron'),
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <PROJECT-ANON-JWT>'
    ),
    body := '{}'::jsonb
  );
  $$
);
