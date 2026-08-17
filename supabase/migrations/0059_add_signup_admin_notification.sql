-- Notifies WopeCar support (app_settings.support_email, currently
-- support@wopecar.com) by email whenever a new user account is created in
-- auth.users - fired from a Postgres trigger rather than client code, so
-- it covers every signup path (the website's supabase.auth.signUp(), the
-- mobile app's own signup flow, and any future OAuth/magic-link path)
-- without either app needing to remember to call it, and without a risk
-- of missing the notification if the client goes offline right after
-- signup completes.
--
-- pg_net's http_post is async/fire-and-forget from the trigger's point of
-- view, so a slow or failing Resend send can never block or fail the
-- signup itself.
--
-- The target Edge Function (send-signup-notification) is deployed
-- --no-verify-jwt, same posture as send-inquiry-notification, since the
-- caller here is Postgres, not a Supabase Auth session. The anon key
-- embedded below is safe to commit - it's a public, RLS-gated key by
-- design, not a secret (same key already shipped in both the website's
-- and the mobile app's client bundles).

create extension if not exists pg_net;

create or replace function notify_admin_new_signup()
returns trigger as $$
begin
  perform net.http_post(
    url := 'https://qvactycnufaowwsiqdrz.supabase.co/functions/v1/send-signup-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2YWN0eWNudWZhb3d3c2lxZHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNjkwMDcsImV4cCI6MjEwMDg0NTAwN30.VRzansMc5kimTQKjUWZbodwRjYfJsQDRwLm24UR1VtM'
    ),
    body := jsonb_build_object(
      'email', new.email,
      'fullName', new.raw_user_meta_data->>'full_name',
      'createdAt', new.created_at
    )
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created_notify_admin
  after insert on auth.users
  for each row execute function notify_admin_new_signup();
