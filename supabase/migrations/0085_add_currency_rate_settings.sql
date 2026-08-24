-- BACKFILL - already applied live (ledger version 20260804180145, name
-- add_currency_rate_settings). Never committed to this repo.

insert into app_settings (key, value)
values
  ('currency_rate_usd', '14.5'),
  ('currency_rate_eur', '15.42')
on conflict (key) do nothing;
