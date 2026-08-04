-- Prep for importing real Laravel car data (see the "Laravel -> Supabase
-- Data Migration, Phase 1: Cars & Users" plan). Fixes two check constraints
-- that were written speculatively before real Laravel data or the app's own
-- UI vocabulary existed to check them against, and adds columns the Add Car
-- wizard/Edit Listing screens already capture locally but were never given
-- anywhere to land in Supabase.

-- type: was ('SUV','Mid Size SUV','Sedan','Bus','Pickup','Mini Van') - matched
-- neither Laravel's real bravo_terms.slug values (attr_id=9, "Car Type") nor
-- the app's own filter chips (constants/vehicleCatalog.js VEHICLE_TYPES,
-- sourced from data/cars.js CATEGORIES), which already use these exact
-- slugs. Using them directly means car-import and the live app filter both
-- speak the same vocabulary with no translation layer. Includes all 13 real
-- Car Type terms from Laravel (bravo_terms, attr_id=9), not just the 7 the
-- app's filter chips currently expose - preserves real data (convertibles/
-- coupes/trucks/wagons/vans/suvs exist on real cars) even though the UI
-- doesn't have a filter chip for them yet; "All" still shows them.
alter table cars drop constraint if exists cars_type_check;
alter table cars add constraint cars_type_check
  check (type in (
    'suvs-4x4s', 'mid-size-suvs', 'sedan', 'hatchbacks', 'minivans', 'buses', 'pickups',
    'convertibles', 'coupes', 'trucks', 'wagons', 'vans', 'suvs'
  ));

-- drive_type: was ('Self Drive','Chauffeur','Both') - the app only ever
-- produces 'Self-drive'/'Chauffeur' (constants/pricing.js's
-- getMinBookingDays() and every driven-by badge check this exact casing/
-- hyphenation), and neither Laravel's real driven_by data nor the wizard
-- ever produces 'Both'.
alter table cars drop constraint if exists cars_drive_type_check;
alter table cars add constraint cars_drive_type_check
  check (drive_type in ('Self-drive', 'Chauffeur'));

-- Vehicle Class - captured by the Add Car wizard/Edit Listing today but
-- never had a column. Slugs match constants/vehicleCatalog.js
-- VEHICLE_CLASSES exactly (and Laravel's bravo_terms slugs under attr_id=25).
alter table cars add column vehicle_class text
  check (vehicle_class in ('luxury', 'economy-1', 'economy-2'));

-- Doors / trunk capacity - captured by the wizard, no column existed.
alter table cars add column doors integer;
alter table cars add column baggage integer;

-- Populated from Laravel's real cancel_policy/cancellation columns during
-- import; also closes a real (if minor) feature gap on Car Detail's
-- "Cancellation Policy" section, which previously had no source at all.
alter table cars add column cancellation_policy text;

-- Extend vendor_public_profiles (defined in 0004_gap_fixes.sql) so
-- CarOwnerCard's avatar/memberSince fields have somewhere to come from -
-- previously only exposed id/business_name/is_approved.
drop view if exists vendor_public_profiles;
create view vendor_public_profiles as
  select
    v.id,
    v.business_name,
    v.is_approved,
    v.created_at as member_since,
    u.avatar_url as avatar
  from vendors v
  left join users u on u.id = v.user_id;

grant select on vendor_public_profiles to anon, authenticated;
