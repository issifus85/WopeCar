-- Bot / spam protection for the website's public forms.
-- 1) rate_limit_check(): a tiny DB-backed counter the website's server routes call (e.g. /api/subscribe, per visitor IP) -
--    serverless instances don't share memory, so an in-process limiter would not hold.
-- 2) throttle_public_insert(): BEFORE INSERT guard on the tables the website lets anonymous visitors write to directly from the
--    browser (inquiries, airport pickup, car-sale forms). A script can hit the REST API with the public anon key and skip the
--    form entirely, so the limit has to live in the database: at most 3 rows per email per hour, and 40 per table per 10 minutes.
--    Admins, the service role and database functions are exempt.

create table if not exists public.rate_limit_hits (
  key text not null,
  at timestamptz not null default now()
);
create index if not exists rate_limit_hits_key_at_idx on public.rate_limit_hits (key, at desc);
alter table public.rate_limit_hits enable row level security; -- no policies: only the function below touches it

create or replace function public.rate_limit_check(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer;
begin
  if p_key is null or length(p_key) > 120 or p_key !~ '^(subscribe|inquiry|signup):' or p_max < 1 or p_window_seconds < 1 or p_window_seconds > 86400 then
    return false;
  end if;

  if random() < 0.02 then
    delete from rate_limit_hits where at < now() - interval '2 days';
  end if;

  insert into rate_limit_hits (key) values (p_key);
  select count(*) into v_count from rate_limit_hits where key = p_key and at > now() - make_interval(secs => p_window_seconds);
  return v_count <= p_max;
end;
$$;
revoke all on function public.rate_limit_check(text, integer, integer) from public;
grant execute on function public.rate_limit_check(text, integer, integer) to anon, authenticated, service_role;

create or replace function public.throttle_public_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email text := lower(trim(coalesce(to_jsonb(new)->>'email', '')));
  v_count integer;
begin
  -- Only client-originated inserts are limited (current_user is the role the request runs as; this function is
  -- SECURITY DEFINER so it is read from the session, not the owner).
  if session_user not in ('anon', 'authenticator', 'authenticated') or coalesce(auth.role(), 'anon') = 'service_role' then
    return new;
  end if;
  if coalesce(is_admin(), false) then
    return new;
  end if;

  if v_email <> '' then
    execute format('select count(*) from %I.%I where lower(email) = $1 and created_at > now() - interval ''1 hour''', TG_TABLE_SCHEMA, TG_TABLE_NAME)
      into v_count using v_email;
    if v_count >= 3 then
      raise exception 'Too many requests from this email address. Please try again later or call us.' using errcode = 'P0001';
    end if;
  end if;

  execute format('select count(*) from %I.%I where created_at > now() - interval ''10 minutes''', TG_TABLE_SCHEMA, TG_TABLE_NAME)
    into v_count;
  if v_count >= 40 then
    raise exception 'We are receiving a lot of requests right now. Please try again in a few minutes.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_throttle_booking_inquiries on public.booking_inquiries;
create trigger trg_throttle_booking_inquiries before insert on public.booking_inquiries for each row execute function public.throttle_public_insert();
drop trigger if exists trg_throttle_airport_pickup_requests on public.airport_pickup_requests;
create trigger trg_throttle_airport_pickup_requests before insert on public.airport_pickup_requests for each row execute function public.throttle_public_insert();
drop trigger if exists trg_throttle_car_sale_inquiries on public.car_sale_inquiries;
create trigger trg_throttle_car_sale_inquiries before insert on public.car_sale_inquiries for each row execute function public.throttle_public_insert();
drop trigger if exists trg_throttle_car_sale_viewing_requests on public.car_sale_viewing_requests;
create trigger trg_throttle_car_sale_viewing_requests before insert on public.car_sale_viewing_requests for each row execute function public.throttle_public_insert();
