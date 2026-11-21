-- Fleet Officer Phase 3 - officer access to the existing inspection and rental agreement. Run on Wopecar-PREPROD after 0181
-- (SQL editor, paste all, Run). Self-contained and NOTHING is kept: it picks an admin, three ordinary accounts and one confirmed booking
-- that has no inspection or agreement yet, runs every check as the right person (role authenticated + their user id, like the app), shows
-- a PASS/FAIL table and ROLLS BACK every change.
begin;

create temp table fo_results (n serial, check_name text, pass boolean, detail text) on commit drop;
grant all on fo_results to authenticated;
grant all on sequence fo_results_n_seq to authenticated;

do $$
declare
  v_admin uuid; v_off1 uuid; v_off2 uuid; v_off3 uuid; v_booking uuid; v_renter uuid;
  v_del uuid; v_pick uuid; v_pre uuid; v_post uuid; v_agreement uuid;
  v_count int; v_ok boolean; v_text text; v_row rental_agreements; v_vendor_user uuid;
begin
  select id into v_admin from users where role = 'admin' order by created_at limit 1;
  select b.id, b.renter_id into v_booking, v_renter
    from bookings b join conversations c on c.booking_id = b.id
    where b.status = 'confirmed' and b.renter_id is not null
      and not exists (select 1 from vehicle_inspections vi where vi.booking_id = b.id)
      and not exists (select 1 from rental_agreements ra where ra.booking_id = b.id)
    order by b.start_date desc limit 1;
  -- The test officers must be ordinary accounts with no other link to this booking: not its renter and not the car's owner (a vendor can
  -- already write their own car's inspections, which would hide what the officer rules allow).
  select v.user_id into v_vendor_user from bookings b join vendors v on v.id = b.vendor_id where b.id = v_booking;
  select id into v_off1 from users where role in ('renter', 'vendor') and id <> v_renter and id is distinct from v_vendor_user
    and not exists (select 1 from officer_profiles o where o.user_id = users.id) order by created_at limit 1;
  select id into v_off2 from users where role in ('renter', 'vendor') and id not in (v_renter, v_off1) and id is distinct from v_vendor_user
    and not exists (select 1 from officer_profiles o where o.user_id = users.id) order by created_at limit 1;
  select id into v_off3 from users where role in ('renter', 'vendor') and id not in (v_renter, v_off1, v_off2) and id is distinct from v_vendor_user
    and not exists (select 1 from officer_profiles o where o.user_id = users.id) order by created_at limit 1;
  if v_admin is null or v_booking is null or v_off1 is null or v_off2 is null or v_off3 is null then
    raise exception 'Need an admin, a confirmed booking (with a chat) that has no inspection or agreement yet, and three other accounts.';
  end if;

  insert into officer_profiles (user_id, display_name) values
    (v_off1, 'Test Officer One'), (v_off2, 'Test Officer Two'), (v_off3, 'Test Officer Three');
  perform fo_sync_booking_tasks(v_booking);
  select id into v_del from trip_tasks where booking_id = v_booking and type = 'delivery';
  select id into v_pick from trip_tasks where booking_id = v_booking and type = 'pickup';
  update trip_tasks set officer_id = v_off1, status = 'accepted' where id = v_del;
  update trip_tasks set officer_id = v_off2, status = 'accepted' where id = v_pick;

  -- ---- officer 1 (delivery) ----
  perform set_config('request.jwt.claim.sub', v_off1::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_off1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into vehicle_inspections (booking_id, type, mileage, fuel_level) values (v_booking, 'pre', 12345, 'Full') returning id into v_pre;
  insert into fo_results (check_name, pass) values ('Delivery officer can start the pre-rental inspection', v_pre is not null);
  select initiated_by_role into v_text from vehicle_inspections where id = v_pre;
  insert into fo_results (check_name, pass, detail) values ('It is recorded as started by the fleet officer', v_text = 'fleet_officer', v_text);

  begin
    insert into vehicle_inspections (booking_id, type) values (v_booking, 'post'); v_ok := false;
  exception when others then v_ok := true; end;
  insert into fo_results (check_name, pass) values ('Delivery officer cannot start the post-rental inspection (not their trip)', v_ok);

  insert into vehicle_inspection_photos (inspection_id, angle, file_path) values (v_pre, 'front', v_off1 || '/inspections/' || v_pre || '/front.jpg');
  insert into vehicle_inspection_damage_points (inspection_id, view, x_pct, y_pct, damage_type) values (v_pre, 'front', 10, 20, 'scratch');
  select count(*) into v_count from vehicle_inspection_photos where inspection_id = v_pre;
  insert into fo_results (check_name, pass) values ('Officer can add photos and damage marks', v_count = 1);

  select * into v_row from officer_start_rental_agreement(v_booking);
  v_agreement := v_row.id;
  insert into fo_results (check_name, pass, detail) values ('Officer can start the rental agreement, prefilled from the booking',
    v_agreement is not null and v_row.duration_start is not null and v_row.initiated_by_role = 'fleet_officer',
    'daily rate ' || coalesce(v_row.daily_rate::text, '-') || ', deposit ' || coalesce(v_row.security_deposit::text, '-'));

  execute 'reset role';
  select status into v_text from trip_tasks where id = v_del;
  insert into fo_results (check_name, pass, detail) values ('Starting the paperwork moves the trip to Inspecting', v_text = 'inspecting', v_text);

  -- ---- officer 3 (not on this booking) ----
  perform set_config('request.jwt.claim.sub', v_off3::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_off3, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_count from vehicle_inspections where booking_id = v_booking;
  select v_count + count(*) into v_count from rental_agreements where booking_id = v_booking;
  begin
    perform officer_start_rental_agreement(v_booking); v_ok := false;
  exception when others then v_ok := true; end;
  begin
    insert into vehicle_inspections (booking_id, type) values (v_booking, 'post'); v_ok := v_ok and false;
  exception when others then null; end;
  execute 'reset role';
  insert into fo_results (check_name, pass, detail) values ('An officer not on the booking cannot see, open or start its inspection or agreement',
    v_count = 0 and v_ok, v_count || ' record(s) visible');

  -- ---- officer 1 submits ----
  perform set_config('request.jwt.claim.sub', v_off1::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_off1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update vehicle_inspections set renter_signature_path = 'x', agent_signature_path = 'y', status = 'submitted', submitted_at = now() where id = v_pre;
  execute 'reset role';
  select status into v_text from trip_tasks where id = v_del;
  insert into fo_results (check_name, pass, detail) values ('Trip stays open until the agreement is also submitted', v_text = 'inspecting', v_text);
  execute 'set local role authenticated';
  begin
    update vehicle_inspections set mileage = 2 where id = v_pre; v_ok := false;
  exception when others then v_ok := true; end;
  execute 'reset role';
  insert into fo_results (check_name, pass) values ('Submitted inspection is locked even while the officer''s trip is still open', v_ok);
  execute 'set local role authenticated';
  update rental_agreements set client_signature_path = 'x', representative_signature_path = 'y', status = 'submitted', submitted_at = now() where id = v_agreement;
  execute 'reset role';
  select status into v_text from trip_tasks where id = v_del;
  insert into fo_results (check_name, pass, detail) values ('Delivery trip is Completed once inspection and agreement are submitted', v_text = 'completed', v_text);

  execute 'set local role authenticated';
  -- Denied either way: refused by the row-level rules (0 rows changed) or by the submitted-record lock (error).
  begin
    update vehicle_inspections set mileage = 1 where id = v_pre;
  exception when others then null; end;
  begin
    update rental_agreements set lessee_name = 'Changed' where id = v_agreement;
  exception when others then null; end;
  begin
    delete from vehicle_inspection_damage_points where inspection_id = v_pre;
  exception when others then null; end;
  select count(*) into v_count from vehicle_inspections where id = v_pre;
  execute 'reset role';
  select (select mileage from vehicle_inspections where id = v_pre) = 12345
     and (select lessee_name from rental_agreements where id = v_agreement) is distinct from 'Changed'
     and (select count(*) from vehicle_inspection_damage_points where inspection_id = v_pre) = 1
    into v_ok;
  insert into fo_results (check_name, pass) values ('Officer cannot change the submitted inspection or agreement', v_ok);
  insert into fo_results (check_name, pass) values ('Officer can still open the completed copy', v_count = 1);

  -- ---- admin ----
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('app.edit_reason', 'Phase 3 test edit', true);
  execute 'set local role authenticated';
  update vehicle_inspections set mileage = 12346 where id = v_pre;
  select count(*) into v_count from record_edits where record_id = v_pre and reason = 'Phase 3 test edit'
    and (before ->> 'mileage') = '12345' and (after ->> 'mileage') = '12346';
  insert into fo_results (check_name, pass, detail) values ('Admin can edit a submitted inspection and the edit is logged (before, after, reason)', v_count = 1, v_count || ' log row(s)');
  perform set_config('app.edit_reason', '', true);

  insert into vehicle_inspections (booking_id, type) values (v_booking, 'post') returning id into v_post;
  select initiated_by_role into v_text from vehicle_inspections where id = v_post;
  execute 'reset role';
  insert into fo_results (check_name, pass, detail) values ('An inspection started by admin is recorded as admin, as before', v_text = 'admin', v_text);
  select status into v_text from trip_tasks where id = v_pick;
  insert into fo_results (check_name, pass, detail) values ('Admin starting an inspection does not move the officer''s trip', v_text = 'accepted', v_text);
end $$;

select n as "#", check_name as "Check", case when pass then 'PASS' else 'FAIL' end as "Result", detail as "Detail" from fo_results order by n;

rollback;
