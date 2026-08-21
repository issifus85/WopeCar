-- National / Government Issued ID: a second identity-document type
-- alongside the existing Driver's Licence fields (0005_extend_users_profile.sql),
-- with a real attached-copy upload (reuses the existing `documents` table/
-- bucket, same pattern 0018_add_car_compliance_documents.sql used to add
-- roadworthy/insurance types) and a genuinely working admin verify/reject
-- flow (see the guard trigger below).

alter table users
  add column national_id_type text
    check (national_id_type in ('ghana_card', 'passport', 'voter_id')),
  add column national_id_number text,
  add column national_id_expiry date,
  add column national_id_status text not null default 'pending'
    check (national_id_status in ('pending', 'verified', 'rejected')),
  add column national_id_rejection_reason text;

alter table public.documents drop constraint documents_type_check;
alter table public.documents add constraint documents_type_check
  check (type = any (array[
    'license_front','license_back','proof_of_address','national_id',
    'vendor_id_front','vendor_id_back','vendor_business_reg',
    'roadworthy','insurance'
  ]));

-- Gap: users_own_update RLS (0002_rls_policies.sql) is row-level only
-- (auth.uid() = id) with no column restriction, so a renter's own client
-- could self-set license_verification_status = 'verified' via a plain
-- update - nothing has ever stopped this. Closing it now for both
-- license_verification_status (pre-existing gap) and the new
-- national_id_status, in one trigger, mirroring
-- restrict_vendor_booking_update()'s exact shape (0004_gap_fixes.sql).
create or replace function restrict_verification_status_update()
returns trigger as $$
begin
  if is_admin() then
    return new;
  end if;

  if new.license_verification_status is distinct from old.license_verification_status
    or new.national_id_status is distinct from old.national_id_status
    or new.national_id_rejection_reason is distinct from old.national_id_rejection_reason
  then
    raise exception 'Only an administrator can change verification status.';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger restrict_verification_status_update
  before update on users
  for each row execute function restrict_verification_status_update();
