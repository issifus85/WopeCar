-- Per-car SEO title/description override, same purpose as pages.meta_title/
-- meta_desc but scoped to a car row directly rather than the `pages` CMS
-- table (which is keyed for a small fixed set of static marketing routes,
-- not one row per car at fleet scale). Falls back to the auto-generated
-- title/description in wopecar-website's buildTitleAndDescription() when
-- null.
alter table public.cars add column if not exists seo_title text;
alter table public.cars add column if not exists seo_description text;

-- Lets an admin manually override a car's URL slug (wopecar-admin's Fleet
-- edit form) instead of always being stuck with whatever generate_car_slug()
-- auto-derived from make/model/year. Previously that trigger unconditionally
-- overwrote `slug` on every single Edit Listing save (it fires "before
-- update of make, model, year", and the web admin's updateCar() always
-- includes those three columns in every save regardless of whether they
-- changed) - so a manually-typed slug would've been silently clobbered on
-- the very next edit.
--
-- Fix: only auto-generate when the caller didn't change the slug (new row,
-- or an edit where new.slug = old.slug, which is what happens today since
-- no caller sends a different slug value). When new.slug is explicitly
-- different from old.slug, treat that as an intentional manual edit -
-- sanitize/dedupe it the same way as an auto-generated one (still lowercase,
-- hyphenated, and suffixed with -1/-2/... on collision, matching the
-- "numbers at the end of the string for similar make-models" convention)
-- but don't regenerate it from make/model/year.
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
  manual_edit boolean;
begin
  manual_edit := tg_op = 'UPDATE' and new.slug is distinct from old.slug and new.slug is not null and trim(new.slug) <> '';

  if manual_edit then
    base_slug := regexp_replace(lower(trim(new.slug)), '[^a-z0-9]+', '-', 'g');
  else
    base_slug := regexp_replace(lower(trim(coalesce(new.make, '') || ' ' || coalesce(new.model, '') || ' ' || coalesce(new.year::text, ''))), '[^a-z0-9]+', '-', 'g');
  end if;
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

-- Re-created to also fire on a direct update of `slug` itself (not just
-- make/model/year) - defense in depth in case a future caller ever sends a
-- partial update touching only slug, so it still gets sanitized/deduped
-- rather than saved verbatim.
drop trigger if exists cars_generate_slug on cars;
create trigger cars_generate_slug
before insert or update of make, model, year, slug on cars
for each row execute function generate_car_slug();

