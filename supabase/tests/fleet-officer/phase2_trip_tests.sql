-- Fleet Officer Phase 2 - trip tasks, assignment, chat access and status flow checks. Run on Wopecar-PREPROD after 0189
-- (SQL editor, paste all, Run). Self-contained and NOTHING is kept: it picks an admin, two ordinary accounts and one confirmed
-- booking, runs every check as the right person (role authenticated + their user id, like the app), shows a PASS/FAIL table and
-- ROLLS BACK every change (tasks, chat messages, notifications and queued pushes included).
begin;

create temp table fo_results (n serial, check_name text, pass boolean, detail text) on commit drop;

do $$
declare
  v_admin uuid; v_off1 uuid; v_off2 uuid; v_booking uuid; v_renter uuid; v_conv uuid;
  v_del uuid; v_pick uuid; v_count int; v_text text; v_ok boolean; v_msg uuid;
begin
  select id into v_admin from users where role = 'admin' order by created_at limit 1;
  select b.id, b.renter_id into v_booking, v_renter
    from bookings b join conversations c on c.booking_id = b.id
    where b.status = 'confirmed' and b.renter_id is not null order by b.start_date desc limit 1;
  select id into v_off1 from users where role in ('renter', 'vendor') and id <> v_renter
    and not exists (select 1 from officer_profiles o where o.user_id = users.id) order by created_at limit 1;
  select id into v_off2 from users where role in ('renter', 'vendor') and id not in (v_renter, v_off1)
    and not exists (select 1 from officer_profiles o where o.user_id = users.id) order by created_at limit 1;
  if v_admin is null or v_booking is null or v_off1 is null or v_off2 is null then
    raise exception 'Need an admin, a confirmed booking with a chat, and two other accounts to run the checks.';
  end if;
  select id into v_conv from conversations where booking_id = v_booking;

  insert into officer_profiles (user_id, display_name) values (v_off1, 'Test Officer One'), (v_off2, 'Test Officer Two');

  -- 1. tasks are created for a confirmed booking
  perform fo_sync_booking_tasks(v_booking);
  select id into v_del from trip_tasks where booking_id = v_booking and type = 'delivery';
  select id into v_pick from trip_tasks where booking_id = v_booking and type = 'pickup';
  update trip_tasks set officer_id = null, status = 'unassigned' where id in (v_del, v_pick);
  insert into fo_results (check_name, pass) values ('A confirmed booking has a delivery and a collection task', v_del is not null and v_pick is not null);

  -- 2. admin assigns officer 1 to both
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform admin_assign_trip_task(v_del, v_off1);
  perform admin_assign_trip_task(v_pick, v_off1);
  execute 'reset role';
  select count(*) into v_count from conversation_participants where conversation_id = v_conv and user_id = v_off1 and role_in_conversation = 'invited';
  insert into fo_results (check_name, pass, detail) values ('Assigning adds the officer to the booking chat', v_count = 1, null);
  select count(*) into v_count from notifications where user_id = v_off1 and type = 'fleet_trip' and title = 'New trip assigned';
  insert into fo_results (check_name, pass, detail) values ('Officer gets a "New trip assigned" notification', v_count >= 1, v_count || ' notification(s)');

  -- 3. officer 1 sees the task with renter contact; can read the chat
  perform set_config('request.jwt.claim.sub', v_off1::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_off1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*), bool_and(customer_name is not null and conversation_id = v_conv) into v_count, v_ok from officer_trip_tasks() where booking_id = v_booking;
  execute 'reset role'; insert into fo_results (check_name, pass, detail) values ('Officer 1 sees both tasks with renter contact and the chat', v_count = 2 and v_ok, v_count || ' task(s)'); execute 'set local role authenticated';

  begin
    perform officer_advance_trip_task(v_del, 'en_route'); v_ok := false;
  exception when others then v_ok := true; end;
  execute 'reset role'; insert into fo_results (check_name, pass) values ('Cannot start a trip before accepting it', v_ok); execute 'set local role authenticated';

  perform officer_respond_trip_task(v_del, true);
  perform officer_advance_trip_task(v_del, 'en_route');
  begin
    perform officer_advance_trip_task(v_del, 'accepted'); v_ok := false;
  exception when others then v_ok := true; end;
  execute 'reset role'; insert into fo_results (check_name, pass) values ('Status cannot move backwards', v_ok); execute 'set local role authenticated';

  begin
    perform officer_advance_trip_task(v_del, 'completed'); v_ok := false;
  exception when others then v_ok := true; end;
  execute 'reset role'; insert into fo_results (check_name, pass) values ('Status cannot skip steps (en route -> completed)', v_ok); execute 'set local role authenticated';

  v_msg := officer_quick_reply(v_del, 'on_my_way');
  perform officer_advance_trip_task(v_del, 'arrived');
  execute 'reset role';
  select count(*) into v_count from notifications where user_id = v_renter and type = 'fleet_trip' and title in ('Your WopeCar officer is on the way', 'Your WopeCar officer has arrived');
  insert into fo_results (check_name, pass, detail) values ('Renter is notified when the officer starts and arrives', v_count = 2, v_count || ' notification(s)');
  select count(*) into v_count from trip_events where trip_task_id = v_del and event in ('status_changed', 'quick_reply');
  insert into fo_results (check_name, pass, detail) values ('Status changes and the quick reply are in trip_events', v_count >= 4, v_count || ' event(s)');

  -- 4. renter sees the officer's name in chat and in renter_trip_officers
  perform set_config('request.jwt.claim.sub', v_renter::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_renter, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select sender_name into v_text from list_conversation_messages(v_conv) where id = v_msg;
  select count(*) into v_count from renter_trip_officers(v_booking);
  execute 'reset role';
  insert into fo_results (check_name, pass, detail) values ('Renter sees the quick reply labelled as the fleet officer', v_text = 'Test Officer One · Fleet officer', v_text);
  insert into fo_results (check_name, pass, detail) values ('Renter sees who is coming (name only)', v_count = 2, v_count || ' row(s)');

  -- 5. officer 2 (not added) cannot read the chat or the tasks
  perform set_config('request.jwt.claim.sub', v_off2::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_off2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform * from list_conversation_messages(v_conv); v_ok := false;
  exception when others then v_ok := true; end;
  select count(*) into v_count from officer_trip_tasks();
  execute 'reset role';
  insert into fo_results (check_name, pass) values ('An officer not added to a chat cannot read it, even with its id', v_ok);
  insert into fo_results (check_name, pass, detail) values ('Officer 2 sees no tasks', v_count = 0, v_count || ' task(s)');

  -- 6. finish delivery, then reassign the collection to officer 2: officer 1 leaves the chat immediately
  perform set_config('request.jwt.claim.sub', v_off1::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_off1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform officer_advance_trip_task(v_del, 'completed');
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform admin_assign_trip_task(v_pick, v_off2);
  execute 'reset role';
  select count(*) into v_count from conversation_participants where conversation_id = v_conv and user_id = v_off1;
  insert into fo_results (check_name, pass) values ('Reassigning removes the previous officer from the chat', v_count = 0);
  select count(*) into v_count from conversation_participants where conversation_id = v_conv and user_id = v_off2;
  insert into fo_results (check_name, pass) values ('Reassigning adds the new officer to the chat', v_count = 1);

  perform set_config('request.jwt.claim.sub', v_off1::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_off1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform * from list_conversation_messages(v_conv); v_ok := false;
  exception when others then v_ok := true; end;
  select count(*) into v_count from officer_trip_tasks() where id = v_pick;
  execute 'reset role';
  insert into fo_results (check_name, pass) values ('Previous officer loses the chat and the task', v_ok and v_count = 0);

  -- 7. officer 2 declines: task goes back to unassigned and admins are told
  perform set_config('request.jwt.claim.sub', v_off2::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_off2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform officer_respond_trip_task(v_pick, false);
  execute 'reset role';
  select status = 'unassigned' and officer_id is null into v_ok from trip_tasks where id = v_pick;
  select count(*) into v_count from notifications where user_id = v_admin and title = 'Officer declined a trip';
  insert into fo_results (check_name, pass, detail) values ('Declining unassigns the trip and notifies admins', v_ok and v_count >= 1, v_count || ' admin notification(s)');

  -- 8. a renter / non-admin cannot assign
  perform set_config('request.jwt.claim.sub', v_renter::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_renter, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform admin_assign_trip_task(v_pick, v_off1); v_ok := false;
  exception when others then v_ok := true; end;
  execute 'reset role';
  insert into fo_results (check_name, pass) values ('Only admins can assign officers', v_ok);

  -- 9. late trip: admins are told once
  update trip_tasks set scheduled_at = now() - interval '20 minutes', late_notified_at = null where id = v_pick;
  perform fo_flag_late_trip_tasks();
  perform fo_flag_late_trip_tasks();
  select count(*) into v_count from notifications where user_id = v_admin and title = 'Trip has no officer' and booking_id = v_booking;
  insert into fo_results (check_name, pass, detail) values ('A trip 15 minutes late notifies admins once', v_count = 1, v_count || ' notification(s)');
end $$;

select n as "#", check_name as "Check", case when pass then 'PASS' else 'FAIL' end as "Result", detail as "Detail" from fo_results order by n;

rollback;
