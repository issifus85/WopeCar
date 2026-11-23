-- "Which paid, confirmed/completed bookings are missing a required identity
-- document" - the single source of truth this feature is built on. Supersedes
-- the ad-hoc manual audit that found booking WC-2026-7731 (and WC-2026-0058,
-- same renter) had completed as paid Chauffeur trips with ZERO identity
-- documents on file: the checkout "required" check only verifies a file was
-- picked in browser/app state, never that it actually reached the server -
-- the real upload is best-effort and silently swallows failures (see
-- uploadCheckoutDocuments in the website repo, uploadBookingDocument in the
-- app's checkout/payment.js).
--
-- Required-document rule (confirmed by product): license_front, license_back
-- and proof_of_address are required for EVERY qualifying booking regardless of
-- channel. national_id is required ONLY when booking_source = 'website' - the
-- website checkout hard-blocks on it, the app never asks for it at checkout
-- (it's optional, collected later via the app's own Documents Hub screen).
-- Getting this backwards would nag app renters about a document the app
-- never asked them for.
--
-- Presence is checked per renter (documents.user_id), not per booking - a
-- document, once uploaded, satisfies every booking of that renter's, same as
-- send-national-id-reminders' existing Set-based anti-join.
--
-- Owner-privileged view (bypasses bookings/documents/users RLS), with is_admin()
-- as the WHERE-clause guard - same convention as public.vendor_bookings
-- (0153_vendor_booking_access_via_view.sql), not security_invoker.
create or replace view public.bookings_missing_documents as
with required as (
  select
    b.id as booking_id, b.booking_ref, b.renter_id, b.car_id,
    b.start_date, b.drive_type, b.booking_source, b.status, b.payment_status,
    unnest(
      case when b.booking_source = 'website'
        then array['license_front', 'license_back', 'proof_of_address', 'national_id']
        else array['license_front', 'license_back', 'proof_of_address']
      end
    ) as required_type
  from public.bookings b
  where b.payment_status = 'paid'
    and b.status in ('confirmed', 'completed')
),
missing as (
  select r.*
  from required r
  where not exists (
    select 1 from public.documents d
    where d.user_id = r.renter_id and d.type = r.required_type
  )
)
select
  m.booking_id,
  m.booking_ref,
  m.renter_id,
  u.full_name as renter_name,
  u.email as renter_email,
  u.phone as renter_phone,
  m.car_id,
  c.name as car_name,
  m.drive_type,
  m.start_date,
  m.booking_source,
  m.status,
  array_agg(m.required_type order by m.required_type) as missing_document_types
from missing m
join public.users u on u.id = m.renter_id
left join public.cars c on c.id = m.car_id
-- is_admin() covers the admin dashboard (a real signed-in admin's auth.uid());
-- auth.role() = 'service_role' covers send-missing-document-reminders, which
-- reads this view with the service-role key and has no auth.uid() at all.
where is_admin() or auth.role() = 'service_role'
group by m.booking_id, m.booking_ref, m.renter_id, u.full_name, u.email, u.phone,
         m.car_id, c.name, m.drive_type, m.start_date, m.booking_source, m.status;

revoke all on public.bookings_missing_documents from public, anon;
grant select on public.bookings_missing_documents to authenticated;

-- Cooldown column for the weekly send-missing-document-reminders cron below -
-- lookback-based (6-day, same idiom as users.national_id_reminder_sent_at)
-- so the weekly job re-fires every week until the renter is fully compliant.
alter table public.users add column if not exists missing_documents_reminder_sent_at timestamptz;
