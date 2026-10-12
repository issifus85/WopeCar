-- Alerts raised by integration code (QuickBooks connection failures, invoices stuck). Service-role only; used to throttle the
-- admin alert email to once per 6 hours per kind. See supabase/functions/_shared/qbAlerts.ts in wopecar-admin.
create table if not exists public.integration_alerts (
  id bigserial primary key,
  kind text not null,
  message text not null,
  detail text,
  created_at timestamptz not null default now(),
  notified_at timestamptz
);
create index if not exists integration_alerts_kind_created_idx on public.integration_alerts (kind, created_at desc);
alter table public.integration_alerts enable row level security;
revoke all on public.integration_alerts from anon, authenticated;
-- Staff can read them in SQL/admin tools later if needed.
grant select on public.integration_alerts to authenticated;
drop policy if exists integration_alerts_admin_read on public.integration_alerts;
create policy integration_alerts_admin_read on public.integration_alerts for select to authenticated using (is_admin());
