-- Fleet Officer: make the 30-day location rule cover the trip record too (privacy policy section 8.4, Nov 27 2026).
--
-- 0191's daily job deletes officer_locations fixes older than 30 days, but trip_tasks keeps the officer's last position
-- (last_lat / last_lng / last_heading) and the route line drawn from it for good. This job, run in the same daily slot,
-- clears those on trips whose last fix is over 30 days old and that are no longer on the way. Trip events, ETAs, times,
-- addresses and destination pin are kept. Safe to run more than once.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'fleet-officer-locations-retention';
    perform cron.schedule('fleet-officer-locations-retention', '17 3 * * *', $job$
      delete from public.officer_locations where recorded_at < now() - interval '30 days';
      update public.trip_tasks
         set last_lat = null, last_lng = null, last_heading = null, route_polyline = null
       where last_location_at < now() - interval '30 days'
         and status <> 'en_route'
         and (last_lat is not null or last_lng is not null or route_polyline is not null);
    $job$);
  end if;
end $$;
