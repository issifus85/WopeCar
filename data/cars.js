// Matches the live "Car Type" attribute (attr_id 9) values/labels from the
// /book-a-car search filters.
export const CATEGORIES = [
  { label: 'All', value: 'All' },
  { label: 'SUVs/ 4x4s', value: 'suvs-4x4s' },
  { label: 'Mid Size SUVs', value: 'mid-size-suvs' },
  { label: 'Sedan', value: 'sedan' },
  { label: 'Hatchbacks', value: 'hatchbacks' },
  { label: 'Minivans', value: 'minivans' },
  { label: 'Buses', value: 'buses' },
  { label: 'Pickups', value: 'pickups' },
];

// The Home screen's quick-filter pills - a curated mix spanning several
// different filter dimensions (drive type, vehicle class, location, seats,
// car type), not just Category like the old pill row. `key` says which
// HomeScreen filter state array each pill toggles into; `value` must match
// that dimension's real attribute value exactly (e.g. 'economy-1' is
// VEHICLE_CLASSES' "Comfort", 'suvs-4x4s' is CATEGORIES' "SUVs/4x4"), except
// `location`, which is a free-text substring match against a car's
// `location` string (same as the search box), not an enum - Ghana cities
// aren't a fixed attribute the way type/class/drive are.
export const QUICK_FILTERS = [
  { key: 'driveType', value: 'Self-drive', label: 'Self-drive' },
  { key: 'vehicleClass', value: 'economy-1', label: 'Comfort' },
  { key: 'location', value: 'Accra', label: 'Accra' },
  { key: 'seats', value: 7, label: '7 Seater' },
  { key: 'type', value: 'suvs-4x4s', label: 'SUVs/4x4' },
  { key: 'location', value: 'Kumasi', label: 'Kumasi' },
];
