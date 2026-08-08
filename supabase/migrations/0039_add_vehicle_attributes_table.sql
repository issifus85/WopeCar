-- Admin-manageable filter/attribute taxonomy for cars.type, .vehicle_class,
-- .drive_type, .energy_source - previously hardcoded in parallel constant
-- files (wopecar-admin's lib/constants/vehicleCatalog.ts and
-- wopecar-website's lib/data/vehicleCatalog.ts). Seeded below with the
-- exact values/labels those files already had, so this migration changes
-- nothing visible on its own - only wopecar-admin's new Fleet > Attributes
-- page and CarFormModal, plus wopecar-website's /book-a-car filters, start
-- reading from here instead (separate app-repo commits).
create table vehicle_attributes (
  id uuid primary key default gen_random_uuid(),
  group_key text not null check (group_key in ('type', 'vehicle_class', 'drive_type', 'energy_source')),
  value text not null,
  label text not null,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (group_key, value)
);

alter table vehicle_attributes enable row level security;

create policy vehicle_attributes_admin_all on vehicle_attributes for all to authenticated
  using (is_admin()) with check (is_admin());

-- Public (website) only ever sees active attributes - RLS policies are
-- OR'd together, so an authenticated admin still sees inactive rows too
-- via the admin_all policy above (needed to let them reactivate one).
create policy vehicle_attributes_public_select on vehicle_attributes for select to public
  using (is_active);

insert into vehicle_attributes (group_key, value, label, position) values
  ('type', 'suvs-4x4s', 'SUVs / 4x4s', 0),
  ('type', 'mid-size-suvs', 'Mid Size SUVs', 1),
  ('type', 'sedan', 'Sedan', 2),
  ('type', 'hatchbacks', 'Hatchbacks', 3),
  ('type', 'minivans', 'Minivans', 4),
  ('type', 'buses', 'Buses', 5),
  ('type', 'pickups', 'Pickups', 6),
  ('vehicle_class', 'luxury', 'Luxury', 0),
  ('vehicle_class', 'economy-1', 'Comfort', 1),
  ('vehicle_class', 'economy-2', 'Economy', 2),
  ('drive_type', 'Self-drive', 'Self-drive', 0),
  ('drive_type', 'Chauffeur', 'Chauffeur', 1),
  ('energy_source', 'Gasoline', 'Gasoline', 0),
  ('energy_source', 'Diesel', 'Diesel', 1),
  ('energy_source', 'EV', 'EV', 2);
