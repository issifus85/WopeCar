import { CATEGORIES } from '../data/cars';

// Reference data for the vendor "Add a Car" wizard - real manufacturer/model
// names (not fabricated specs), covering makes commonly seen on the Ghana
// market. Used to power the searchable Make/Model pickers in
// app/vendor/add-car/index.js.
export const VEHICLE_MAKES = [
  { make: 'Toyota', models: ['Camry', 'Corolla', 'Corolla Cross', 'RAV4', 'Highlander', 'Land Cruiser', 'Land Cruiser V8', 'Land Cruiser Prado', 'Hilux', 'Hiace', 'Yaris', 'Avalon', 'Sienna', '4-Runner', 'Fortuner'] },
  { make: 'Hyundai', models: ['Elantra', 'Tucson', 'Santa Fe', 'Sonata', 'Accent', 'i10', 'i20', 'Creta', 'Palisade', 'Venue', 'H1', 'ix35'] },
  { make: 'Kia', models: ['Sportage', 'Picanto', 'Rio', 'Sorento', 'Sonet', 'Seltos', 'Cerato', 'Soul', 'Forte'] },
  { make: 'Nissan', models: ['Altima', 'Sentra', 'X-Trail', 'Rogue', 'Pathfinder', 'Navara', 'Patrol', 'Micra', 'Qashqai'] },
  { make: 'Honda', models: ['Civic', 'Accord', 'CR-V', 'HR-V', 'Pilot', 'City', 'Fit'] },
  { make: 'Ford', models: ['Focus', 'Fusion', 'Explorer', 'Escape', 'Ranger', 'EcoSport', 'Everest'] },
  { make: 'Chevrolet', models: ['Cruze', 'Malibu', 'Captiva', 'Trailblazer', 'Spark'] },
  { make: 'Mercedes-Benz', models: ['A-Class', 'B-Class', 'C-Class', 'E-Class', 'S-Class', 'CLA', 'CLS', 'GLA', 'GLB', 'GLC', 'GLK', 'GLE', 'GLS', 'ML-Class', 'GL-Class', 'G-Class', 'Sprinter', 'Vito', 'Viano', 'V-Class'] },
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
  { make: 'Infiniti', models: ['QX80', 'QX60', 'QX50', 'Q50', 'Q60'] },
  { make: 'Kantanka', models: ['Onantefo'] },
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

// City/area suggestions per region for the vendor/admin car edit forms'
// location picker - same 16 region names as GHANA_REGIONS above (kept
// separate since that export is also used unrelatedly for the
// regional-addons fee toggle list). Admins/vendors can still search any
// address via LocationSearchModal's Places search; this only feeds the
// SearchableOptionModal region picker, matching wopecar-admin's equivalent
// (lib/constants/vehicleCatalog.ts's GHANA_CITIES_BY_REGION).
export const GHANA_CITIES_BY_REGION = {
  'Greater Accra': ['Accra', 'Osu', 'Labone', 'Cantonments', 'East Legon', 'Tema', 'Madina', 'Adenta', 'Dansoman', 'Achimota', 'Spintex', 'Teshie', 'Labadi', 'Kaneshie', 'Airport Residential'],
  Ashanti: ['Kumasi', 'Adum', 'Suame', 'Bantama', 'Asokwa', 'Ejisu', 'Bekwai', 'Mampong', 'Obuasi', 'Konongo'],
  Western: ['Takoradi', 'Sekondi', 'Tarkwa', 'Axim', 'Prestea', 'Elubo', 'Shama'],
  'Western North': ['Sefwi Wiawso', 'Bibiani', 'Juaboso', 'Enchi', 'Dadieso'],
  Central: ['Cape Coast', 'Elmina', 'Winneba', 'Mankessim', 'Saltpond', 'Swedru', 'Assin Fosu', 'Dunkwa'],
  Eastern: ['Koforidua', 'Nkawkaw', 'Suhum', 'Akim Oda', 'Nsawam', 'Aburi', 'Akosombo', 'Somanya', 'Kade'],
  Volta: ['Ho', 'Hohoe', 'Keta', 'Aflao', 'Denu', 'Sogakope', 'Kpando'],
  Oti: ['Dambai', 'Nkwanta', 'Worawora', 'Kpassa'],
  Bono: ['Sunyani', 'Berekum', 'Dormaa Ahenkro', 'Wenchi'],
  'Bono East': ['Techiman', 'Kintampo', 'Atebubu', 'Nkoranza'],
  Ahafo: ['Goaso', 'Bechem', 'Duayaw Nkwanta'],
  Northern: ['Tamale', 'Yendi', 'Savelugu', 'Tolon', 'Bimbilla'],
  Savannah: ['Damongo', 'Bole', 'Salaga', 'Buipe'],
  'North East': ['Nalerigu', 'Gambaga', 'Walewale', 'Bunkpurugu'],
  'Upper East': ['Bolgatanga', 'Bawku', 'Navrongo', 'Zebilla'],
  'Upper West': ['Wa', 'Lawra', 'Nandom', 'Jirapa'],
};

// Best-effort split of a legacy free-text location into {region, city} for
// form prefill - exact region-name substring match, same rule as the DB
// trigger's primary branch (set_car_region_id_from_location, migration
// 0062). Returns region: '' when nothing matches, so the vendor/admin picks
// one explicitly rather than silently guessing wrong.
export function splitLocation(location) {
  if (!location) return { region: '', city: '' };
  const matched = GHANA_REGIONS.find((r) => location.toLowerCase().includes(r.toLowerCase()));
  if (!matched) return { region: '', city: location };
  const city = location
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !part.toLowerCase().includes(matched.toLowerCase()))
    .join(', ');
  return { region: matched, city };
}

export function joinLocation(region, city) {
  if (region && city) return `${city}, ${region}`;
  return city || region;
}

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
