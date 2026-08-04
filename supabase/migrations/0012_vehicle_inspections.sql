-- Vehicle Inspection Reports (pre/post-rental condition documentation),
-- moved off Laravel (see the "Laravel -> Supabase Data Migration, Phase 4:
-- Vehicle Inspection Reports" plan). Same dead-reference bug as messaging
-- had: app/booking/[id].js's inspection section is keyed off
-- booking.serverId, which is never set on a Supabase-native booking, so
-- every booking has been permanently stuck on "Not Started" since bookings
-- moved to Supabase. This migration + the accompanying frontend rewrite
-- fixes that.
--
-- No document_id/PDF column - Laravel generated a real PDF via dompdf on
-- submit; there's no server-side PDF rendering available here, and the
-- user chose an in-app read-only report view over standing up an Edge
-- Function for this. checklist stays an opaque jsonb blob, mirroring how
-- Laravel itself treated interior_checklist as a plain unconverted blob.
create table vehicle_inspections (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  type text not null check (type in ('pre', 'post')),
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  mileage integer,
  fuel_level text,
  checklist jsonb not null default '{}'::jsonb,
  renter_signature_path text,
  agent_signature_path text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, type)
);

create table vehicle_inspection_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references vehicle_inspections(id) on delete cascade,
  angle text not null check (angle in ('front', 'back', 'left', 'right', 'odometer')),
  file_path text not null,
  latitude numeric,
  longitude numeric,
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  unique (inspection_id, angle)
);

create table vehicle_inspection_damage_points (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references vehicle_inspections(id) on delete cascade,
  view text not null check (view in ('front', 'rear', 'left', 'right', 'roof', 'windshield')),
  x_pct numeric not null,
  y_pct numeric not null,
  damage_type text not null check (damage_type in ('scratch', 'dent', 'crack')),
  note text,
  created_at timestamptz not null default now()
);

alter table vehicle_inspections enable row level security;
alter table vehicle_inspection_photos enable row level security;
alter table vehicle_inspection_damage_points enable row level security;

-- Renter runs the whole wizard on their own device (agent signs on the same
-- phone at handover - no separate "agent" user/session concept exists
-- anywhere in this app, matching the original Laravel design's own scope
-- note that this is a same-device, phone-passed-at-handover flow). Vendor
-- gets read-only visibility via the same is_vendor_owner() helper already
-- used on bookings - they care about condition documentation but never
-- submit it themselves.
create policy vehicle_inspections_renter_all on vehicle_inspections for all to authenticated
  using (exists (select 1 from bookings b where b.id = vehicle_inspections.booking_id and b.renter_id = auth.uid()))
  with check (exists (select 1 from bookings b where b.id = vehicle_inspections.booking_id and b.renter_id = auth.uid()));

create policy vehicle_inspections_vendor_select on vehicle_inspections for select to authenticated
  using (exists (
    select 1 from bookings b where b.id = vehicle_inspections.booking_id and is_vendor_owner(b.vendor_id)
  ));

create policy vehicle_inspections_admin_all on vehicle_inspections for all to authenticated
  using (is_admin()) with check (is_admin());

create policy vehicle_inspection_photos_renter_all on vehicle_inspection_photos for all to authenticated
  using (exists (
    select 1 from vehicle_inspections vi join bookings b on b.id = vi.booking_id
    where vi.id = vehicle_inspection_photos.inspection_id and b.renter_id = auth.uid()
  ))
  with check (exists (
    select 1 from vehicle_inspections vi join bookings b on b.id = vi.booking_id
    where vi.id = vehicle_inspection_photos.inspection_id and b.renter_id = auth.uid()
  ));

create policy vehicle_inspection_photos_vendor_select on vehicle_inspection_photos for select to authenticated
  using (exists (
    select 1 from vehicle_inspections vi join bookings b on b.id = vi.booking_id
    where vi.id = vehicle_inspection_photos.inspection_id and is_vendor_owner(b.vendor_id)
  ));

create policy vehicle_inspection_photos_admin_all on vehicle_inspection_photos for all to authenticated
  using (is_admin()) with check (is_admin());

create policy vehicle_inspection_damage_points_renter_all on vehicle_inspection_damage_points for all to authenticated
  using (exists (
    select 1 from vehicle_inspections vi join bookings b on b.id = vi.booking_id
    where vi.id = vehicle_inspection_damage_points.inspection_id and b.renter_id = auth.uid()
  ))
  with check (exists (
    select 1 from vehicle_inspections vi join bookings b on b.id = vi.booking_id
    where vi.id = vehicle_inspection_damage_points.inspection_id and b.renter_id = auth.uid()
  ));

create policy vehicle_inspection_damage_points_vendor_select on vehicle_inspection_damage_points for select to authenticated
  using (exists (
    select 1 from vehicle_inspections vi join bookings b on b.id = vi.booking_id
    where vi.id = vehicle_inspection_damage_points.inspection_id and is_vendor_owner(b.vendor_id)
  ));

create policy vehicle_inspection_damage_points_admin_all on vehicle_inspection_damage_points for all to authenticated
  using (is_admin()) with check (is_admin());
