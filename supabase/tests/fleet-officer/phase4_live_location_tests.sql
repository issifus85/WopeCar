-- Fleet Officer Phase 4 - live location and ETA checks. Run on Wopecar-PREPROD after 0182 (SQL editor, paste all, Run).
-- Self-contained and NOTHING is kept: it picks an admin, three ordinary accounts and one confirmed booking, runs every check as the right
-- person (role authenticated + their user id, like the app), shows a PASS/FAIL table and ROLLS BACK every change.
begin;

create temp table fo_results (n serial, check_name text, pass boolean, detail text) on commit drop;
grant all on fo_results to authenticated;
grant all on sequence fo_results_n_seq to authenticated;

do $$
declare
  v_admin uuid; v_off1 uuid; v_off2 uuid; v_other uuid; v_booking uuid; v_renter uuid; v_vendor_user uuid; v_conv uuid;
  v_del uuid; v_res jsonb; v_count int; v_ok boolean; v_text text; v_name text;
begin
  select id into v_admin from users where role = 'admin' order by created_at limit 1;
  select b.id, b.renter_id into v_booking, v_renter
    from bookings b join conversations c on c.booking_id = b.id
    where b.status = 'confirmed' and b.renter_id is not null order by b.start_date desc limit 1;
  select v.user_id into v_vendor_user from bookings b join vendors v on v.id = b.vendor_id where b.id = v_booking;
  select id into v_off1 from users where role in ('renter', 'vendor') and id <> v_renter and id is distinct from v_vendor_user
    and not exists (select 1 from officer_profiles o where o.user_id = users.id) order by created_at limit 1;
  select id into v_off2 from users where role in ('renter', 'vendor') and id not in (v_renter, v_off1) and id is distinct from v_vendor_user
    and not exists (select 1 from officer_profiles o where o.user_id = users.id) order by created_at limit 1;
  select id into v_other from users where role in ('renter', 'vendor') and id not in (v_renter, v_off1, v_off2) and id is distinct from v_vendor_user
    and not exists (select 1 from officer_profiles o where o.user_id = users.id) order by created_at limit 1;
  if v_admin is null or v_booking is null or v_off1 is null or v_off2 is null or v_other is null then
    raise exception 'Need an admin, a confirmed booking with a chat, and three other accounts to run the checks.';
  end if;
  select id into v_conv from conversations where booking_id = v_booking;

  insert into officer_profiles (user_id, display_name) values (v_off1, 'Test Officer One'), (v_off2, 'Test Officer Two');
  perform fo_sync_booking_tasks(v_booking);
  select id into v_del from trip_tasks where booking_id = v_booking and type = 'delivery';
  update trip_tasks set officer_id = v_off1, status = 'accepted', last_location_at = null, eta_updated_at = null, sharing_stopped_at = null
    where id = v_del;
  -- Another trip of the same booking must not interfere.
  update trip_tasks set status = 'unassigned', officer_id = null where booking_id = v_booking and id <> v_del;

  -- ---- officer 1 ----
  perform set_config('request.jwt.claim.sub', v_off1::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_off1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  v_res := officer_share_location(v_del, 5.6037, -0.1870);
  insert into fo_results (check_name, pass, detail) values ('No location is shared before the trip is started', (v_res ->> 'sharing')::boolean = false, v_res::text);

  perform officer_advance_trip_task(v_del, 'en_route');
  v_res := officer_share_location(v_del, 5.6037, -0.1870, 90, 8.5, 12);
  insert into fo_results (check_name, pass, detail) values ('After Start trip the location is shared and an ETA is requested',
    (v_res ->> 'sharing')::boolean and (v_res ->> 'eta_due')::boolean, v_res::text);
  perform officer_share_location(v_del, 5.6040, -0.1871);
  select count(*) into v_count from officer_locations where task_id = v_del;
  insert into fo_results (check_name, pass, detail) values ('Fixes closer than 4 seconds apart are not stored twice', v_count = 1, v_count || ' fix(es)');

  -- ---- officer 2 cannot send fixes for officer 1's trip ----
  perform set_config('request.jwt.claim.sub', v_off2::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_off2, 'role', 'authenticated')::text, true);
  begin
    perform officer_share_location(v_del, 1, 1); v_ok := false;
  exception when others then v_ok := true; end;
  select count(*) into v_count from officer_locations where task_id = v_del;
  insert into fo_results (check_name, pass, detail) values ('Another officer cannot send or read locations for this trip', v_ok and v_count = 0, v_count || ' visible');

  -- ---- the renter ----
  perform set_config('request.jwt.claim.sub', v_renter::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_renter, 'role', 'authenticated')::text, true);
  select count(*), max(officer_name), bool_and(sharing and officer_lat is not null) into v_count, v_name, v_ok from renter_trip_live(v_booking);
  insert into fo_results (check_name, pass, detail) values ('Renter sees the live trip with the officer''s name and position', v_count = 1 and v_ok and v_name = 'Test Officer One', v_name);
  select count(*) into v_count from renter_trip_live(null, v_conv);
  insert into fo_results (check_name, pass) values ('The chat card finds the same live trip from the booking chat', v_count = 1);
  select count(*) into v_count from officer_locations where task_id = v_del;
  insert into fo_results (check_name, pass, detail) values ('Renter can read the officer''s location fixes (what Realtime streams)', v_count = 1, v_count || ' fix(es)');

  begin
    perform fo_save_trip_eta(v_del, 60, 500, 'google', null, null, null); v_ok := false;
  exception when others then v_ok := true; end;
  insert into fo_results (check_name, pass) values ('Only the server can write the ETA', v_ok);

  -- ---- someone else ----
  perform set_config('request.jwt.claim.sub', v_other::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  select count(*) into v_count from renter_trip_live(v_booking);
  select v_count + count(*) into v_count from officer_locations where task_id = v_del;
  insert into fo_results (check_name, pass, detail) values ('Nobody else can see the trip or its locations', v_count = 0, v_count || ' visible');

  -- ---- officer 1 stops sharing, then arrives ----
  perform set_config('request.jwt.claim.sub', v_off1::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_off1, 'role', 'authenticated')::text, true);
  perform officer_set_location_sharing(v_del, false);
  v_res := officer_share_location(v_del, 5.6050, -0.1880);
  insert into fo_results (check_name, pass) values ('Stop sharing stops new fixes', (v_res ->> 'sharing')::boolean = false);
  perform officer_set_location_sharing(v_del, true);
  perform officer_advance_trip_task(v_del, 'arrived');
  v_res := officer_share_location(v_del, 5.6050, -0.1880);
  insert into fo_results (check_name, pass) values ('Arriving ends location sharing automatically', (v_res ->> 'sharing')::boolean = false);

  execute 'reset role';
  select count(*) into v_count from notifications where user_id = v_renter and type = 'fleet_trip' and title = 'Your WopeCar officer has arrived';
  select prosrc like '%/live-trip/%' into v_ok from pg_proc where proname = 'officer_advance_trip_task';
  insert into fo_results (check_name, pass, detail) values ('The renter is notified on arrival, and the push opens the live map', v_count >= 1 and v_ok, v_count || ' notification(s)');

  -- ---- after the trip is completed the renter no longer sees the position ----
  update trip_tasks set status = 'completed', completed_at = now() where id = v_del;
  perform set_config('request.jwt.claim.sub', v_renter::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_renter, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_count from renter_trip_live(v_booking);
  select v_count + count(*) into v_count from officer_locations where task_id = v_del;
  execute 'reset role';
  insert into fo_results (check_name, pass, detail) values ('Once the trip is completed the renter no longer sees the location', v_count = 0, v_count || ' visible');
end $$;

select n as "#", check_name as "Check", case when pass then 'PASS' else 'FAIL' end as "Result", detail as "Detail" from fo_results order by n;

rollback;
