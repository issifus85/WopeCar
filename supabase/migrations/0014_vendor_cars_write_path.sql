-- Phase 6: Vendor Mode write-path (new car listings).
--
-- Self-service vendor onboarding: 0004_gap_fixes.sql deliberately left
-- `vendors` with no self-insert policy ("becoming a vendor is a real
-- business decision... not something that should happen automatically").
-- Confirmed with the user (2026-07-31) to supersede that for this phase -
-- a user may create their own unapproved vendor row the first time they
-- submit a car. Cars still start status='pending' either way, so nothing
-- downstream is loosened.
create policy vendors_self_insert on vendors for insert to authenticated
  with check (user_id = auth.uid());

alter table vendors add constraint vendors_user_id_unique unique (user_id);

-- Captures the Add Car wizard's "Schedule Photos & Vetting" office-visit
-- appointment - a field the local addCar() already collects
-- (vettingAppointment) with nowhere to land on the existing cars table.
alter table cars add column vetting_date date;
alter table cars add column vetting_time text;
