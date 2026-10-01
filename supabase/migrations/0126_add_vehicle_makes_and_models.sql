-- Self-service Make/Model management for wopecar-admin's "Fleet > Makes &
-- Models" page - until now these were a hand-maintained JS/TS array
-- (lib/constants/vehicleCatalog.ts's VEHICLE_MAKES, duplicated in the
-- mobile app's own copy) requiring a code change + redeploy to add a
-- single new make or model (e.g. "Toyota Coaster"). Deliberately NOT
-- folded into the existing vehicle_attribute_groups/vehicle_attributes
-- system (migrations 0039/0040) - that system is flat key-value per car
-- column and has no parent/child concept, whereas Model is inherently
-- scoped to a Make (a cascading dropdown), so it needs its own two-table
-- shape instead.
--
-- cars.make/cars.model stay plain free-text columns (unchanged) - this is
-- a *suggested* vocabulary that drives the admin's Car Make/Model
-- dropdowns, not a foreign key constraint, so existing car rows and any
-- future free-text edge case are unaffected.
create table vehicle_makes (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table vehicle_models (
  id uuid primary key default gen_random_uuid(),
  make_id uuid not null references vehicle_makes(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (make_id, name)
);

create index vehicle_models_make_id_idx on vehicle_models(make_id);

alter table vehicle_makes enable row level security;
alter table vehicle_models enable row level security;

-- Same RLS posture as vehicle_attribute_groups/vehicle_attributes: public
-- read of active rows (website/mobile can read this later without an
-- auth session), admin-only write.
create policy vehicle_makes_select on vehicle_makes for select using (is_active);
create policy vehicle_makes_admin_all on vehicle_makes for all to authenticated using (is_admin()) with check (is_admin());

create policy vehicle_models_select on vehicle_models for select using (is_active);
create policy vehicle_models_admin_all on vehicle_models for all to authenticated using (is_admin()) with check (is_admin());

-- Seed from the existing VEHICLE_MAKES catalog (lib/constants/vehicleCatalog.ts),
-- so nothing already relied upon in the admin's Add/Edit Car form is lost -
-- plus "Coaster" newly added under Toyota.
insert into vehicle_makes (name, position) values
('Toyota', 0), ('Hyundai', 1), ('Kia', 2), ('Nissan', 3), ('Honda', 4), ('Ford', 5),
('Chevrolet', 6), ('Mercedes-Benz', 7), ('BMW', 8), ('Volkswagen', 9), ('Suzuki', 10),
('Mitsubishi', 11), ('Mazda', 12), ('Jeep', 13), ('Land Rover', 14), ('Lexus', 15),
('Peugeot', 16), ('Renault', 17), ('Infiniti', 18), ('Kantanka', 19), ('Yutong', 20);

insert into vehicle_models (make_id, name, position)
select id, model.name, model.position from vehicle_makes, (values
  ('Camry',0),('Corolla',1),('Corolla Cross',2),('RAV4',3),('Highlander',4),('Land Cruiser',5),
  ('Land Cruiser V8',6),('Land Cruiser Prado',7),('Hilux',8),('Hiace',9),('Yaris',10),('Avalon',11),
  ('Sienna',12),('4-Runner',13),('Fortuner',14),('Rush',15),('Coaster',16)
) as model(name, position) where vehicle_makes.name = 'Toyota';

insert into vehicle_models (make_id, name, position)
select id, model.name, model.position from vehicle_makes, (values
  ('Elantra',0),('Tucson',1),('Santa Fe',2),('Sonata',3),('Accent',4),('i10',5),('i20',6),
  ('Creta',7),('Palisade',8),('Venue',9),('H1',10),('ix35',11)
) as model(name, position) where vehicle_makes.name = 'Hyundai';

insert into vehicle_models (make_id, name, position)
select id, model.name, model.position from vehicle_makes, (values
  ('Sportage',0),('Picanto',1),('Rio',2),('Sorento',3),('Sonet',4),('Seltos',5),('Cerato',6),
  ('Soul',7),('Forte',8),('Granbird',9)
) as model(name, position) where vehicle_makes.name = 'Kia';

insert into vehicle_models (make_id, name, position)
select id, model.name, model.position from vehicle_makes, (values
  ('Altima',0),('Sentra',1),('X-Trail',2),('Rogue',3),('Pathfinder',4),('Navara',5),
  ('NP300 Hardbody',6),('Patrol',7),('Micra',8),('Qashqai',9)
) as model(name, position) where vehicle_makes.name = 'Nissan';

insert into vehicle_models (make_id, name, position)
select id, model.name, model.position from vehicle_makes, (values
  ('Civic',0),('Accord',1),('CR-V',2),('HR-V',3),('Pilot',4),('City',5),('Fit',6)
) as model(name, position) where vehicle_makes.name = 'Honda';

insert into vehicle_models (make_id, name, position)
select id, model.name, model.position from vehicle_makes, (values
  ('Focus',0),('Fusion',1),('Explorer',2),('Escape',3),('Ranger',4),('EcoSport',5),('Everest',6),('Transit',7)
) as model(name, position) where vehicle_makes.name = 'Ford';

insert into vehicle_models (make_id, name, position)
select id, model.name, model.position from vehicle_makes, (values
  ('Cruze',0),('Malibu',1),('Captiva',2),('Trailblazer',3),('Spark',4)
) as model(name, position) where vehicle_makes.name = 'Chevrolet';

insert into vehicle_models (make_id, name, position)
select id, model.name, model.position from vehicle_makes, (values
  ('A-Class',0),('B-Class',1),('C-Class',2),('E-Class',3),('S-Class',4),('CLA',5),('CLS',6),
  ('GLA',7),('GLB',8),('GLC',9),('GLK',10),('GLE',11),('GLS',12),('ML-Class',13),('GL-Class',14),
  ('G-Class',15),('Sprinter',16),('Vito',17),('Viano',18),('V-Class',19),('Maybach',20)
) as model(name, position) where vehicle_makes.name = 'Mercedes-Benz';

insert into vehicle_models (make_id, name, position)
select id, model.name, model.position from vehicle_makes, (values
  ('3 Series',0),('5 Series',1),('X1',2),('X3',3),('X5',4)
) as model(name, position) where vehicle_makes.name = 'BMW';

insert into vehicle_models (make_id, name, position)
select id, model.name, model.position from vehicle_makes, (values
  ('Golf',0),('Passat',1),('Jetta',2),('Polo',3),('Tiguan',4),('Touareg',5)
) as model(name, position) where vehicle_makes.name = 'Volkswagen';

insert into vehicle_models (make_id, name, position)
select id, model.name, model.position from vehicle_makes, (values
  ('Swift',0),('Vitara',1),('Jimny',2),('Baleno',3),('Ertiga',4)
) as model(name, position) where vehicle_makes.name = 'Suzuki';

insert into vehicle_models (make_id, name, position)
select id, model.name, model.position from vehicle_makes, (values
  ('Outlander',0),('Pajero',1),('L200',2),('ASX',3),('Mirage',4)
) as model(name, position) where vehicle_makes.name = 'Mitsubishi';

insert into vehicle_models (make_id, name, position)
select id, model.name, model.position from vehicle_makes, (values
  ('Mazda3',0),('Mazda6',1),('CX-5',2),('CX-9',3),('BT-50',4)
) as model(name, position) where vehicle_makes.name = 'Mazda';

insert into vehicle_models (make_id, name, position)
select id, model.name, model.position from vehicle_makes, (values
  ('Wrangler',0),('Grand Cherokee',1),('Cherokee',2),('Compass',3)
) as model(name, position) where vehicle_makes.name = 'Jeep';

insert into vehicle_models (make_id, name, position)
select id, model.name, model.position from vehicle_makes, (values
  ('Range Rover',0),('Range Rover Sport',1),('Range Rover Evoque',2),('Discovery',3),('Defender',4)
) as model(name, position) where vehicle_makes.name = 'Land Rover';

insert into vehicle_models (make_id, name, position)
select id, model.name, model.position from vehicle_makes, (values
  ('RX',0),('ES',1),('NX',2),('GX',3),('LX',4)
) as model(name, position) where vehicle_makes.name = 'Lexus';

insert into vehicle_models (make_id, name, position)
select id, model.name, model.position from vehicle_makes, (values
  ('301',0),('3008',1),('5008',2),('Partner',3)
) as model(name, position) where vehicle_makes.name = 'Peugeot';

insert into vehicle_models (make_id, name, position)
select id, model.name, model.position from vehicle_makes, (values
  ('Duster',0),('Logan',1),('Sandero',2),('Koleos',3)
) as model(name, position) where vehicle_makes.name = 'Renault';

insert into vehicle_models (make_id, name, position)
select id, model.name, model.position from vehicle_makes, (values
  ('QX80',0),('QX60',1),('QX50',2),('Q50',3),('Q60',4)
) as model(name, position) where vehicle_makes.name = 'Infiniti';

insert into vehicle_models (make_id, name, position)
select id, model.name, model.position from vehicle_makes, (values
  ('Onantefo',0)
) as model(name, position) where vehicle_makes.name = 'Kantanka';

insert into vehicle_models (make_id, name, position)
select id, model.name, model.position from vehicle_makes, (values
  ('50-Seater Bus',0)
) as model(name, position) where vehicle_makes.name = 'Yutong';
