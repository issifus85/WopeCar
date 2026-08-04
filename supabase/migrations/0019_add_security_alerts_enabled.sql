-- Settings > Security Alerts toggle (app/settings/index.js) called the
-- legacy Laravel GET/PUT /api/account/security-alerts, which required the
-- same dead Sanctum token as the Places/Paystack bugs. No Supabase
-- equivalent existed - this is it. Defaults true (matches the toggle's
-- own existing .catch(() => setEnabled(false)) being the only prior
-- "safe" fallback, but a fresh real user should start protected).
alter table public.users add column if not exists security_alerts_enabled boolean not null default true;
