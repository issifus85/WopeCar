-- BACKFILL - already applied live (ledger version 20260801041054, name
-- admin_panel_foundation). Only the portion not already covered by
-- 0002_rls_policies.sql (which already has an identical promo_codes_admin_all
-- policy) is included here - see the migration-drift audit this backfill
-- batch is part of. Not meant to be re-run; written defensively.

alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role = any (array['renter'::text, 'vendor'::text, 'admin'::text, 'suspended'::text]));

-- One-time data grant, included for historical fidelity - re-running this
-- is harmless (idempotent no-op once these accounts are already admin).
update users set role = 'admin'
where email in ('francis.c@wopecar.com', 'maureen@wopecar.com', 'carlpapafio@gmail.com');
