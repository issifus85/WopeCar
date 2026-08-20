-- "Save & Pay Later" (checkout/payment.js) real invoicing, Option C from
-- the Change 8 architecture decision: a dedicated table for a saved
-- checkout draft that has a real QuickBooks invoice sitting UNPAID,
-- deliberately kept separate from `bookings` rather than adding a new
-- bookings.status value ('pending_payment') - that would have meant
-- auditing every RLS policy, the bookings_compute_vendor_payout trigger,
-- and every admin/mobile status label that reads bookings.status. A real
-- `bookings` row still only ever gets created when the renter actually
-- pays (checkout/payment.js's handlePay()), exactly as before this
-- feature - this table only tracks "saved, invoiced, not yet paid".
--
-- Row lifecycle: renter inserts (Save & Pay Later) -> a fire-and-forget
-- Edge Function call (quickbooks-create-pending-invoice) fills in
-- qb_invoice_id/qb_invoice_number via service role -> resolved exactly
-- once, by whichever happens first:
--   paid   - the renter resumes and actually pays (payment.js reuses this
--            row's QB invoice instead of creating a duplicate)
--   voided - CartContext's expiry prune (or an admin's "Void Booking")
--            calls quickbooks-void-invoice
-- resolution/resolved_at stay null while pending - never a bookings-style
-- multi-value status column, since there are only ever two ways out.

create table if not exists pending_invoices (
  id uuid primary key default gen_random_uuid(),
  booking_ref text unique not null,

  renter_id uuid not null references users(id) on delete cascade,
  car_id uuid not null references cars(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete set null,

  start_date date not null,
  end_date date not null,
  pickup_time text,
  return_time text,
  pickup_location text,
  return_location text,
  drive_type text,
  addon_names text[] not null default '{}',
  addon_days numeric[] not null default '{}',
  billable_days integer not null default 0,

  -- Same columns/meaning as the matching bookings.* columns (see migration
  -- 0063) - never recalculated downstream, same rule as everywhere else in
  -- this app: whatever checkout/payment.js's buildPricingBreakdown()
  -- computed at Save & Pay Later time is authoritative.
  rental_cost numeric not null default 0,
  addons_cost numeric not null default 0,
  delivery_fee numeric not null default 0,
  security_deposit numeric not null default 0,
  wopecare_plan text not null default 'none',
  wopecare_daily_rate numeric not null default 0,
  wopecare_total_cost numeric not null default 0,
  total_cost numeric not null default 0,

  qb_invoice_id text,
  qb_invoice_number text,
  qb_customer_id text,

  resolution text check (resolution in ('paid', 'voided')),
  resolved_at timestamptz,

  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists pending_invoices_renter_id_idx on pending_invoices(renter_id);
-- Scopes both CartContext's client-side expiry check and the admin
-- Pending Payment tab to exactly the rows that still matter.
create index if not exists pending_invoices_unresolved_expiry_idx
  on pending_invoices(expires_at) where resolution is null;

alter table pending_invoices enable row level security;

-- Renter can create their own saved-draft invoice and read it back - same
-- shape as bookings_renter_insert/bookings_renter_select. No renter update/
-- delete policy: every mutation after the initial insert (qb_invoice_id
-- being filled in, resolution being set) happens via a service-role Edge
-- Function, never a raw client write.
create policy pending_invoices_renter_select on pending_invoices
  for select using (renter_id = auth.uid());

create policy pending_invoices_renter_insert on pending_invoices
  for insert with check (renter_id = auth.uid());

-- Reuses the existing is_support() helper (migration 0010) rather than
-- re-deriving the same admin-or-support check inline.
create policy pending_invoices_admin_select on pending_invoices
  for select using (is_support());
