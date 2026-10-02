-- Minimum app version allowed to run, per platform. An installed version
-- older than this sees a full-screen "Update required" block in the app
-- (components/AppUpdatePrompt.js) instead of the app. Seeded at 1.0.0 so
-- nothing is blocked until an admin raises it. Unlike latest_*_version
-- (0119) these do NOT fire the update-notification trigger (0120 only
-- watches latest_*). app_settings updates are UPDATE-only, so the keys must
-- exist in every project before an admin can edit them.
insert into app_settings (key, value, description)
values
  ('min_supported_ios_version', '"1.0.0"'::jsonb, 'Oldest WopeCar iOS version still allowed to run - older installs are blocked behind an "Update required" screen'),
  ('min_supported_android_version', '"1.0.0"'::jsonb, 'Oldest WopeCar Android version still allowed to run - older installs are blocked behind an "Update required" screen')
on conflict (key) do nothing;
