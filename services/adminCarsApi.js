import supabase from './supabase';
import { notifyUser } from './adminNotify';
import { VEHICLE_TYPES, VEHICLE_CLASSES } from '../constants/vehicleCatalog';

const TYPE_VALUE_BY_LABEL = new Map(VEHICLE_TYPES.map((t) => [t.label, t.value]));
const CLASS_VALUE_BY_LABEL = new Map(VEHICLE_CLASSES.map((c) => [c.label, c.value]));

const CAR_SELECT = `
  id, vendor_id, name, make, model, year, type, seats, transmission, drive_type,
  energy_source, price_per_day, location, region_id, description, features, images, status,
  vehicle_class, doors, baggage, cancellation_policy, created_at, insurance_policy_number,
  discount_enabled, discount_type, discount_value, discount_starts_at, discount_ends_at,
  length_of_stay_discounts, is_recommended,
  vendors ( id, business_name, user_id, users ( full_name, email, phone ) ),
  regions ( name )
`;

export async function listCars({ status }) {
  const { data, error } = await supabase
    .from('cars')
    .select(CAR_SELECT)
    .eq('status', status)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getCar(id) {
  const { data, error } = await supabase.from('cars').select(CAR_SELECT).eq('id', id).single();
  if (error) throw error;
  return data;
}

async function setStatusAndNotify(car, status, { title, body }) {
  const { data, error } = await supabase.from('cars').update({ status }).eq('id', car.id).select().single();
  if (error) throw error;

  await notifyUser({
    userId: car.vendors?.user_id,
    type: `car_${status}`,
    title,
    body,
  });

  // Cancels this car's Google Calendar vetting event (reject/deactivate,
  // both land here as status='inactive') - alsoSetInactive: false since
  // this function already set cars.status and already notified above, so
  // calendar-cancel-appointment skips its own redundant notification.
  if (status === 'inactive') {
    supabase.functions.invoke('calendar-cancel-appointment', { body: { carId: car.id, alsoSetInactive: false } }).catch(() => {});
  }

  return data;
}

export const approveCar = (car) => setStatusAndNotify(car, 'active', {
  title: 'Your listing was approved',
  body: `${car.name} is now live on WopeCar.`,
});

// No dedicated "rejected" status exists on cars (only active/pending/
// inactive) - rejecting sets it inactive (hidden from renters, same as a
// vendor-deactivated listing) rather than deleting real listing work
// (photos, specs) the vendor already submitted. The reason travels via the
// notification so they know what to fix.
export const rejectCar = (car, reason) => setStatusAndNotify(car, 'inactive', {
  title: 'Your listing needs changes',
  body: reason || 'Your listing was not approved. Please review and resubmit.',
});

export const deactivateCar = (car) => setStatusAndNotify(car, 'inactive', {
  title: 'Your listing was deactivated',
  body: `${car.name} has been deactivated by WopeCar and is no longer visible to renters.`,
});

export const reactivateCar = (car) => setStatusAndNotify(car, 'active', {
  title: 'Your listing was reactivated',
  body: `${car.name} is live again on WopeCar.`,
});

/**
 * Only maps keys actually present in `fields`, mirroring
 * vendorCarsApi.js's mapFieldsToRow - type/vehicleClass round-trip
 * label->value the same way (edit form works in labels for its pickers),
 * everything else (drive_type, features as slugs, regional_addons) passes
 * straight through since this reads/writes the raw DB shape directly rather
 * than the vendor-side {id,slug,title} UI shape.
 */
function carFieldsToRow(fields) {
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
  if ('features' in fields) row.features = fields.features ?? [];
  if ('regionalAddons' in fields) row.regional_addons = fields.regionalAddons ?? [];
  if ('discountEnabled' in fields) row.discount_enabled = fields.discountEnabled;
  if ('discountType' in fields) row.discount_type = fields.discountType;
  if ('discountValue' in fields) row.discount_value = fields.discountValue;
  if ('discountStartsAt' in fields) row.discount_starts_at = fields.discountStartsAt;
  if ('discountEndsAt' in fields) row.discount_ends_at = fields.discountEndsAt;
  if ('lengthOfStayDiscounts' in fields) row.length_of_stay_discounts = fields.lengthOfStayDiscounts ?? [];
  if ('isRecommended' in fields) row.is_recommended = fields.isRecommended;
  return row;
}

/**
 * Admin overwrite of a vendor's own listing fields - the vendor is always
 * notified since the change happens on their behalf, without their direct
 * action, unlike the status-transition helpers above which already notify.
 */
export async function updateCar(car, fields) {
  const row = carFieldsToRow(fields);
  const { data, error } = await supabase.from('cars').update(row).eq('id', car.id).select(CAR_SELECT).single();
  if (error) throw error;

  await notifyUser({
    userId: car.vendors?.user_id,
    type: 'car_updated_by_admin',
    title: 'Your listing was updated',
    body: `WopeCar made changes to ${data.name}'s details on your behalf.`,
  });

  return data;
}
