-- Admin/vendor car edit forms (web + both mobile apps) only ever write the
-- free-text cars.location column - none of the 3 write paths ever touch
-- cars.region_id. But region_id is what both the website's "Pickup Location"
-- region filter and the admin fleet dashboard's region filter actually query
-- against, so a car's location edit (e.g. "Kumasi, Ashanti Region") silently
-- never shows up under its region until region_id catches up. This trigger
-- makes region_id self-heal from location on every insert/update, from
-- whichever app made the edit, instead of requiring each write path to know
-- about region_id individually.
create or replace function derive_region_id_from_location(p_location text)
returns uuid
language plpgsql
stable
as $$
declare
  v_region_id uuid;
begin
  if p_location is null or btrim(p_location) = '' then
    return null;
  end if;

  -- Exact region name appearing in the free text, longest name first so
  -- e.g. "Western North" doesn't get shadowed by a "Western" substring hit,
  -- and "Bono East"/"North East" don't get shadowed by "Bono"/"Northern".
  select id into v_region_id
  from regions
  where p_location ilike '%' || name || '%'
  order by length(name) desc
  limit 1;

  if v_region_id is not null then
    return v_region_id;
  end if;

  -- Fallback: common Ghanaian city/landmark names that don't literally spell
  -- out their region (matches what's actually in cars.location today, e.g.
  -- "Airport Roundabout, Kumasi", "Otswe Street, Osu", "Kaneshie").
  return (
    select r.id
    from regions r
    join (values
      ('Greater Accra', array['Accra','Osu','Tema','Kaneshie','Airport','Impact Hub','Labadi','Spintex','East Legon','Dansoman','Achimota','Dzorwulu','Cantonments','Adenta','Madina']),
      ('Ashanti',       array['Kumasi']),
      ('Western',       array['Takoradi','Sekondi']),
      ('Western North', array['Sefwi Wiawso']),
      ('Central',       array['Cape Coast','Elmina']),
      ('Volta',         array['Ho']),
      ('Eastern',       array['Koforidua']),
      ('Bono',          array['Sunyani']),
      ('Bono East',     array['Techiman']),
      ('Ahafo',         array['Goaso']),
      ('Northern',      array['Tamale']),
      ('North East',    array['Nalerigu']),
      ('Savannah',      array['Damongo']),
      ('Upper West',    array['Wa']),
      ('Upper East',    array['Bolgatanga']),
      ('Oti',           array['Dambai'])
    ) as aliases(region_name, cities) on r.name = aliases.region_name
    where exists (
      select 1 from unnest(aliases.cities) as city
      where p_location ilike '%' || city || '%'
    )
    limit 1
  );
end;
$$;

create or replace function set_car_region_id_from_location()
returns trigger
language plpgsql
as $$
begin
  new.region_id := coalesce(derive_region_id_from_location(new.location), new.region_id);
  return new;
end;
$$;

drop trigger if exists trg_set_car_region_id on cars;
create trigger trg_set_car_region_id
  before insert or update on cars
  for each row
  execute function set_car_region_id_from_location();

-- Backfill existing rows (including correcting the one car whose stale
-- region_id actively contradicted its own location text).
update cars
set region_id = coalesce(derive_region_id_from_location(location), region_id)
where location is not null;
