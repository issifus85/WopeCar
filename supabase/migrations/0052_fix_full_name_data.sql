-- Data fix, not a schema change. Two accounts had full_name out of sync
-- with reality:
--
-- 1. sue@wopecar.com had full_name/raw_user_meta_data.full_name of
--    "Angela Moore" since the moment the row was created - not something
--    the account holder (Sheena Biney) ever typed. Whatever created this
--    row (very likely a bulk test-account seeding pass alongside the many
--    similarly-timestamped fake vendor/renter test accounts from the same
--    window) picked up a mismatched name. Corrected here; first_name/
--    last_name were also populated since they were NULL (never touched
--    the app's Edit Profile screen).
--
-- 2. pharmseidu_2011@hotmail.co.uk (a real Edit Profile screen edit made
--    today) is the first account actually hit by the bug fixed in
--    app/account.js: the Edit Profile form's dirtyPayload only ever wrote
--    first_name/last_name/nickname, never full_name, so the Account
--    screen's displayed name (sourced from full_name, see
--    services/supabaseAuthApi.js normalizeUser()) went stale the moment
--    someone used the form. Backfilled to match its already-correct
--    first_name/last_name.
update auth.users
set raw_user_meta_data = jsonb_set(raw_user_meta_data, '{full_name}', '"Sheena Biney"')
where email = 'sue@wopecar.com';

update public.users
set full_name = 'Sheena Biney', first_name = 'Sheena', last_name = 'Biney', updated_at = now()
where email = 'sue@wopecar.com';

update public.users
set full_name = 'Aljumah Seidu', updated_at = now()
where email = 'pharmseidu_2011@hotmail.co.uk';
