-- BACKFILL - already applied live (ledger version 20260803174943, name
-- add_vendor_payouts_table). Never committed to this repo.

create table if not exists public.vendor_payouts (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  amount numeric not null check (amount > 0),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.vendor_payouts enable row level security;

drop policy if exists vendor_payouts_admin_all on public.vendor_payouts;
create policy vendor_payouts_admin_all on public.vendor_payouts
  for all using (is_admin()) with check (is_admin());

drop policy if exists vendor_payouts_vendor_select on public.vendor_payouts;
create policy vendor_payouts_vendor_select on public.vendor_payouts
  for select using (is_vendor_owner(vendor_id));
