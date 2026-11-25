-- ID name matching: make a renter's registered name comparable to the name
-- printed on their government ID, so admin verification is a glance instead
-- of a judgement call.
--
-- The problem this solves: `users` stored full_name (and, unused, first_name/
-- last_name) plus national_id_number / driver_license_number and their
-- verify-reject statuses - but nothing anywhere recorded the name as printed
-- on the document. An admin opening a verification had a photo on one side
-- and a self-chosen display name on the other, with no way to check, and no
-- way for the system to flag a mismatch before it reached them.
--
-- Deliberately NOT a gate. Legitimate mismatches are common and ordinary -
-- married names, a middle name that appears on the ID but not in daily use,
-- the document itself spelling a name differently. Everything here records
-- and surfaces; nothing blocks a booking.

-- ---------------------------------------------------------------------------
-- 1. The missing columns
-- ---------------------------------------------------------------------------

alter table public.users
  add column if not exists id_document_name text,
  add column if not exists id_name_confirmed_at timestamptz;

comment on column public.users.id_document_name is
  'The renter''s name exactly as printed on their government ID / licence, as they typed it. Compared against full_name by person_names_match(). Never shown to vendors.';
comment on column public.users.id_name_confirmed_at is
  'When the renter last confirmed their profile name matches their ID. Cleared automatically whenever full_name changes, so a rename re-raises the prompt.';

-- Neither column is in restrict_users_privileged_columns' protected list, and
-- that is intentional: both are the renter's own statement about their own
-- document, so they must be able to write them. The columns that decide
-- whether a document is *accepted* (national_id_status,
-- license_verification_status) stay admin-only under
-- restrict_verification_status_update, untouched by this migration.

-- ---------------------------------------------------------------------------
-- 2. Name comparison
-- ---------------------------------------------------------------------------

-- Folds accented Latin letters down to their plain ASCII base, so "José
-- Álvarez" and "Jose Alvarez" compare equal.
--
-- Deliberately NOT the `unaccent` extension. unaccent is not installed on
-- either project, and the fallback would have been worse than useless here:
-- normalize_person_name strips anything outside [a-z0-9], so an un-folded
-- "josé" does not merely fail to match, it silently becomes "jos". A
-- translate() map needs no extension, behaves identically on preprod and
-- production, and is honestly IMMUTABLE - unaccent is only STABLE, since it
-- depends on a dictionary file that can change under it.
--
-- Input is already lower-cased by the caller, so only lowercase forms are
-- mapped. Multi-character expansions (ß -> ss) are out of reach for
-- translate(); those simply fail to match and get flagged for a human, which
-- is the safe direction.
create or replace function public.unaccent_safe(p_text text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select translate(
    coalesce(p_text, ''),
    'àáâãäåāăąèéêëēĕėęěìíîïĩīĭįıòóôõöøōŏőùúûüũūŭůűųñńņňçćĉċčýÿŷžźżšśŝşğĝġģďđťţŕřłĺľ',
    'aaaaaaaaaeeeeeeeeeiiiiiiiiiooooooooouuuuuuuuuunnnncccccyyyzzzssssggggddttrrlll'
  );
$$;

-- Strips case, accents, punctuation and extra whitespace so that
-- "Kwame  Osei-Mensah" and "KWAME OSEI MENSAH" reduce to the same thing.
-- lower() runs first so unaccent_safe only has to know lowercase forms.
create or replace function public.normalize_person_name(p_name text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select nullif(
    btrim(
      regexp_replace(
        public.unaccent_safe(lower(coalesce(p_name, ''))),
        '[^a-z0-9]+', ' ', 'g'
      )
    ),
    ''
  );
$$;

-- True when two names plausibly describe the same person.
--
-- Token-set containment rather than string equality, because the two real
-- cases are word ORDER ("Seidu Yusif" on the ID, "Yusif Seidu" in the
-- profile - Ghanaian IDs commonly print surname first) and EXTRA tokens
-- ("Yusif Kwame Seidu" on the ID, "Yusif Seidu" in the profile). Both are
-- the same person and must not be flagged.
--
-- Requires at least two tokens on the shorter side: a lone "Yaw" is contained
-- in half the names in Ghana, so single-token names are reported as a
-- mismatch for a human to look at rather than waved through.
create or replace function public.person_names_match(a text, b text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  with t as (
    select
      (select array_agg(distinct x) from unnest(string_to_array(public.normalize_person_name(a), ' ')) x) as ta,
      (select array_agg(distinct x) from unnest(string_to_array(public.normalize_person_name(b), ' ')) x) as tb
  )
  select coalesce(
    (ta @> tb or tb @> ta) and least(cardinality(ta), cardinality(tb)) >= 2,
    false
  )
  from t;
$$;

-- ---------------------------------------------------------------------------
-- 3. A rename invalidates the confirmation
-- ---------------------------------------------------------------------------

-- Without this, a renter could confirm "my name matches my ID", get verified,
-- then change full_name to anything at all and keep a verified badge that
-- attests to a name nobody ever checked. Clearing the confirmation re-raises
-- the prompt and re-flags them to admin on the next review.
--
-- It deliberately does NOT revoke national_id_status / license_verification_status:
-- those are admin decisions about a document that is still genuine, and
-- silently un-verifying people on a typo fix would be its own problem.
create or replace function public.clear_id_name_confirmation_on_rename()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.full_name is distinct from old.full_name
     and not public.person_names_match(new.full_name, old.full_name)
  then
    new.id_name_confirmed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists users_clear_id_name_confirmation on public.users;
create trigger users_clear_id_name_confirmation
  before update of full_name on public.users
  for each row
  execute function public.clear_id_name_confirmation_on_rename();

-- ---------------------------------------------------------------------------
-- 4. Populate the structured name columns
-- ---------------------------------------------------------------------------

-- first_name / last_name have existed for a long time but were written by
-- almost nothing (14 rows out of 5,102 at the time of writing) - the signup
-- trigger only ever set full_name, and checkout collected First/Last then
-- joined them back into full_name. Registration now sends both, so backfill
-- the existing rows from what we already have rather than leaving the columns
-- half-populated and untrustworthy.
update public.users
set
  first_name = split_part(btrim(regexp_replace(full_name, '\s+', ' ', 'g')), ' ', 1),
  last_name  = nullif(
    btrim(substr(
      btrim(regexp_replace(full_name, '\s+', ' ', 'g')),
      length(split_part(btrim(regexp_replace(full_name, '\s+', ' ', 'g')), ' ', 1)) + 1
    )),
    ''
  )
where first_name is null
  and nullif(btrim(coalesce(full_name, '')), '') is not null;

-- ---------------------------------------------------------------------------
-- 5. Signup writes the structured name too
-- ---------------------------------------------------------------------------

-- Same body as before plus first_name / last_name. full_name stays the
-- source of truth everywhere that already reads it (emails, invoices,
-- agreements), so this is additive - nothing downstream has to change.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.users (id, email, full_name, first_name, last_name, phone, role, terms_accepted_at)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    -- OAuth signups (Google / Apple) never pass these: they send only the
    -- provider's display name as full_name. Fall back to splitting it so a
    -- social signup is not left with empty structured names.
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'first_name'), ''),
      nullif(split_part(btrim(regexp_replace(coalesce(new.raw_user_meta_data->>'full_name', ''), '\s+', ' ', 'g')), ' ', 1), '')
    ),
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'last_name'), ''),
      nullif(
        btrim(substr(
          btrim(regexp_replace(coalesce(new.raw_user_meta_data->>'full_name', ''), '\s+', ' ', 'g')),
          length(split_part(btrim(regexp_replace(coalesce(new.raw_user_meta_data->>'full_name', ''), '\s+', ' ', 'g')), ' ', 1)) + 1
        )),
        ''
      )
    ),
    new.raw_user_meta_data->>'phone',
    case when new.raw_user_meta_data->>'role' in ('renter', 'vendor') then new.raw_user_meta_data->>'role' else 'renter' end,
    (new.raw_user_meta_data->>'terms_accepted_at')::timestamptz
  )
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, public.users.full_name),
    first_name = coalesce(excluded.first_name, public.users.first_name),
    last_name = coalesce(excluded.last_name, public.users.last_name),
    phone = coalesce(excluded.phone, public.users.phone),
    terms_accepted_at = coalesce(public.users.terms_accepted_at, excluded.terms_accepted_at);
  return new;
end;
$$;
