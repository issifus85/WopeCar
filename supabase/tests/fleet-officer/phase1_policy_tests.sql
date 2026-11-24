-- Fleet Officer Phase 1 - security checks. Run on Wopecar-PREPROD after 0188 (Supabase dashboard > SQL editor, paste all, Run).
-- Self-contained and NOTHING is kept: it picks two ordinary accounts and one booking, makes the two accounts officers, assigns one
-- of them to the booking, runs each check as that person (role authenticated + their user id, exactly like the app), shows a
-- PASS/FAIL table, and then ROLLS BACK every change.
begin;

create temp table fo_results (n serial, check_name text, pass boolean, detail text) on commit drop;
grant all on fo_results to authenticated;
grant usage on sequence fo_results_n_seq to authenticated;

do $$
declare
  v_admin uuid; v_off1 uuid; v_off2 uuid; v_booking uuid; v_renter uuid; v_task uuid;
  v_count int; v_text text; v_ok boolean;
begin
  select id into v_admin from users where role = 'admin' order by created_at limit 1;
  select b.id, b.renter_id into v_booking, v_renter
    from bookings b where b.renter_id is not null and b.car_id is not null and b.status <> 'cancelled'
    order by b.created_at desc limit 1;
  select id into v_off1 from users where role in ('renter', 'vendor') and id <> v_renter
    and not exists (select 1 from officer_profiles o where o.user_id = users.id) order by created_at limit 1;
  select id into v_off2 from users where role in ('renter', 'vendor') and id not in (v_renter, v_off1)
    and not exists (select 1 from officer_profiles o where o.user_id = users.id) order by created_at limit 1;

  if v_admin is null or v_booking is null or v_off1 is null or v_off2 is null then
    raise exception 'Need an admin, a booking and two other accounts on this project to run the checks.';
  end if;

  -- Setup (as the SQL editor's own role, rolled back at the end).
  insert into officer_profiles (user_id, display_name) values (v_off1, 'Test Officer One'), (v_off2, 'Test Officer Two');
  insert into trip_tasks (booking_id, type, officer_id, status) values (v_booking, 'delivery', v_off1, 'assigned')
    on conflict do nothing returning id into v_task;
  if v_task is null then
    update trip_tasks set officer_id = v_off1, status = 'assigned' where booking_id = v_booking and type = 'delivery' returning id into v_task;
  end if;

  -- ---- as officer 1 --------------------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_off1::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_off1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  v_text := app_current_role();
  execute 'reset role'; insert into fo_results (check_name, pass, detail) values ('Officer 1 is seen as fleet_officer', v_text = 'fleet_officer', v_text); execute 'set local role authenticated';

  select count(*), max(renter_phone) is not null or max(renter_name) is not null into v_count, v_ok from officer_bookings where id = v_booking;
  execute 'reset role'; insert into fo_results (check_name, pass, detail) values ('Officer 1 sees the assigned booking with renter contact', v_count = 1 and v_ok, v_count || ' row(s)'); execute 'set local role authenticated';

  select count(*) into v_count from officer_bookings where id <> v_booking;
  execute 'reset role'; insert into fo_results (check_name, pass, detail) values ('Officer 1 sees no other bookings', v_count = 0, v_count || ' row(s)'); execute 'set local role authenticated';

  select count(*) into v_count from bookings where id = v_booking;
  execute 'reset role'; insert into fo_results (check_name, pass, detail) values ('Officer 1 cannot read the bookings table (costs live there)', v_count = 0, v_count || ' row(s)'); execute 'set local role authenticated';

  update trip_tasks set status = 'completed' where id = v_task;
  get diagnostics v_count = row_count;
  execute 'reset role'; insert into fo_results (check_name, pass, detail) values ('Officer 1 cannot change a task directly', v_count = 0, v_count || ' row(s) changed'); execute 'set local role authenticated';

  update officer_profiles set display_name = 'hacked' where user_id = v_off1;
  get diagnostics v_count = row_count;
  execute 'reset role'; insert into fo_results (check_name, pass, detail) values ('Officer 1 cannot edit their own officer profile', v_count = 0, v_count || ' row(s) changed'); execute 'set local role authenticated';

  begin
    perform admin_list_fleet_officers();
    v_ok := false;
  exception when others then v_ok := true;
  end;
  execute 'reset role'; insert into fo_results (check_name, pass, detail) values ('Officer 1 cannot use admin officer tools', v_ok, null); execute 'set local role authenticated';

  begin
    insert into trip_events (trip_task_id, event) values (v_task, 'forged');
    v_ok := false;
  exception when others then v_ok := true;
  end;
  execute 'reset role'; insert into fo_results (check_name, pass, detail) values ('Officer 1 cannot write trip events directly', v_ok, null);

  -- ---- as officer 2 (not assigned) -----------------------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_off2::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_off2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select (select count(*) from officer_bookings) + (select count(*) from trip_tasks) + (select count(*) from trip_events) into v_count;
  execute 'reset role'; insert into fo_results (check_name, pass, detail) values ('Unassigned officer 2 sees no bookings, tasks or events', v_count = 0, v_count || ' row(s)');

  -- ---- as the renter of the booking ----------------------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_renter::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_renter, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select (select count(*) from officer_bookings) + (select count(*) from trip_tasks) + (select count(*) from officer_profiles where user_id <> v_renter) into v_count;
  v_text := app_current_role();
  execute 'reset role'; insert into fo_results (check_name, pass, detail) values ('Renter sees no officer data yet (Phase 2 adds the officer name in chat)', v_count = 0, v_count || ' row(s)');
  insert into fo_results (check_name, pass, detail) values ('Renter keeps their role', v_text in ('renter', 'vendor'), v_text);

  -- ---- completed task hides renter contact ---------------------------------------------------------------------------------
  update trip_tasks set status = 'completed' where id = v_task;
  perform set_config('request.jwt.claim.sub', v_off1::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_off1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) filter (where renter_phone is null and renter_name is null and renter_email is null) into v_count from officer_bookings where id = v_booking;
  execute 'reset role'; insert into fo_results (check_name, pass, detail) values ('Renter contact hidden once the task is completed', v_count = 1, null);
  update trip_tasks set status = 'assigned' where id = v_task;

  -- ---- as admin --------------------------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_count from admin_list_fleet_officers() where user_id in (v_off1, v_off2);
  execute 'reset role'; insert into fo_results (check_name, pass, detail) values ('Admin lists officers', v_count = 2, v_count || ' row(s)'); execute 'set local role authenticated';

  perform admin_set_fleet_officer_active(v_off2, false);
  begin
    update trip_tasks set officer_id = v_off2 where id = v_task;
    v_ok := false;
  exception when others then v_ok := true;
  end;
  execute 'reset role'; insert into fo_results (check_name, pass, detail) values ('Deactivated officer cannot be assigned', v_ok, null); execute 'set local role authenticated';

  begin
    update trip_tasks set officer_id = v_renter where id = v_task;
    v_ok := false;
  exception when others then v_ok := true;
  end;
  execute 'reset role'; insert into fo_results (check_name, pass, detail) values ('A non-officer cannot be assigned', v_ok, null); execute 'set local role authenticated';

  perform admin_set_fleet_officer_active(v_off1, false);
  execute 'reset role';
  select officer_id is null and status = 'unassigned' into v_ok from trip_tasks where id = v_task;
  insert into fo_results (check_name, pass, detail) values ('Deactivating an officer returns their not-started trips to unassigned', v_ok, null);

  perform set_config('request.jwt.claim.sub', v_off1::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_off1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_ok := not is_fleet_officer();
  select count(*) into v_count from officer_bookings;
  execute 'reset role'; insert into fo_results (check_name, pass, detail) values ('Deactivated officer loses officer access', v_ok and v_count = 0, null);

  select count(*) into v_count from trip_events where trip_task_id = v_task;
  insert into fo_results (check_name, pass, detail) values ('Assignments and status changes were logged in trip_events', v_count >= 3, v_count || ' event(s)');
end $$;

select n as "#", check_name as "Check", case when pass then 'PASS' else 'FAIL' end as "Result", detail as "Detail" from fo_results order by n;

rollback;
