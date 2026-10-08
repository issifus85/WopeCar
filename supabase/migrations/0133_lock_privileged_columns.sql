-- Pre-launch security audit (2026-10-08): several columns that decide WHO has
-- power in the system were writable by the very user they apply to.
--   * users.role / users.is_support: a signed-in user could UPDATE their own row
--     to role='admin' (is_admin() reads that column) - full admin from a normal
--     account. A signup with {"role":"admin"} in its metadata did the same,
--     because handle_new_auth_user() copied it straight into users.role.
--   * vendors.is_approved / application_status / total_earnings / document
--     statuses: a vendor could approve themselves.
--   * cars.status: a vendor could create a car directly as 'active' (skipping
--     approval) or flip pending -> active.
-- Fix: BEFORE triggers that apply ONLY to direct client writes. They detect
-- that with current_user - PostgREST runs client requests as the
-- `authenticated`/`anon` roles, whereas service_role Edge Functions, SQL and
-- SECURITY DEFINER functions (e.g. recompute_vendor_total_earnings) run as
-- something else - so trusted server paths are untouched. The trigger
-- functions are deliberately SECURITY INVOKER so current_user is the caller's.
-- Admins (is_admin()) are exempt: every legitimate writer of these columns
-- (admin dashboards, admin-only Edge Functions) is an admin or the service role.

create or replace function public.restrict_users_privileged_columns()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user not in ('authenticated', 'anon') or is_admin() then
    return new;
  end if;

  if new.id is distinct from old.id
    or new.role is distinct from old.role
    or new.is_support is distinct from old.is_support
    or new.is_verified is distinct from old.is_verified
    or new.qb_customer_id is distinct from old.qb_customer_id
    or new.referral_code is distinct from old.referral_code
  then
    raise exception 'Not authorized to change protected account fields.';
  end if;

  return new;
end;
$$;

drop trigger if exists restrict_users_privileged_columns on public.users;
create trigger restrict_users_privileged_columns
  before update on public.users
  for each row execute function public.restrict_users_privileged_columns();

-- Signup metadata is attacker-controlled (anyone can call /auth/v1/signup with
-- any `data`). Only the two self-service roles are honoured; staff roles are
-- set afterwards by the admin-create-user Edge Function with the service role.
-- An existing row's role is never overwritten from metadata.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.users (id, email, full_name, phone, role, terms_accepted_at)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    case when new.raw_user_meta_data->>'role' in ('renter', 'vendor') then new.raw_user_meta_data->>'role' else 'renter' end,
    (new.raw_user_meta_data->>'terms_accepted_at')::timestamptz
  )
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, public.users.full_name),
    phone = coalesce(excluded.phone, public.users.phone),
    terms_accepted_at = coalesce(public.users.terms_accepted_at, excluded.terms_accepted_at);
  return new;
end;
$$;

create or replace function public.restrict_vendors_privileged_columns()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user not in ('authenticated', 'anon') or is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A new vendor application always starts unapproved with default statuses.
    new.is_approved := false;
    new.application_status := 'pending';
    new.total_earnings := 0;
    new.id_document_status := 'not_submitted';
    new.business_reg_document_status := 'not_submitted';
    new.rejection_reason := null;
    new.id_document_rejection_reason := null;
    new.business_reg_document_rejection_reason := null;
    new.qb_vendor_id := null;
    return new;
  end if;

  if new.user_id is distinct from old.user_id
    or new.is_approved is distinct from old.is_approved
    or new.application_status is distinct from old.application_status
    or new.total_earnings is distinct from old.total_earnings
    or new.id_document_status is distinct from old.id_document_status
    or new.business_reg_document_status is distinct from old.business_reg_document_status
    or new.rejection_reason is distinct from old.rejection_reason
    or new.id_document_rejection_reason is distinct from old.id_document_rejection_reason
    or new.business_reg_document_rejection_reason is distinct from old.business_reg_document_rejection_reason
    or new.qb_vendor_id is distinct from old.qb_vendor_id
  then
    raise exception 'Not authorized to change protected vendor fields.';
  end if;

  return new;
end;
$$;

drop trigger if exists restrict_vendors_privileged_columns on public.vendors;
create trigger restrict_vendors_privileged_columns
  before insert or update on public.vendors
  for each row execute function public.restrict_vendors_privileged_columns();

create or replace function public.restrict_cars_status_changes()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user not in ('authenticated', 'anon') or is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Listings enter the approval queue; only an admin makes one live.
    if new.status is distinct from 'inactive' then
      new.status := 'pending';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    -- A vendor may take a live listing down, or flip active <-> inactive
    -- (the My Fleet toggle); they may not push a pending listing live.
    if not (new.status = 'inactive' or (old.status in ('active', 'inactive') and new.status in ('active', 'inactive'))) then
      raise exception 'Only an administrator can approve a listing.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists cars_restrict_status_changes on public.cars;
create trigger cars_restrict_status_changes
  before insert or update on public.cars
  for each row execute function public.restrict_cars_status_changes();
