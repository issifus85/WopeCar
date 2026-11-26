-- Fleet Officer Phase 5 - admin dispatch board checks. Run on Wopecar-PREPROD after 0192 (SQL editor, paste all, Run).
-- Self-contained and NOTHING is kept: it picks an admin, two ordinary accounts and one confirmed booking whose renter is an ordinary
-- account, runs every check as the right person (role authenticated + their user id, like the app), shows a PASS/FAIL table and
-- ROLLS BACK every change.
begin;

create temp table fo_results (n serial, check_name text, pass boolean, detail text) on commit drop;
grant all on fo_results to authenticated;
grant all on sequence fo_results_n_seq to authenticated;

do $$
declare
  v_admin uuid; v_off1 uuid; v_off2 uuid; v_booking uuid; v_renter uuid; v_vendor_user uuid;
  v_del uuid; v_pick uuid; v_insp uuid; v_count int; v_ok boolean; v_text text; v_res jsonb;
  v_from timestamptz := date_trunc('day', now()) - interval '1 day';
  v_to timestamptz := date_trunc('day', now()) + interval '2 days';
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
  -- Delivery: on the way right now. Return pickup: 30 minutes overdue and nobody assigned.
  update trip_tasks set officer_id = v_off1, status = 'en_route', scheduled_at = now(), started_at = now(),
         last_lat = 5.6037, last_lng = -0.1870, last_location_at = now(), sharing_stopped_at = null
   where id = v_del;
  update trip_tasks set officer_id = null, status = 'unassigned', scheduled_at = now() - interval '30 minutes' where id = v_pick;
  update officer_profiles set is_active = false, deactivated_at = now() where user_id = v_off2;

  -- ---- admin ----
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_count from admin_dispatch_board(v_from, v_to) where booking_id = v_booking;
  insert into fo_results (check_name, pass, detail) values ('Admin sees both of the booking''s trips on the board', v_count = 2, v_count || ' trip(s)');

  select status = 'en_route' and officer_name = 'Test Officer One' and sharing and last_lat is not null and renter_name is not null
    into v_ok from admin_dispatch_board(v_from, v_to) where id = v_del;
  insert into fo_results (check_name, pass) values ('The live trip shows its officer, renter, status and live position', coalesce(v_ok, false));

  select is_late into v_ok from admin_dispatch_board(v_from, v_to) where id = v_pick;
  insert into fo_results (check_name, pass) values ('A trip 15+ minutes past its time with no officer is flagged late', coalesce(v_ok, false));

  select count(*) into v_count from admin_dispatch_board(now() + interval '30 days', now() + interval '31 days') where id = v_del;
  insert into fo_results (check_name, pass) values ('A trip happening now shows even when another day is picked', v_count = 1);

  select availability into v_text from admin_officer_availability() where user_id = v_off1;
  insert into fo_results (check_name, pass, detail) values ('Officer on the way shows as On a trip', v_text = 'on_trip', v_text);
  select availability into v_text from admin_officer_availability() where user_id = v_off2;
  insert into fo_results (check_name, pass, detail) values ('Deactivated officer shows as Off', v_text = 'off', v_text);

  -- Assigning from the board uses the same Phase 2 call: officer goes into the chat and gets the push.
  perform admin_assign_trip_task(v_pick, v_off1);
  execute 'reset role';
  select count(*) into v_count from notifications where user_id = v_off1 and type = 'fleet_trip' and created_at >= now() - interval '1 minute';
  select v_count > 0 and exists (select 1 from conversation_participants p join conversations c on c.id = p.conversation_id
                                 where c.booking_id = v_booking and p.user_id = v_off1)
    into v_ok;
  insert into fo_results (check_name, pass, detail) values ('Assigning from the board adds the officer to the chat and sends the push', v_ok, v_count || ' notification(s)');

  -- ---- editing a submitted inspection ----
  insert into vehicle_inspections (booking_id, type, mileage, fuel_level, status, submitted_at) values (v_booking, 'pre', 1000, 'Full', 'submitted', now())
    on conflict (booking_id, type) do update set status = 'submitted', submitted_at = now()
    returning id into v_insp;
  update vehicle_inspections set mileage = 1000 where id = v_insp;

  execute 'set local role authenticated';
  v_res := admin_edit_handover_record('vehicle_inspections', v_insp, '{"mileage": 1010}', 'Typo in the mileage');
  execute 'reset role';
  select count(*) into v_count from record_edits where record_id = v_insp and reason = 'Typo in the mileage'
    and (after ->> 'mileage') = '1010' and edited_by = v_admin;
  insert into fo_results (check_name, pass, detail) values ('Admin can edit a submitted inspection and the edit is logged with the reason', v_count = 1 and (v_res ->> 'mileage') = '1010', v_count || ' log row(s)');

  execute 'set local role authenticated';
  begin
    perform admin_edit_handover_record('vehicle_inspections', v_insp, '{"mileage": 1020}', ''); v_ok := false;
  exception when others then v_ok := true; end;
  begin
    perform admin_edit_handover_record('vehicle_inspections', v_insp, '{"status": "draft"}', 'Reopen it'); v_ok := v_ok and false;
  exception when others then null; end;
  execute 'reset role';
  insert into fo_results (check_name, pass) values ('An edit needs a reason, and only the listed fields can change', v_ok and (select status from vehicle_inspections where id = v_insp) = 'submitted');

  -- ---- not an admin ----
  perform set_config('request.jwt.claim.sub', v_off1::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_off1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_ok := true;
  begin perform admin_dispatch_board(v_from, v_to); v_ok := false; exception when others then null; end;
  begin perform admin_officer_availability(); v_ok := false; exception when others then null; end;
  begin perform admin_edit_handover_record('vehicle_inspections', v_insp, '{"mileage": 1}', 'Not allowed'); v_ok := false; exception when others then null; end;
  execute 'reset role';
  insert into fo_results (check_name, pass) values ('An officer cannot load the board, the officer list or edit records', v_ok);

  perform set_config('request.jwt.claim.sub', v_renter::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_renter, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_ok := true;
  begin perform admin_dispatch_board(v_from, v_to); v_ok := false; exception when others then null; end;
  select v_ok and count(*) = 0 into v_ok from trip_tasks where booking_id = v_booking;
  execute 'reset role';
  insert into fo_results (check_name, pass) values ('A renter cannot load the board or read trips', v_ok);

  select exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'trip_tasks')
      or not exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    into v_ok;
  insert into fo_results (check_name, pass) values ('Trip changes are streamed live to the board', v_ok);
end $$;

select n as "#", check_name as "Check", case when pass then 'PASS' else 'FAIL' end as "Result", detail as "Detail" from fo_results order by n;

rollback;
