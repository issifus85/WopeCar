-- BACKFILL - already applied live (ledger version 20260814210555, name
-- seed_app_store_link_settings). Never committed to this repo - 0058
-- (add_wopecartalks) references these two app_settings keys in a comment
-- but this is the migration that actually seeds them.

insert into app_settings (key, value, description)
values
  ('app_store_url', '""'::jsonb, 'iOS App Store listing URL — footer "Download on the App Store" badge link'),
  ('play_store_url', '""'::jsonb, 'Google Play Store listing URL — footer "Get it on Google Play" badge link')
on conflict (key) do nothing;
