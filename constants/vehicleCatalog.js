import { CATEGORIES } from '../data/cars';

// Reference data for the vendor "Add a Car" wizard - real manufacturer/model
// names (not fabricated specs), covering makes commonly seen on the Ghana
// market. Used to power the searchable Make/Model pickers in
// app/vendor/add-car/index.js.
export const VEHICLE_MAKES = [
  { make: 'Toyota', models: ['Camry', 'Corolla', 'Corolla Cross', 'RAV4', 'Highlander', 'Land Cruiser', 'Land Cruiser Prado', 'Hilux', 'Hiace', 'Yaris', 'Avalon', 'Sienna'] },
  { make: 'Hyundai', models: ['Elantra', 'Tucson', 'Santa Fe', 'Sonata', 'Accent', 'i10', 'i20', 'Creta', 'Palisade', 'Venue'] },
  { make: 'Kia', models: ['Sportage', 'Picanto', 'Rio', 'Sorento', 'Sonet', 'Seltos', 'Cerato', 'Soul'] },
  { make: 'Nissan', models: ['Altima', 'Sentra', 'X-Trail', 'Rogue', 'Pathfinder', 'Navara', 'Patrol', 'Micra', 'Qashqai'] },
  { make: 'Honda', models: ['Civic', 'Accord', 'CR-V', 'HR-V', 'Pilot', 'City', 'Fit'] },
  { make: 'Ford', models: ['Focus', 'Fusion', 'Explorer', 'Escape', 'Ranger', 'EcoSport', 'Everest'] },
  { make: 'Chevrolet', models: ['Cruze', 'Malibu', 'Captiva', 'Trailblazer', 'Spark'] },
  { make: 'Mercedes-Benz', models: ['C-Class', 'E-Class', 'S-Class', 'GLE', 'GLC', 'GLA', 'Sprinter'] },
  { make: 'BMW', models: ['3 Series', '5 Series', 'X1', 'X3', 'X5'] },
  { make: 'Volkswagen', models: ['Golf', 'Passat', 'Jetta', 'Polo', 'Tiguan', 'Touareg'] },
  { make: 'Suzuki', models: ['Swift', 'Vitara', 'Jimny', 'Baleno', 'Ertiga'] },
  { make: 'Mitsubishi', models: ['Outlander', 'Pajero', 'L200', 'ASX', 'Mirage'] },
  { make: 'Mazda', models: ['Mazda3', 'Mazda6', 'CX-5', 'CX-9', 'BT-50'] },
  { make: 'Jeep', models: ['Wrangler', 'Grand Cherokee', 'Cherokee', 'Compass'] },
  { make: 'Land Rover', models: ['Range Rover', 'Range Rover Sport', 'Range Rover Evoque', 'Discovery', 'Defender'] },
  { make: 'Lexus', models: ['RX', 'ES', 'NX', 'GX', 'LX'] },
  { make: 'Peugeot', models: ['301', '3008', '5008', 'Partner'] },
  { make: 'Renault', models: ['Duster', 'Logan', 'Sandero', 'Koleos'] },
];

export function getModelsForMake(make) {
  return VEHICLE_MAKES.find((m) => m.make === make)?.models ?? [];
}

const CURRENT_YEAR = new Date().getFullYear();
export const MANUFACTURING_YEARS = Array.from(
  { length: CURRENT_YEAR - 1999 },
  (_, i) => String(CURRENT_YEAR - i)
);

// Ghana's 16 administrative regions (2019 split) - used by the Regional
// Add-on Pricing step to let a vendor price delivery to regions beyond
// their car's home location.
export const GHANA_REGIONS = [
  'Ahafo', 'Ashanti', 'Bono', 'Bono East', 'Central', 'Eastern',
  'Greater Accra', 'North East', 'Northern', 'Oti', 'Savannah',
  'Upper East', 'Upper West', 'Volta', 'Western', 'Western North',
];

// Same taxonomy renters filter by (components/FilterModal.js's Vehicle Class
// section, sent as attrs[25][] in services/carsApi.js) - moved here so the
// vendor-side picker and the renter-side filter share one source instead of
// two copies drifting apart.
export const VEHICLE_CLASSES = [
  { value: 'luxury', label: 'Luxury' },
  { value: 'economy-1', label: 'Comfort' },
  { value: 'economy-2', label: 'Economy' },
];

// Real "Car Type" attribute (attr_id 9) values - reuses data/cars.js's
// CATEGORIES (the Home screen's category chips), minus its UI-only "All"
// option, which isn't a real car attribute a vendor could pick.
export const VEHICLE_TYPES = CATEGORIES.filter((c) => c.value !== 'All');

// {id, slug, title} mirrors the shape components/FeaturesSection.js already
// expects on the renter side (feature.id as key, feature.slug for its icon
// lookup, feature.title as the display label) - every slug here has a real
// icon mapped in FEATURE_ICONS there, not the generic fallback.
export const CAR_FEATURES = [
  { id: 'airbag', slug: 'airbag', title: 'Airbags' },
  { id: 'bluetooth', slug: 'bluetooth', title: 'Bluetooth' },
  { id: 'fm-radio', slug: 'fm-radio', title: 'FM Radio' },
  { id: 'backup-camera', slug: 'backup-camera', title: 'Backup Camera' },
  { id: 'cruise-control', slug: 'cruise-control', title: 'Cruise Control' },
  { id: 'lane-assist', slug: 'lane-assist', title: 'Lane Assist' },
  { id: 'navigation-system', slug: 'navigation-system', title: 'Navigation System' },
  { id: 'apple-carplay-android-auto', slug: 'apple-carplay-android-auto', title: 'Apple CarPlay / Android Auto' },
  { id: 'multi-function-display', slug: 'multi-function-display', title: 'Multi-Function Display' },
  { id: 'push-to-start', slug: 'push-to-start', title: 'Push-to-Start' },
  { id: 'remote-start', slug: 'remote-start', title: 'Remote Start' },
  { id: 'heated-seats', slug: 'heated-seats', title: 'Heated Seats' },
  { id: 'blind-spot-monitoring', slug: 'blind-spot-monitoring', title: 'Blind Spot Monitoring' },
  { id: 'steering-wheel', slug: 'steering-wheel', title: 'Steering Wheel Controls' },
];
