-- Seeds the two app_settings keys the new send-app-update-notification
-- trigger (0120) watches. Seeded at the current shipped version (app.json's
-- "version": "1.0.2") rather than empty, so creating these rows doesn't
-- itself look like a version bump to the trigger - only a real edit to a
-- higher value should notify anyone. Admin-editable via wopecar-admin's
-- settings screen (added to its own APP_KEYS list alongside app_store_url/
-- play_store_url - see wopecar-admin's lib/settingsConfig for the same
-- "must add the key there too" gotcha every other app_settings addition
-- has hit).
insert into app_settings (key, value, description)
values
  ('latest_ios_version', '"1.0.2"'::jsonb, 'Latest WopeCar version published to the App Store - editing this notifies iOS users with an older installed version'),
  ('latest_android_version', '"1.0.2"'::jsonb, 'Latest WopeCar version published to the Play Store - editing this notifies Android users with an older installed version')
on conflict (key) do nothing;
