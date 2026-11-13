-- Travel add-ons (destinations) can now be changed when a booking is modified (app + wopecar.com). Record the destinations before and
-- after each change so the renter's "Trip changes" history, the change email and staff can see what moved. Additive and safe to re-run.
alter table public.booking_modifications
  add column if not exists old_addon_names text[],
  add column if not exists new_addon_names text[];
