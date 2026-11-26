-- Cookie-banner outcome counters.
--
-- Why this exists: Meta recorded 10 landing-page views from 89 ad clicks, and
-- the suspected cause is visitors never answering the cookie banner (tags stay
-- in Consent Mode's denied state until they do). Changing the banner without a
-- before/after number would just be a guess, so count the four outcomes per
-- day: shown, Accept All, Necessary Only, and - derived - no answer.
--
-- Aggregate only. One row per (day, action) holding a count. No visitor
-- identifier, no IP, no user agent, nothing that could be tied back to a
-- person, so this needs no consent of its own and never reaches GA4 or Meta.

create table if not exists public.consent_events (
  day     date   not null,
  action  text   not null check (action in ('shown', 'accepted', 'declined')),
  count   bigint not null default 0,
  primary key (day, action)
);

comment on table public.consent_events is
  'Daily cookie-banner outcome tallies (aggregate only, no visitor data). Written solely by log_consent_event().';

-- RLS on with no policies at all: the anon key can neither read nor write this
-- table directly. The SECURITY DEFINER function below is the only way in.
alter table public.consent_events enable row level security;

/**
 * Increment one counter for today. SECURITY DEFINER because the website calls
 * it with the anon key and the table is closed to anon.
 *
 * Safe to expose: the only argument is checked against a three-value list, it
 * returns nothing, and it can neither read nor alter anything other than its
 * own counters - so the worst a caller can do is add to a tally. The route
 * that calls it (app/api/consent-event) still bot-filters and rate-limits
 * first.
 */
create or replace function public.log_consent_event(p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_action is null or p_action not in ('shown', 'accepted', 'declined') then
    return;
  end if;

  insert into public.consent_events as ce (day, action, count)
  values ((now() at time zone 'utc')::date, p_action, 1)
  on conflict (day, action) do update set count = ce.count + 1;
end;
$$;

revoke all on function public.log_consent_event(text) from public;
grant execute on function public.log_consent_event(text) to anon, authenticated;

/**
 * Read side: one row per day with the three counts and the derived "no
 * answer". security_invoker so the view can never be used to read around the
 * table's RLS (an earlier audit found anon-writable/anon-readable views doing
 * exactly that), and no grant to anon - this is for the service role.
 *
 * no_answer is shown minus the two answers, floored at zero. It is an
 * estimate: a visitor shown the banner near midnight who answers after it
 * counts once in each day's column.
 */
create or replace view public.consent_daily as
select
  day,
  coalesce(max(count) filter (where action = 'shown'), 0)    as shown,
  coalesce(max(count) filter (where action = 'accepted'), 0) as accepted,
  coalesce(max(count) filter (where action = 'declined'), 0) as declined,
  greatest(
    coalesce(max(count) filter (where action = 'shown'), 0)
      - coalesce(max(count) filter (where action = 'accepted'), 0)
      - coalesce(max(count) filter (where action = 'declined'), 0),
    0
  ) as no_answer
from public.consent_events
group by day;

alter view public.consent_daily set (security_invoker = on);
revoke all on public.consent_daily from anon;

/**
 * rate_limit_check only honours keys whose prefix is on an allow-list (added
 * by 0151 after the newsletter flood, so the RPC can't be driven with
 * arbitrary keys). An unrecognised prefix returns false, and underRateLimit()
 * reads false as "over the limit" - so a new caller is silently throttled to
 * zero rather than failing open the way that helper's comment promises.
 *
 * Caught exactly that way here: every consent-event request returned its
 * usual 204 and wrote nothing. Adding 'consent' to the allow-list rather than
 * dropping the rate limit, so /api/consent-event keeps a ceiling. Only the
 * regex changes; the body below is otherwise 0151's verbatim.
 */
create or replace function public.rate_limit_check(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count integer;
begin
  if p_key is null or length(p_key) > 120 or p_key !~ '^(subscribe|inquiry|signup|consent):' or p_max < 1 or p_window_seconds < 1 or p_window_seconds > 86400 then
    return false;
  end if;

  if random() < 0.02 then
    delete from rate_limit_hits where at < now() - interval '2 days';
  end if;

  insert into rate_limit_hits (key) values (p_key);
  select count(*) into v_count from rate_limit_hits where key = p_key and at > now() - make_interval(secs => p_window_seconds);
  return v_count <= p_max;
end;
$function$;

-- Supabase's schema defaults hand anon/authenticated a blanket SELECT on new
-- public tables. RLS with zero policies already returns nothing to them, but
-- the grant itself has no business existing here - drop it so the table is
-- reachable only through log_consent_event().
revoke all on public.consent_events from anon, authenticated;
