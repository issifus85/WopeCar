-- Turns the 4 hardcoded filter groups (Category/Class/Driven By/Energy
-- Source) into DB rows too, so the admin can register a genuinely NEW
-- filter group (e.g. "Model Year" -> cars.year) without any code change,
-- not just new values within an existing group (that part already shipped
-- in 0039). car_column is restricted to the small set of real, simple
-- scalar cars columns that make sense as a checkbox filter - not full EAV,
-- a new group must describe a real existing car field. value_type drives
-- how wopecar-website casts submitted filter values before querying
-- (`.in(car_column, values)` needs numbers for year/seats/doors/baggage,
-- strings for everything else).
create table vehicle_attribute_groups (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  car_column text not null check (car_column in ('type', 'vehicle_class', 'drive_type', 'energy_source', 'year', 'seats', 'doors', 'baggage', 'transmission')),
  value_type text not null check (value_type in ('text', 'number')) default 'text',
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table vehicle_attribute_groups enable row level security;

create policy vehicle_attribute_groups_admin_all on vehicle_attribute_groups for all to authenticated
  using (is_admin()) with check (is_admin());

create policy vehicle_attribute_groups_public_select on vehicle_attribute_groups for select to public
  using (is_active);

insert into vehicle_attribute_groups (key, label, car_column, value_type, position) values
  ('type', 'Category', 'type', 'text', 0),
  ('vehicle_class', 'Class', 'vehicle_class', 'text', 1),
  ('drive_type', 'Driven By', 'drive_type', 'text', 2),
  ('energy_source', 'Energy Source', 'energy_source', 'text', 3);

-- vehicle_attributes.group_key was a fixed 4-value CHECK - replace it with
-- a real FK into the new registry, so a value can only belong to a group
-- that actually exists, and deleting a group cleans up its values too.
alter table vehicle_attributes drop constraint vehicle_attributes_group_key_check;
alter table vehicle_attributes
  add constraint vehicle_attributes_group_key_fkey
  foreign key (group_key) references vehicle_attribute_groups(key)
  on update cascade on delete cascade;
