-- WopeCar Supabase schema - extends `users` to full parity with the real
-- Laravel user shape (services/authApi.js's normalizeUser()), per the
-- "direct replica, no limited list" instruction for the auth migration.
-- Run this in the SQL Editor after 0004_gap_fixes.sql.

alter table users
  add column first_name text,
  add column last_name text,
  add column nickname text,
  add column email_verified_at timestamptz,
  add column phone_verified_at timestamptz,
  add column birthday date,
  add column address text,
  add column address2 text,
  add column city text,
  add column state text,
  add column country text,
  add column zip_code text,
  -- SECURITY NOTE: Laravel encrypts driver_license_number at rest (app-level
  -- cast) and only ever exposes a masked accessor to the client. This column
  -- is plain text for now - matching encryption would need pgcrypto's
  -- pgp_sym_encrypt/decrypt wired through a server-side function (the
  -- decryption key can never reach client code), which is real additional
  -- infra beyond "add the column". Flagging clearly rather than shipping a
  -- false sense of parity - this should be closed before real license
  -- numbers land here.
  add column driver_license_number text,
  add column driver_license_expiry date,
  add column driver_license_country text,
  add column license_verification_status text not null default 'pending'
    check (license_verification_status in ('pending', 'verified', 'rejected')),
  add column preferred_pickup_location text,
  add column emergency_contact_name text,
  add column emergency_contact_phone text,
  add column referral_code text unique,
  -- Gates Staff Inbox visibility in app/(tabs)/profile.js - real field on
  -- the Laravel side (services/authApi.js: `!!raw.is_support || raw.role_id
  -- === 1`), distinct from the `role` column already on this table (which
  -- has no literal Laravel-side source column - it's Supabase-native infra
  -- added earlier for Vendor Mode / RLS's is_admin() checks).
  add column is_support boolean not null default false;

-- profile_completion is intentionally NOT a stored column here - on the
-- Laravel side it's a computed percentage, not persisted data. Storing it
-- would just go stale the moment any of the fields above change without
-- also recomputing it. supabaseAuthApi.js's normalizeUser() computes it
-- the same way instead (see that file for the exact field list it counts).
