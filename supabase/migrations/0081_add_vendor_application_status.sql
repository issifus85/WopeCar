-- BACKFILL - already applied live (ledger version 20260804022534, name
-- add_vendor_application_status). Never committed to this repo.

alter table public.vendors
  add column if not exists application_status text not null default 'pending'
    check (application_status = any (array['pending'::text, 'approved'::text, 'rejected'::text])),
  add column if not exists rejection_reason text;

update public.vendors set application_status = 'approved' where is_approved = true and application_status = 'pending';
