// Sixth corrective pass: replaces every real car's `description` with the
// user-supplied marketing template, placeholders filled from that car's own
// real, already-migrated fields (year/make/model/location/features/seats/
// type/vehicle_class) - nothing fabricated per car, just template selection
// logic over real data.
//
// This also permanently drops the old Chauffeured/Self-Drive rental T&Cs
// block (and trailing wopecar.com link) that migrate-cars.mjs originally
// pasted into every single car's description verbatim - that content is
// now maintained once, in code, as constants/rentalTerms.js, and rendered
// by components/RentalTermsSection.js + the new /rental-terms screen
// instead of living as unformatted text on every car row. Keeping it in
// the database too would just be a second copy to keep in sync.
//
// Template (as given):
//   This [Year] [Make] [Model] is perfect for [road trips / city errands /
//   airport runs] around [your city/region].
//
//   ✔ [Feature]
//   ✔ [Feature]
//   ✔ [Feature]
//
//   What's included: [...]
//   Ideal for: [...]
//   Please note: [...]
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=<key> node supabase/scripts/set-car-descriptions.mjs
//   SUPABASE_SERVICE_ROLE_KEY=<key> node supabase/scripts/set-car-descriptions.mjs --dry-run

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qvactycnufaowwsiqdrz.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY env var is required.');
  process.exit(1);
}
const DRY_RUN = process.argv.includes('--dry-run');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mirrors constants/vehicleCatalog.js's CAR_FEATURES titles, plus the
// handful of real feature slugs in the migrated data that catalog doesn't
// cover (confirmed via a live distinct-values query against Supabase).
const FEATURE_LABELS = {
  'navigation-system': 'Built-in navigation system',
  'apple-carplay-android-auto': 'Apple CarPlay & Android Auto',
  'backup-camera': 'Backup camera',
  'cruise-control': 'Cruise control',
  'blind-spot-monitoring': 'Blind spot monitoring',
  'lane-assist': 'Lane assist',
  'sunroof': 'Sunroof',
  'panoramic-sunroof': 'Panoramic sunroof',
  'heated-seats': 'Heated seats',
  'push-to-start': 'Push-to-start ignition',
  'remote-start': 'Remote start',
  'multi-function-display': 'Multi-function display',
  'bluetooth': 'Bluetooth connectivity',
  'break-assist': 'Brake assist',
  'power-windows': 'Power windows',
  'airbag': 'Airbags',
  'sensor': 'Parking sensors',
  'fm-radio': 'FM radio',
  'steering-wheel': 'Steering wheel controls',
};
// Best-sellable-first order for picking exactly 3 bullets.
const FEATURE_PRIORITY = [
  'navigation-system', 'apple-carplay-android-auto', 'backup-camera', 'cruise-control',
  'blind-spot-monitoring', 'lane-assist', 'panoramic-sunroof', 'sunroof', 'heated-seats',
  'push-to-start', 'remote-start', 'multi-function-display', 'bluetooth', 'break-assist',
  'power-windows', 'airbag', 'sensor', 'fm-radio', 'steering-wheel',
];

const ROAD_TRIP_TYPES = new Set(['suvs-4x4s', 'mid-size-suvs', 'suvs', 'pickups', 'vans', 'buses', 'wagons']);
const FALLBACK_LOCATION = 'Accra';

function pickUseCase(car) {
  if (car.vehicle_class === 'luxury') return 'airport runs';
  if (ROAD_TRIP_TYPES.has(car.type)) return 'road trips';
  return 'city errands';
}

function pickFeatureBullets(car) {
  const present = new Set(car.features || []);
  const bullets = FEATURE_PRIORITY.filter((slug) => present.has(slug)).slice(0, 3).map((slug) => FEATURE_LABELS[slug]);
  if (bullets.length >= 3) return bullets;

  // Not enough catalog features on this car - pad with real spec facts
  // instead of leaving fewer than 3 bullets.
  const fallbacks = [];
  if (car.seats) fallbacks.push(`Seats up to ${car.seats} passengers`);
  if (car.transmission) fallbacks.push(`${car.transmission} transmission`);
  if (car.doors) fallbacks.push(`${car.doors}-door layout`);
  for (const f of fallbacks) {
    if (bullets.length >= 3) break;
    if (!bullets.includes(f)) bullets.push(f);
  }
  return bullets;
}

function pickWhatsIncluded(car) {
  return car.drive_type === 'Chauffeur'
    ? 'A professional chauffeur, a clean and inspected vehicle, and 24/7 customer support (fuel is not included).'
    : 'A clean, inspected vehicle with a documented condition report at pickup, and 24/7 customer support (fuel is not included).';
}

function pickIdealFor(car) {
  if (car.seats >= 7 || car.type === 'buses' || car.type === 'vans') {
    return 'Family trips, group travel, and airport pickups';
  }
  if (car.vehicle_class === 'luxury') {
    return 'Business travel, special occasions, and airport transfers';
  }
  return 'City driving, weekend getaways, and business trips';
}

const PLEASE_NOTE = 'Please return the vehicle with the same fuel level and interior condition as at pickup. Smoking is not permitted inside the vehicle.';

function formatLocation(rawLocation) {
  const trimmed = rawLocation?.trim();
  if (!trimmed) return FALLBACK_LOCATION;
  // Source data sometimes has comma-joined areas with no space, e.g.
  // "Accra,Osu" - reads better as "Accra, Osu".
  return trimmed.replace(/,\s*/g, ', ');
}

// Title-cases a raw listing name like "FORD TRANSIT" or "YUTONG 50-SEATER
// BUS" into "Ford Transit" / "Yutong 50-Seater Bus" - used only as a
// fallback for the ~15 cars whose source data never had a Model term
// assigned at all (mostly buses/vans, a genuine source-data gap, not a
// migration bug), so the template still reads naturally instead of
// rendering "undefined".
function titleCase(name) {
  return (name || '')
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

// [Year] [Make] [Model], gracefully degrading when structured fields are
// missing rather than rendering "undefined" into real listing copy.
function pickVehicleLabel(car) {
  const yearPrefix = car.year ? `${car.year} ` : '';
  if (car.make && car.model) return `${yearPrefix}${car.make} ${car.model}`;
  return `${yearPrefix}${titleCase(car.name)}`;
}

function buildDescription(car) {
  const useCase = pickUseCase(car);
  const location = formatLocation(car.location);
  const bullets = pickFeatureBullets(car);

  const lines = [
    `This ${pickVehicleLabel(car)} is perfect for ${useCase} around ${location}.`,
    '',
    ...bullets.map((b) => `✔ ${b}`),
    '',
    `What's included: ${pickWhatsIncluded(car)}`,
    '',
    `Ideal for: ${pickIdealFor(car)}`,
    '',
    `Please note: ${PLEASE_NOTE}`,
  ];
  return lines.join('\n');
}

async function main() {
  const { data: cars, error } = await supabase
    .from('cars')
    .select('id, name, make, model, year, location, features, seats, transmission, doors, type, vehicle_class, drive_type');
  if (error) throw new Error(`Failed to load cars: ${error.message}`);

  console.log(`${cars.length} cars to process${DRY_RUN ? ' (dry run - no writes)' : ''}.`);

  let updated = 0;
  let failed = 0;

  for (const car of cars) {
    const description = buildDescription(car);

    if (DRY_RUN) {
      console.log(`\n=== ${car.name} (${car.id}) ===\n${description}`);
      continue;
    }

    try {
      const { error: updErr } = await supabase.from('cars').update({ description }).eq('id', car.id);
      if (updErr) throw new Error(updErr.message);
      updated++;
    } catch (err) {
      failed++;
      console.error(`FAILED ${car.name} (${car.id}):`, err.message);
    }
    await sleep(20);
  }

  if (!DRY_RUN) {
    console.log('\n--- Summary ---');
    console.log(`Updated: ${updated}`);
    console.log(`Failed: ${failed}`);
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
