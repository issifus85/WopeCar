-- Admin-initiated rental agreements. The admin can start the Client Rental Agreement from the admin booking details (mobile admin app); the draft
-- is saved on the server the moment it is initiated (prefilled from the booking) and is only SUBMITTED when the agreement is completed (both
-- signatures). It is the same rental_agreements row the renter sees, so both parties have the record; a PDF copy is generated on submit and
-- emailed to the renter and WopeCar (see generate-rental-agreement-report).
--
--   initiated_by    who created the draft (auth.uid() by default) - shown as "Started by WopeCar" / by the client
--   report_pdf_path where the generated PDF copy is stored (documents bucket), set by the Edge Function (idempotency marker)
alter table public.rental_agreements add column if not exists initiated_by uuid default auth.uid();
alter table public.rental_agreements add column if not exists report_pdf_path text;

-- A SUBMITTED agreement can no longer be edited or deleted by the client/vendor roles (a stale client draft must not overwrite an admin-
-- completed agreement). Admins and server-side code (service role) are exempt. Invoker function: current_user must be the real caller role
-- (see 0158 - inside a SECURITY DEFINER function it would be the function owner and the check would never fire).
create or replace function public.lock_submitted_rental_agreement()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user not in ('authenticated', 'anon') or is_admin() then
    return coalesce(new, old);
  end if;
  if old.status = 'submitted' then
    raise exception 'This rental agreement has already been submitted and can no longer be changed.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists rental_agreements_lock_submitted on public.rental_agreements;
create trigger rental_agreements_lock_submitted
  before update or delete on public.rental_agreements
  for each row execute function public.lock_submitted_rental_agreement();

-- updated_at has never been maintained on this table; keep it honest so "draft last saved" is real.
create or replace function public.touch_rental_agreement_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists rental_agreements_touch_updated_at on public.rental_agreements;
create trigger rental_agreements_touch_updated_at
  before update on public.rental_agreements
  for each row execute function public.touch_rental_agreement_updated_at();

-- The renter must be able to open the signature images and the PDF copy of an agreement even when the ADMIN uploaded them (the signature files
-- live under the uploader's own folder: <uploader uid>/agreements/<agreement id>/..., and the PDF copy under system/agreements/<id>/...).
-- Same idea as 0017 for inspections, but renter-only: a vendor never gets the agreement files (it carries the client's details).
drop policy if exists documents_agreement_renter_select on storage.objects;
create policy documents_agreement_renter_select on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[2] = 'agreements'
    and exists (
      select 1 from rental_agreements ra
      join bookings b on b.id = ra.booking_id
      where ra.id::text = (storage.foldername(name))[3]
        and b.renter_id = auth.uid()
    )
  );
