-- Notifies every user with a push token for the affected platform (push +
-- in-app) the moment an admin bumps latest_ios_version/latest_android_version
-- in app_settings - fired reactively from a Postgres trigger, same pattern
-- as notify_admin_new_signup() (0059), rather than a polling cron: there's
-- no "eligible rows" concept for a single global settings value the way
-- there is for per-booking/per-user reminders elsewhere, so a cron would
-- just be re-checking a value that only ever changes when someone edits it.
-- The WHEN clause means this can never double-fire (no guard column
-- needed) - it only runs on a real value change to one of the two keys,
-- never on an unrelated app_settings row or a no-op save of the same value.
--
-- pg_net's http_post is async/fire-and-forget, so a slow or failing push/
-- email send can never block the settings save itself.
--
-- The anon key embedded below is safe to commit - see
-- 0059_add_signup_admin_notification.sql's comment for why (public,
-- RLS-gated key, not a secret).
create extension if not exists pg_net;

create or replace function notify_app_update_available()
returns trigger as $$
declare
  platform text;
begin
  platform := case new.key
    when 'latest_ios_version' then 'ios'
    when 'latest_android_version' then 'android'
  end;

  perform net.http_post(
    url := 'https://qvactycnufaowwsiqdrz.supabase.co/functions/v1/send-app-update-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2YWN0eWNudWZhb3d3c2lxZHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNjkwMDcsImV4cCI6MjEwMDg0NTAwN30.VRzansMc5kimTQKjUWZbodwRjYfJsQDRwLm24UR1VtM'
    ),
    body := jsonb_build_object(
      'platform', platform,
      'version', new.value #>> '{}'
    )
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_app_version_updated_notify_users
  after update on app_settings
  for each row
  when (new.key in ('latest_ios_version', 'latest_android_version') and new.value is distinct from old.value)
  execute function notify_app_update_available();
