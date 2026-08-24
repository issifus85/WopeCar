-- BACKFILL - already applied live (ledger version 20260803172049, name
-- add_welcome_email_sent_at_to_users). Never committed to this repo.

alter table public.users add column if not exists welcome_email_sent_at timestamptz;
