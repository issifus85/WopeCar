-- Internal (cron / DB-trigger) Edge Functions were deployed with verify_jwt=false and no auth, so anyone with
-- the public anon key could invoke them (e.g. push a message to every user via send-app-update-notification).
-- Callers now prove themselves with a shared secret kept in this private table: RLS on, no policies, no API
-- privileges => readable only by service_role / the owner. See supabase/functions/_shared/cronAuth.ts.
create table if not exists public.internal_secrets (
  name text primary key,
  value text not null
);
alter table public.internal_secrets enable row level security;
revoke all on public.internal_secrets from anon, authenticated;

insert into public.internal_secrets (name, value)
values ('cron', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;

-- Add the secret header to every pg_cron job that posts to an Edge Function.
do $$
declare j record;
begin
  for j in select jobid, command from cron.job where command like '%net.http_post%' and command not like '%x-cron-secret%' loop
    perform cron.alter_job(
      j.jobid,
      command := replace(j.command, 'headers := jsonb_build_object(',
        'headers := jsonb_build_object(''x-cron-secret'', (select value from public.internal_secrets where name = ''cron''), ')
    );
  end loop;
end $$;

-- ...and to the three DB-trigger functions that call internal Edge Functions.
do $$
declare f record; def text;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('notify_admin_new_signup', 'notify_admin_vendor_blocked', 'notify_app_update_available') loop
    def := pg_get_functiondef(f.oid);
    if def not like '%x-cron-secret%' then
      execute replace(def, 'headers := jsonb_build_object(',
        'headers := jsonb_build_object(''x-cron-secret'', (select value from public.internal_secrets where name = ''cron''), ');
    end if;
  end loop;
end $$;
