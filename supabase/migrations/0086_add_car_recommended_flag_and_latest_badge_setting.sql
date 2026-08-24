-- BACKFILL - already applied live (ledger version 20260805010249, name
-- add_car_recommended_flag_and_latest_badge_setting). Never committed to
-- this repo.

alter table cars add column if not exists is_recommended boolean not null default false;

insert into app_settings (key, value)
values ('latest_badge_days', '14')
on conflict (key) do nothing;
