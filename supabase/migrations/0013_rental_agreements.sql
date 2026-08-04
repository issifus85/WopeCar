-- Client Rental Agreement, moved off Laravel (see the "Laravel -> Supabase
-- Data Migration, Phase 5: Client Rental Agreement" plan). Same dead-
-- reference bug as messaging/inspections had: app/booking/[id].js's
-- Rental Agreement block was keyed off booking.serverId, which is never
-- set on a Supabase-native booking, so it's been permanently stuck on
-- "Not Started" since bookings moved to Supabase.
--
-- No document/PDF column - same decision as vehicle_inspections (0012):
-- Laravel generated a real PDF via dompdf on submit, but there's no
-- server-side PDF rendering available here, and the user again chose an
-- in-app read-only view over standing up an Edge Function for this.
--
-- One row per booking (unique booking_id), unlike vehicle_inspections'
-- pre/post split - matches the original 1:1 Laravel design.
create table rental_agreements (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references bookings(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  lessee_name text,
  vehicle_registration text,
  vehicle_make text,
  vehicle_color text,
  vehicle_year text,
  daily_rate numeric,
  security_deposit numeric,
  duration_start date,
  duration_end date,
  pickup_time text,
  return_time text,
  ghana_only_use boolean not null default true,
  client_signature_path text,
  representative_signature_path text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table rental_agreements enable row level security;

-- Same pattern as vehicle_inspections (0012): renter runs the whole form +
-- both signatures on their own device (no separate "representative" user/
-- session concept exists anywhere in this app), vendor gets read-only
-- visibility via the same is_vendor_owner() helper already used elsewhere.
create policy rental_agreements_renter_all on rental_agreements for all to authenticated
  using (exists (select 1 from bookings b where b.id = rental_agreements.booking_id and b.renter_id = auth.uid()))
  with check (exists (select 1 from bookings b where b.id = rental_agreements.booking_id and b.renter_id = auth.uid()));

create policy rental_agreements_vendor_select on rental_agreements for select to authenticated
  using (exists (
    select 1 from bookings b where b.id = rental_agreements.booking_id and is_vendor_owner(b.vendor_id)
  ));

create policy rental_agreements_admin_all on rental_agreements for all to authenticated
  using (is_admin()) with check (is_admin());
