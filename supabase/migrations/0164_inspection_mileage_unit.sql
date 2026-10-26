-- Some cars' odometers read in kilometres, others in miles. The inspection recorded just a number and every screen/PDF labelled it "km".
-- mileage_unit stores which unit the inspector saw ('km' default - what every existing row was labelled).
alter table public.vehicle_inspections add column if not exists mileage_unit text not null default 'km';
alter table public.vehicle_inspections drop constraint if exists vehicle_inspections_mileage_unit_check;
alter table public.vehicle_inspections add constraint vehicle_inspections_mileage_unit_check check (mileage_unit in ('km', 'mi'));
