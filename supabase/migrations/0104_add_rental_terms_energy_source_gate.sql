-- The "Battery Charging Policy (for EVs)" clause was a plain self_drive
-- rental_terms_clauses row with no way to scope it to EV cars, so it showed
-- on every self-drive car regardless of fuel type - an admin could only
-- unpublish it entirely (killing it for actual EV cars too), which is what
-- happened here. requires_energy_source narrows a clause to cars whose
-- energy_source matches (cars.energy_source, see ENERGY_SOURCE_OPTIONS);
-- null (the default) keeps today's behaviour - applies to every car in its
-- drive_type section.
alter table rental_terms_clauses add column requires_energy_source text null;

update rental_terms_clauses
set requires_energy_source = 'EV', is_published = true
where title = 'Battery Charging Policy (for EVs)';
