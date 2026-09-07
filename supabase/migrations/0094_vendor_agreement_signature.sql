-- Lets a vendor sign the Car Leasing Agreement (app/vendor/agreement.js)
-- self-service from that same screen, via the existing
-- react-native-signature-canvas pad already used for vehicle inspections
-- (app/vendor/inspection/signatures.js). Mirrors that pattern directly: the
-- drawn signature image uploads to the existing `documents` storage bucket
-- (path <user_id>/vendor-agreement/signature.png - already covered by
-- 0003_storage_policies.sql's documents_owner_insert/select, no new storage
-- policy needed) and the path + timestamp are written straight onto the
-- vendor's own row, same as vehicle_inspections.renter_signature_path
-- rather than going through the `documents` table (this isn't a
-- admin-reviewed KYC upload, just a one-off signature record).
--
-- Deliberately does not gate anything else in the app - not required for
-- new vendor applications, not required retroactively for existing
-- vendors, per explicit product decision.
alter table public.vendors add column if not exists agreement_signature_path text;
alter table public.vendors add column if not exists agreement_signed_at timestamptz;
