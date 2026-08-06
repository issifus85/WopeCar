alter table cars add column slug text unique;

-- Auto-generates from make/model/year whenever a car is created or those
-- fields change, so the public website (wopecar-website) always has a
-- stable URL without any of the car-creation code paths (mobile admin,
-- web admin) needing to know slugs exist.
create or replace function generate_car_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_slug text;
  candidate text;
  suffix int := 0;
begin
  base_slug := lower(regexp_replace(trim(coalesce(new.make, '') || ' ' || coalesce(new.model, '') || ' ' || coalesce(new.year::text, '')), '[^a-z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  if base_slug = '' then
    base_slug := 'car';
  end if;

  candidate := base_slug;
  while exists (select 1 from cars c where c.slug = candidate and c.id <> new.id) loop
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  end loop;

  new.slug := candidate;
  return new;
end;
$$;

create trigger cars_generate_slug
before insert or update of make, model, year on cars
for each row execute function generate_car_slug();

-- Backfill the 114 existing cars - "set make = make" forces the
-- UPDATE OF make trigger to fire for every row without changing any data.
update cars set make = make;
