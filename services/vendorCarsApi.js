import supabase, { getCurrentUser } from './supabase';
import { VEHICLE_TYPES, VEHICLE_CLASSES, CAR_FEATURES } from '../constants/vehicleCatalog';

const TYPE_LABEL_BY_VALUE = new Map(VEHICLE_TYPES.map((t) => [t.value, t.label]));
const TYPE_VALUE_BY_LABEL = new Map(VEHICLE_TYPES.map((t) => [t.label, t.value]));
const CLASS_LABEL_BY_VALUE = new Map(VEHICLE_CLASSES.map((c) => [c.value, c.label]));
const CLASS_VALUE_BY_LABEL = new Map(VEHICLE_CLASSES.map((c) => [c.label, c.value]));
const FEATURE_BY_SLUG = new Map(CAR_FEATURES.map((f) => [f.slug, f]));

// Local/UI status is capitalized ('Pending'/'Active'/'Inactive'), the
// cars.status check constraint is lowercase - translated at this boundary
// so every existing car.status === 'Pending'-style comparison keeps working.
const STATUS_TO_LOCAL = { pending: 'Pending', active: 'Active', inactive: 'Inactive' };
const STATUS_TO_ROW = { Pending: 'pending', Active: 'active', Inactive: 'inactive' };

// Every column normalizeVendorCar() below actually reads, explicitly - not
// `select('*')` - so payout_per_day (admin-only, see cars_restrict_vendor_
// payout_update trigger) never reaches this vendor-facing module even
// transiently, matching the same guarantee getVendorBookings() already
// established in services/supabaseApi.js for renter_id. Used by
// getMyCars/createCar/updateCarListing below.
const VENDOR_CAR_SELECT = `
  id, name, make, model, year, type, vehicle_class, drive_type, energy_source,
  location, price_per_day, description, transmission, seats, doors, baggage,
  features, regional_addons, vetting_date, vetting_time, images, status,
  min_booking_days, advance_notice, booking_window, insurance_policy_number,
  created_at, discount_enabled, discount_type, discount_value,
  discount_starts_at, discount_ends_at, length_of_stay_discounts
`;

// Adapts a Supabase `cars` row to the exact shape VendorContext.addCar()
// always produced locally, so My Fleet/Car Management/Edit Listing need no
// changes. type/vehicleClass round-trip label<->slug (the wizard's pickers
// store labels), features round-trip {id,slug,title}<->slug[] (mirrors
// services/carsApi.js's normalizeCar feature resolution).
function normalizeVendorCar(row) {
  return {
    id: row.id,
    name: row.name,
    make: row.make,
    model: row.model,
    year: row.year,
    type: row.type ? (TYPE_LABEL_BY_VALUE.get(row.type) ?? row.type) : null,
    vehicleClass: row.vehicle_class ? (CLASS_LABEL_BY_VALUE.get(row.vehicle_class) ?? row.vehicle_class) : null,
    drivenBy: row.drive_type,
    energySource: row.energy_source ?? null,
    location: row.location,
    pricePerDay: row.price_per_day,
    description: row.description ?? '',
    transmission: row.transmission,
    seats: row.seats,
    doors: row.doors,
    baggage: row.baggage,
    features: (row.features ?? []).map((slug) => FEATURE_BY_SLUG.get(slug) ?? { id: slug, slug, title: slug }),
    regionalAddons: (row.regional_addons ?? []).map((a) => ({ name: a.name, price: Number(a.price) || 0, type: a.type })),
    vettingAppointment: (row.vetting_date || row.vetting_time) ? { date: row.vetting_date, time: row.vetting_time } : null,
    image: row.images?.[0] ?? null,
    status: STATUS_TO_LOCAL[row.status] ?? row.status,
    minBookingDays: row.min_booking_days,
    advanceNoticeDays: row.advance_notice,
    bookingWindowMonths: row.booking_window,
    insurancePolicyNumber: row.insurance_policy_number ?? null,
    submittedAt: row.created_at,
    discountEnabled: !!row.discount_enabled,
    discountType: row.discount_type ?? 'percentage',
    discountValue: row.discount_value != null ? Number(row.discount_value) : null,
    discountStartsAt: row.discount_starts_at,
    discountEndsAt: row.discount_ends_at,
    lengthOfStayDiscounts: row.length_of_stay_discounts ?? [],
  };
}

// Only maps keys actually present in `fields`, so createCar/updateCarListing
// can share this for both a full submission and a partial patch.
function mapFieldsToRow(fields) {
  const row = {};
  if ('name' in fields) row.name = fields.name;
  if ('make' in fields) row.make = fields.make;
  if ('model' in fields) row.model = fields.model;
  if ('year' in fields) row.year = fields.year;
  if ('type' in fields) row.type = fields.type ? (TYPE_VALUE_BY_LABEL.get(fields.type) ?? fields.type) : null;
  if ('vehicleClass' in fields) row.vehicle_class = fields.vehicleClass ? (CLASS_VALUE_BY_LABEL.get(fields.vehicleClass) ?? fields.vehicleClass) : null;
  if ('drivenBy' in fields) row.drive_type = fields.drivenBy;
  if ('energySource' in fields) row.energy_source = fields.energySource;
  if ('location' in fields) row.location = fields.location;
  if ('pricePerDay' in fields) row.price_per_day = fields.pricePerDay;
  if ('description' in fields) row.description = fields.description;
  if ('transmission' in fields) row.transmission = fields.transmission;
  if ('seats' in fields) row.seats = fields.seats;
  if ('doors' in fields) row.doors = fields.doors;
  if ('baggage' in fields) row.baggage = fields.baggage;
  if ('features' in fields) row.features = (fields.features ?? []).map((f) => f.slug);
  if ('regionalAddons' in fields) row.regional_addons = fields.regionalAddons ?? [];
  if ('vettingAppointment' in fields) {
    row.vetting_date = fields.vettingAppointment?.date ?? null;
    row.vetting_time = fields.vettingAppointment?.time ?? null;
  }
  if ('status' in fields) row.status = STATUS_TO_ROW[fields.status] ?? fields.status;
  if ('minBookingDays' in fields) row.min_booking_days = fields.minBookingDays;
  if ('advanceNoticeDays' in fields) row.advance_notice = fields.advanceNoticeDays;
  if ('bookingWindowMonths' in fields) row.booking_window = fields.bookingWindowMonths;
  if ('insurancePolicyNumber' in fields) row.insurance_policy_number = fields.insurancePolicyNumber;
  if ('discountEnabled' in fields) row.discount_enabled = fields.discountEnabled;
  if ('discountType' in fields) row.discount_type = fields.discountType;
  if ('discountValue' in fields) row.discount_value = fields.discountValue;
  if ('discountStartsAt' in fields) row.discount_starts_at = fields.discountStartsAt;
  if ('discountEndsAt' in fields) row.discount_ends_at = fields.discountEndsAt;
  if ('lengthOfStayDiscounts' in fields) row.length_of_stay_discounts = fields.lengthOfStayDiscounts ?? [];
  return row;
}

function normalizeVendor(row) {
  return {
    id: row.id,
    userId: row.user_id,
    businessName: row.business_name,
    ghanaCardId: row.ghana_card_id,
    isApproved: !!row.is_approved,
    createdAt: row.created_at,
    idDocumentStatus: row.id_document_status ?? 'not_submitted',
    idDocumentRejectionReason: row.id_document_rejection_reason ?? null,
    businessRegDocumentStatus: row.business_reg_document_status ?? 'not_submitted',
    businessRegDocumentRejectionReason: row.business_reg_document_rejection_reason ?? null,
    businessInfo: row.business_info ?? {},
    payoutMethod: row.payout_method ?? {},
  };
}

// Read-only gate check for entering Vendor Mode - never inserts. Returns
// null if the caller has no vendor row yet (relies on vendors_own_select
// RLS to scope to the caller's own row).
export async function getVendorProfile() {
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeVendor(data) : null;
}

// Updates the caller's own vendor row - business_info/payout_method are the
// only fields this is used for today (app/vendor/business-info.js,
// app/vendor/payout-method.js), relies on vendors_own_update RLS
// (0002_rls_policies.sql). Both stay opaque jsonb blobs matching whatever
// shape those two screens already produce locally - no per-key mapping
// needed, same convention as cars.regional_addons.
export async function updateVendorProfile(patch) {
  const user = await getCurrentUser();
  const row = {};
  if ('businessInfo' in patch) row.business_info = patch.businessInfo;
  if ('payoutMethod' in patch) row.payout_method = patch.payoutMethod;
  const { data, error } = await supabase
    .from('vendors')
    .update(row)
    .eq('user_id', user.id)
    .select()
    .single();
  if (error) throw error;
  return normalizeVendor(data);
}

// The "Become a Vendor" application submit (app/vendor/apply.js) - the one
// deliberate, user-initiated creation of a vendor row, gating entry into
// Vendor Mode. Relies on vendors_self_insert/vendors_user_id_unique from
// 0014_vendor_cars_write_path.sql. Only business_name/ghana_card_id are set
// at this step - business_info/payout_method (RGD number, TIN, bank/mobile
// money details) are edited later via updateVendorProfile, once inside
// Vendor Mode.
export async function applyToBecomeVendor({ businessName, ghanaCardId }) {
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from('vendors')
    .insert({ user_id: user.id, business_name: businessName, ghana_card_id: ghanaCardId })
    .select()
    .single();
  if (error) {
    // 23505 = unique_violation on vendors_user_id_unique - the caller
    // already has a vendor row (a resubmit after a slow/lost response, or
    // a rare double-tap race past the submit button's own disabled guard).
    // The outcome they wanted ("I'm a vendor now") is already true, so
    // return the real existing row instead of surfacing a raw constraint
    // error - this call is meant to be idempotent per user, not one-shot.
    if (error.code === '23505') {
      const existing = await getVendorProfile();
      if (existing) return existing;
    }
    throw error;
  }
  return normalizeVendor(data);
}

// Resolves the signed-in user's own vendor row, creating an unapproved one on
// first use - see 0014_vendor_cars_write_path.sql's vendors_self_insert
// policy. Only createCar() needs this; reads rely on cars_vendor_select's
// RLS to scope correctly on its own (a user with no vendor row yet simply
// gets back an empty list, which is the correct "no cars" state).
export async function getOrCreateVendor() {
  const user = await getCurrentUser();
  const { data: existing, error: selectError } = await supabase
    .from('vendors')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing;

  const { data: created, error: insertError } = await supabase
    .from('vendors')
    .insert({
      user_id: user.id,
      business_name: user.user_metadata?.full_name ? `${user.user_metadata.full_name}'s Fleet` : null,
    })
    .select()
    .single();
  if (insertError) throw insertError;
  return created;
}

export async function createCar(fields) {
  const vendor = await getOrCreateVendor();
  const row = { ...mapFieldsToRow(fields), vendor_id: vendor.id, status: 'pending' };
  const { data, error } = await supabase.from('cars').insert(row).select(VENDOR_CAR_SELECT).single();
  if (error) throw error;
  return normalizeVendorCar(data);
}

export async function updateCarListing(carId, patch) {
  const row = mapFieldsToRow(patch);
  const { data, error } = await supabase.from('cars').update(row).eq('id', carId).select(VENDOR_CAR_SELECT).single();
  if (error) throw error;
  return normalizeVendorCar(data);
}

// Explicitly scoped to the caller's own vendor_id - relying on RLS alone
// here is wrong, not just unnecessary: `cars` also has a public "active
// cars are visible to everyone" policy for the renter marketplace
// (services/carsApi.js's fetchCars()), and RLS policies are OR'd together,
// so an unfiltered select would return every vendor's active cars, not just
// the caller's own. A vendor with no row yet correctly gets [] without a
// query at all.
// Accepts an already-resolved vendor (VendorContext's loadVendorData passes
// its own single getVendorProfile() result) to avoid a second independent
// getCurrentUser()/vendors lookup - see that function's comment for why
// firing this call's own internal getVendorProfile() concurrently with
// others caused a real race. Falls back to fetching it here for any other
// caller.
export async function getMyCars(vendor) {
  vendor = vendor ?? await getVendorProfile();
  if (!vendor) return [];
  const { data, error } = await supabase
    .from('cars')
    .select(VENDOR_CAR_SELECT)
    .eq('vendor_id', vendor.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(normalizeVendorCar);
}

// One query for every car's blocked dates (not N+1) - used on initial
// VendorContext load so both the per-car Availability screen and the
// aggregate Fleet Calendar tab have real data ready without either screen
// needing its own loading state. `availability_vendor_select` RLS
// (0002_rls_policies.sql) already scopes this to the caller's own cars.
export async function getBlockedDatesForCars(carIds) {
  if (!carIds.length) return {};
  const { data, error } = await supabase
    .from('availability')
    .select('car_id, date')
    .in('car_id', carIds)
    .eq('status', 'blocked');
  if (error) throw error;
  const byCarId = {};
  (data ?? []).forEach((row) => {
    (byCarId[row.car_id] ??= []).push(row.date);
  });
  return byCarId;
}

// Persists the full desired blocked-date list for one car, diffing against
// what's already stored rather than clearing and re-inserting everything -
// cheaper, and avoids a moment where the row briefly doesn't exist. Never
// touches 'booked' rows (those belong to real paid bookings, written by the
// renter's own session per 0009_availability_renter_insert.sql) - the
// (car_id, date) unique constraint means a genuine attempt to block an
// already-booked date correctly throws rather than silently clobbering it,
// though the UI never lets a vendor tap a booked day in the first place.
export async function setBlockedDates(carId, isoDates) {
  const { data: existingRows, error: fetchError } = await supabase
    .from('availability')
    .select('date')
    .eq('car_id', carId)
    .eq('status', 'blocked');
  if (fetchError) throw fetchError;

  const current = (existingRows ?? []).map((r) => r.date);
  const currentSet = new Set(current);
  const nextSet = new Set(isoDates);
  const toAdd = isoDates.filter((d) => !currentSet.has(d));
  const toRemove = current.filter((d) => !nextSet.has(d));

  if (toRemove.length > 0) {
    const { error } = await supabase.from('availability').delete().eq('car_id', carId).eq('status', 'blocked').in('date', toRemove);
    if (error) throw error;
  }
  if (toAdd.length > 0) {
    const rows = toAdd.map((date) => ({ car_id: carId, date, status: 'blocked' }));
    const { error } = await supabase.from('availability').insert(rows);
    if (error) throw error;
  }
  return isoDates;
}

// Which of the vetting wizard's fixed time slots are already taken on a
// given date - queried live as the vendor picks a date in
// app/vendor/add-car/vetting.js, so two vendors can't double-book the same
// slot. Returns [{ time, available }], same shape the Edge Function itself
// returns (calendar-get-available-slots, wopecar-admin/supabase/functions).
export async function getAvailableAppointmentSlots(dateISO) {
  const { data, error } = await supabase.functions.invoke('calendar-get-available-slots', { body: { date: dateISO } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.slots;
}

// Creates the Google Calendar event for a just-submitted listing's vetting
// appointment - called right after createCar() succeeds (the only point
// vetting_date/vetting_time exist as real columns), never blocking or
// failing the submission itself if the calendar isn't reachable yet.
export async function createCalendarAppointment(carId) {
  const { data, error } = await supabase.functions.invoke('calendar-create-appointment', { body: { carId } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

// The vendor's own "Withdraw Listing" action - only valid while the car is
// still 'pending' (also enforced server-side by calendar-cancel-
// appointment). Cancels the Google Calendar event and sets both
// appointment_status and cars.status to their cancelled/inactive states.
export async function withdrawListing(carId) {
  const { data, error } = await supabase.functions.invoke('calendar-cancel-appointment', { body: { carId, alsoSetInactive: true } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}
