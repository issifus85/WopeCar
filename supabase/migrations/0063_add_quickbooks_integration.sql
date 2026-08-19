-- QuickBooks Online integration: invoice creation, payment recording,
-- credit notes, and vendor payout tracking (accounting, not app-facing
-- money movement - Paystack/vendor payout numbers on `bookings` remain
-- the source of truth; these columns just mirror what got created in QB).

alter table bookings
  add column if not exists qb_invoice_id text,
  add column if not exists qb_invoice_number text,
  add column if not exists qb_invoice_url text,
  add column if not exists qb_payment_id text,
  add column if not exists qb_receipt_url text,
  add column if not exists qb_credit_note_id text,
  add column if not exists qb_customer_id text,
  add column if not exists qb_expense_id text,
  add column if not exists invoice_status text not null default 'not_created';

alter table users
  add column if not exists qb_customer_id text;

-- Single-row OAuth token store. Deliberately has NO client-facing RLS
-- policies (RLS is enabled with zero policies below) - only the
-- service-role key used by the Edge Functions and wopecar-admin's API
-- routes can read/write this table. Do NOT add a public/authenticated
-- policy here - app_settings already has one (qual: true, public SELECT,
-- confirmed live) and that's exactly the mistake this table exists to
-- avoid: an anon client can already read every app_settings row today.
create table if not exists quickbooks_tokens (
  id uuid primary key default gen_random_uuid(),
  access_token text,
  refresh_token text,
  token_expiry timestamptz,
  realm_id text,
  environment text not null default 'sandbox',
  connected_at timestamptz,
  connected_by uuid references users(id),
  updated_at timestamptz not null default now()
);
alter table quickbooks_tokens enable row level security;

-- Public-facing payment/bank details for invoice footers - same trust
-- level as the existing cancellation-policy rows already in this table
-- (business info intended to be shown to renters), not secrets.
insert into app_settings (key, value, description) values
  ('momo_name', '"Wopecar"', 'Mobile money account name'),
  ('momo_number', '"0248779858"', 'Mobile money number'),
  ('bank_account_name', '"ACRE Logistics Ltd"', 'Bank account name'),
  ('bank_account_number', '"1021005429107"', 'Bank account number'),
  ('bank_name', '"FNB"', 'Bank name'),
  ('bank_branch', '"JUNCTION MALL"', 'Bank branch'),
  ('bank_branch_code', '"03002"', 'Bank branch code'),
  ('bank_sort_code', '"330101"', 'Bank sort code'),
  ('bank_swift_code', '"FIRNGHAC"', 'Bank SWIFT code')
on conflict (key) do update set value = excluded.value;
