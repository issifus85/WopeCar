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
  -- lower() must run BEFORE regexp_replace - otherwise [^a-z0-9] treats
  -- uppercase letters as junk to strip instead of letters to keep, eating
  -- the first letter of every capitalized word (real bug, caught via a
  -- corrupted build: "HYUNDAI ELANTRA" -> "yundai-lantra").
  base_slug := regexp_replace(lower(trim(coalesce(new.make, '') || ' ' || coalesce(new.model, '') || ' ' || coalesce(new.year::text, ''))), '[^a-z0-9]+', '-', 'g');
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

update cars set make = make;
