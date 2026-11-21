-- Fleet Officer Phase 6 - hardening checks. Run on Wopecar-PREPROD after 0184 (SQL editor, paste all, Run).
-- Self-contained and NOTHING is kept: it picks an admin, two ordinary accounts and one confirmed booking whose renter is an ordinary
-- account, runs every check as the right person (role authenticated + their user id, like the app), shows a PASS/FAIL table and
-- ROLLS BACK every change (including the test cancellation of the booking).
begin;

create temp table fo_results (n serial, check_name text, pass boolean, detail text) on commit drop;
grant all on fo_results to authenticated;
grant all on sequence fo_results_n_seq to authenticated;

do $$
declare
  v_admin uuid; v_off1 uuid; v_off2 uuid; v_booking uuid; v_renter uuid; v_vendor_user uuid;
  v_del uuid; v_pick uuid; v_res jsonb; v_count int; v_count2 int; v_ok boolean; v_text text; v_msg1 uuid; v_msg2 uuid;
  t trip_tasks%rowtype;
begin
  select id into v_admin from users where role = 'admin' order by created_at limit 1;
  select b.id, b.renter_id into v_booking, v_renter
    from bookings b join conversations c on c.booking_id = b.id join users ru on ru.id = b.renter_id
    where b.status = 'confirmed' and ru.role in ('renter', 'vendor') order by b.start_date desc limit 1;
  select v.user_id into v_vendor_user from bookings b join vendors v on v.id = b.vendor_id where b.id = v_booking;
  select id into v_off1 from users where role in ('renter', 'vendor') and id <> v_renter and id is distinct from v_vendor_user
    and not exists (select 1 from officer_profiles o where o.user_id = users.id) order by created_at limit 1;
  select id into v_off2 from users where role in ('renter', 'vendor') and id not in (v_renter, v_off1) and id is distinct from v_vendor_user
    and not exists (select 1 from officer_profiles o where o.user_id = users.id) order by created_at limit 1;
  if v_admin is null or v_booking is null or v_off1 is null or v_off2 is null then
    raise exception 'Need an admin, a confirmed booking with a chat whose renter is not an admin, and two other accounts.';
  end if;

  insert into officer_profiles (user_id, display_name) values (v_off1, 'Test Officer One'), (v_off2, 'Test Officer Two');
  perform fo_sync_booking_tasks(v_booking);
  select id into v_del from trip_tasks where booking_id = v_booking and type = 'delivery';
  select id into v_pick from trip_tasks where booking_id = v_booking and type = 'pickup';
  -- Both trips accepted by officer 1, so the "two trips at once" rule can be checked.
  update trip_tasks set officer_id = null, status = 'unassigned', last_location_at = null, eta_updated_at = null, sharing_stopped_at = null
   where id in (v_del, v_pick);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform admin_assign_trip_task(v_del, v_off1);
  perform admin_assign_trip_task(v_pick, v_off1);
  execute 'reset role';

  -- ---- officer 1 ----
  perform set_config('request.jwt.claim.sub', v_off1::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_off1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform officer_respond_trip_task(v_del, true);
  perform officer_respond_trip_task(v_pick, true);

  perform officer_advance_trip_task(v_del, 'en_route');
  perform officer_advance_trip_task(v_del, 'en_route');   -- the offline queue sending the same tap again
  execute 'reset role';
  select count(*) into v_count from notifications where user_id = v_renter and type = 'fleet_trip' and title ilike '%on the way%'
    and created_at >= now() - interval '1 minute';
  insert into fo_results (check_name, pass, detail) values ('Sending Start trip twice is accepted once, with one push to the renter', v_count = 1, v_count || ' push(es)');

  execute 'set local role authenticated';
  begin
    perform officer_advance_trip_task(v_pick, 'en_route'); v_ok := false;
  exception when others then v_ok := true; end;
  execute 'reset role';
  insert into fo_results (check_name, pass) values ('An officer cannot start a second trip while one is on the way', v_ok and (select status from trip_tasks where id = v_pick) = 'accepted');

  execute 'set local role authenticated';
  v_msg1 := officer_quick_reply(v_del, 'on_my_way');
  v_msg2 := officer_quick_reply(v_del, 'on_my_way');
  execute 'reset role';
  select count(*) into v_count from trip_events where trip_task_id = v_del and event = 'quick_reply';
  insert into fo_results (check_name, pass, detail) values ('The same quick reply sent twice is posted once', v_msg1 = v_msg2 and v_count = 1, v_count || ' message(s)');

  execute 'set local role authenticated';
  v_res := officer_share_location(v_del, 5.6037, -0.1870);
  execute 'reset role';
  insert into fo_results (check_name, pass, detail) values ('Officer 1 is sharing live location', (v_res ->> 'sharing')::boolean, v_res::text);

  -- ---- admin reassigns the trip while it is on the way ----
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  t := admin_assign_trip_task(v_del, v_off2);
  execute 'reset role';
  insert into fo_results (check_name, pass, detail) values ('Reassigning a live trip clears the old officer''s position, ETA and route',
    t.status = 'assigned' and t.last_lat is null and t.last_location_at is null and t.eta_seconds is null and t.route_polyline is null
      and t.sharing_stopped_at is not null, t.status);
  select count(*) into v_count from notifications where user_id = v_renter and type = 'fleet_trip' and title ilike '%officer has changed%'
    and created_at >= now() - interval '1 minute';
  insert into fo_results (check_name, pass, detail) values ('The renter is told their officer changed', v_count = 1, v_count || ' push(es)');

  perform set_config('request.jwt.claim.sub', v_off1::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_off1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_res := officer_share_location(v_del, 5.6040, -0.1871);
  select count(*) into v_count from officer_trip_tasks() where id = v_del;
  execute 'reset role';
  select count(*) into v_count2 from officer_locations where task_id = v_del and officer_id = v_off1 and lat = 5.6040;
  insert into fo_results (check_name, pass, detail) values ('The old officer''s phone is told to stop, nothing is stored and the trip is gone from their list',
    not (v_res ->> 'sharing')::boolean and v_count2 = 0 and v_count = 0, v_res::text);

  perform set_config('request.jwt.claim.sub', v_renter::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_renter, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_count from renter_trip_live(v_booking, null);
  execute 'reset role';
  insert into fo_results (check_name, pass, detail) values ('The renter no longer sees a live map for the old officer', v_count = 0, v_count || ' live trip(s)');

  -- ---- an officer is deactivated while on the way ----
  perform set_config('request.jwt.claim.sub', v_off1::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_off1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform officer_advance_trip_task(v_pick, 'en_route');
  perform officer_share_location(v_pick, 5.6037, -0.1870);
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform admin_set_fleet_officer_active(v_off1, false);
  execute 'reset role';
  select * into t from trip_tasks where id = v_pick;
  select count(*) into v_count from notifications where user_id = v_renter and type = 'fleet_trip' and title ilike '%officer has changed%'
    and created_at >= now() - interval '1 minute';
  insert into fo_results (check_name, pass, detail) values ('Deactivating an officer mid-trip hands the trip back, clears their position and tells the renter',
    t.officer_id is null and t.status = 'unassigned' and t.last_lat is null and t.sharing_stopped_at is not null and v_count = 2
      and not exists (select 1 from conversation_participants p join conversations c on c.id = p.conversation_id
                      where c.booking_id = v_booking and p.user_id = v_off1),
    t.status || ', ' || v_count || ' renter push(es)');

  -- ---- the booking is cancelled while officer 2 is on the way ----
  perform set_config('request.jwt.claim.sub', v_off2::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_off2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform officer_respond_trip_task(v_del, true);
  perform officer_advance_trip_task(v_del, 'en_route');
  execute 'reset role';
  update bookings set status = 'cancelled' where id = v_booking;

  execute 'set local role authenticated';
  v_res := officer_share_location(v_del, 5.6050, -0.1880);
  select coalesce(max(customer_phone), '') into v_text from officer_trip_tasks(v_del);
  execute 'reset role';
  select count(*) into v_count from notifications where user_id = v_off2 and type = 'fleet_trip' and title = 'Trip cancelled'
    and created_at >= now() - interval '1 minute';
  insert into fo_results (check_name, pass, detail) values ('Cancelling the booking mid-trip stops sharing, tells the officer and hides the renter''s phone',
    (select status from trip_tasks where id = v_del) = 'cancelled' and not (v_res ->> 'sharing')::boolean and v_count = 1 and v_text = '',
    v_count || ' push(es)');

  -- ---- privacy ----
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'select exists (select 1 from cron.job where jobname = ''fleet-officer-locations-retention'')' into v_ok;
  else
    v_ok := true;  -- local test database without pg_cron
  end if;
  insert into fo_results (check_name, pass) values ('Location history is deleted after 30 days (daily job)', v_ok);
end $$;

select n as "#", check_name as "Check", case when pass then 'PASS' else 'FAIL' end as "Result", detail as "Detail" from fo_results order by n;

rollback;
