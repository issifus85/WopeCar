-- Roadworthy certificate + Insurance policy (number + document) captured at
-- Add Car time, viewable by both the vendor (Documents Hub) and admin (Car
-- Detail). Reuses the existing `documents` table/bucket rather than a new
-- one - just needs a car_id to scope by (nullable, every other document
-- type stays booking/user-scoped) and two new type values. No new RLS: the
-- vendor uploads under their own user_id (documents_owner_select/insert
-- already cover that), and documents_admin_all already grants admin full
-- access - "both parties" is exactly what's already there.
alter table public.cars add column if not exists insurance_policy_number text;
alter table public.documents add column if not exists car_id uuid references public.cars(id) on delete cascade;

alter table public.documents drop constraint documents_type_check;
alter table public.documents add constraint documents_type_check
  check (type = any (array[
    'license_front','license_back','proof_of_address',
    'vendor_id_front','vendor_id_back','vendor_business_reg',
    'roadworthy','insurance'
  ]));
