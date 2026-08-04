// One-time migration: imports real Laravel car listings into Supabase's
// `cars`/`vendors` tables (see the "Laravel -> Supabase Data Migration,
// Phase 1: Cars & Users" plan). Run migrate-users.mjs first - this script
// reads its output (supabase/scripts/data/user-id-map.json) to link cars to
// their migrated vendor's Supabase uuid.
//
// Combines two data sources deliberately:
//   - Raw exported MySQL rows (bravo_cars.json) for fields Laravel's public
//     API doesn't expose at all (status, min_day_stays/min_day_before_booking)
//     or that are more reliable straight from the table (author_id).
//   - Laravel's LIVE /api/cars/{id} endpoint for everything it already
//     resolves correctly server-side (gallery -> real image URLs, terms ->
//     make/model/year/fuel/features, owner card, location name, cancel
//     policy) - reusing Laravel's own working business logic instead of
//     hand-reconstructing it from media_files/bravo_locations rows we don't
//     have exported. Confirmed empirically (see conversation) that the live
//     API does NOT expose attr_id=25 (Vehicle Class) though - that one still
//     needs the raw bravo_car_term/bravo_terms tables.
//
// 19 cars were confirmed as leftover template/test data (13 "Arrondissement
// de Paris" seed listings + 6 more titled "Test Car"/"testttt"/etc.) and are
// excluded from the import entirely, per the user's decision.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=<key> node supabase/scripts/migrate-cars.mjs [--limit=N]

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');

const SUPABASE_URL = 'https://qvactycnufaowwsiqdrz.supabase.co';
const LARAVEL_API_BASE = 'https://wopecarpreprod.com/api';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY env var is required.');
  process.exit(1);
}

const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function loadJson(name) {
  return JSON.parse(readFileSync(join(DATA_DIR, name), 'utf-8'));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Real Laravel Car Type term names (bravo_terms, attr_id=9) -> the slugs
// used both by the app's own filter chips and by 0007's widened check
// constraint.
const TYPE_NAME_TO_SLUG = {
  'convertibles': 'convertibles',
  'coupes': 'coupes',
  'hatchbacks': 'hatchbacks',
  'minivans': 'minivans',
  'sedan': 'sedan',
  'suvs': 'suvs',
  'trucks': 'trucks',
  'wagons': 'wagons',
  'buses': 'buses',
  'vans': 'vans',
  'mid size suvs': 'mid-size-suvs',
  'suvs/ 4x4s': 'suvs-4x4s',
  'suvs/4x4s': 'suvs-4x4s',
  'pickups': 'pickups',
};

// Real Vehicle Class term names (bravo_terms, attr_id=25) are messy/
// duplicated in the source data (e.g. two different terms both named
// "Luxury" with the same slug, one term named "Comfort" with slug
// "economy-1" and another named "Economy" with slug "economy-1" too) - map
// by name, not by Laravel's own inconsistent slug, into the app's actual
// vocabulary (constants/vehicleCatalog.js VEHICLE_CLASSES).
const VEHICLE_CLASS_NAME_TO_SLUG = {
  'luxury': 'luxury',
  'comfort': 'economy-1',
  'economy': 'economy-2',
};

const SEED_ADDRESS = 'Arrondissement de Paris';
const SEED_TITLES = new Set(['testing', 'testttt', 'test car', 'test']);

function isSeedOrTestCar(car) {
  if (car.address === SEED_ADDRESS) return true;
  const title = (car.title || '').trim().toLowerCase();
  return SEED_TITLES.has(title);
}

function normalizeGear(gear) {
  if (!gear) return null;
  const g = gear.toLowerCase();
  if (g.includes('auto')) return 'Automatic';
  if (g.includes('manual')) return 'Manual';
  return null;
}

function normalizeStatus(status) {
  if (status === 'publish') return 'active';
  if (status === 'pending') return 'pending';
  return 'inactive'; // draft, or anything else
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, '').trim();
}

// Returns null (not a throw) on failure - the live site is actively serving
// real traffic while this runs, and a handful of cars 404 on this endpoint
// for reasons unrelated to this migration (confirmed: status=publish,
// deleted_at=null, yet still 404s - not worth chasing down). Callers fall
// back to raw SQL data rather than losing the car entirely.
async function fetchLiveCarData(id) {
  try {
    const res = await fetch(`${LARAVEL_API_BASE}/cars/${id}`);
    if (!res.ok) {
      console.warn(`  Live API returned HTTP ${res.status} for car ${id} - falling back to raw SQL data only.`);
      return null;
    }
    const json = await res.json();
    return json.data;
  } catch (err) {
    console.warn(`  Live API request failed for car ${id} (${err.message}) - falling back to raw SQL data only.`);
    return null;
  }
}

function resolveVehicleClass(carId, carTermRows, termsById) {
  const vehicleClassTermIds = new Set(
    Object.values(termsById)
      .filter((t) => t.attr_id === 25)
      .map((t) => t.id)
  );
  const link = carTermRows.find((ct) => ct.target_id === carId && vehicleClassTermIds.has(ct.term_id));
  if (!link) return null;
  const term = termsById[link.term_id];
  const name = (term?.name || '').trim().toLowerCase();
  return VEHICLE_CLASS_NAME_TO_SLUG[name] || null;
}

async function ensureVendor(vendorCache, laravelUserId, userIdMap, usersById) {
  if (laravelUserId == null) return null;
  const supabaseUserId = userIdMap[laravelUserId];
  if (!supabaseUserId) return null;
  if (vendorCache.has(supabaseUserId)) return vendorCache.get(supabaseUserId);

  const { data: existing } = await supabase
    .from('vendors')
    .select('id')
    .eq('user_id', supabaseUserId)
    .maybeSingle();
  if (existing) {
    vendorCache.set(supabaseUserId, existing.id);
    return existing.id;
  }

  const laravelUser = usersById.get(laravelUserId);
  const { data: created, error } = await supabase
    .from('vendors')
    .insert({
      user_id: supabaseUserId,
      business_name: laravelUser?.business_name || laravelUser?.name || null,
      is_approved: true, // these are real, already-live listings on the current site
    })
    .select('id')
    .single();
  if (error) throw new Error(`Failed to create vendor for user ${supabaseUserId}: ${error.message}`);
  vendorCache.set(supabaseUserId, created.id);
  return created.id;
}

async function main() {
  const allCars = loadJson('bravo_cars.json');
  const userIdMap = loadJson('user-id-map.json');
  const allUsers = loadJson('users.json');
  const usersById = new Map(allUsers.map((u) => [u.id, u]));
  const carTermRows = loadJson('bravo_car_term.json');
  const termsRaw = loadJson('bravo_terms.json');
  const termsById = Object.fromEntries(termsRaw.map((t) => [t.id, t]));

  const { data: regions, error: regionsError } = await supabase.from('regions').select('id, name');
  if (regionsError) throw new Error(`Failed to load regions: ${regionsError.message}`);
  const regionIdByName = new Map(regions.map((r) => [r.name.toLowerCase(), r.id]));

  let realCars = allCars.filter((c) => !isSeedOrTestCar(c));
  console.log(`${allCars.length} total cars, ${allCars.length - realCars.length} excluded as seed/test, ${realCars.length} to import.`);

  // Resumable: skip cars already imported by a previous run (e.g. a small
  // --limit test batch before the full run) rather than re-inserting
  // duplicates - car-id-map.json accumulates across runs.
  const carIdMapPath = join(DATA_DIR, 'car-id-map.json');
  const carIdMap = existsSync(carIdMapPath) ? loadJson('car-id-map.json') : {};
  const alreadyImported = new Set(Object.keys(carIdMap).map(Number));
  if (alreadyImported.size) {
    const before = realCars.length;
    realCars = realCars.filter((c) => !alreadyImported.has(c.id));
    console.log(`Skipping ${before - realCars.length} car(s) already imported in a previous run.`);
  }

  if (LIMIT) {
    realCars = realCars.slice(0, LIMIT);
    console.log(`--limit=${LIMIT} set - importing only the first ${realCars.length}.`);
  }

  const vendorCache = new Map();
  let imported = 0;
  let failed = 0;
  let noVendor = 0;

  for (const car of realCars) {
    try {
      const vendorId = await ensureVendor(vendorCache, car.author_id, userIdMap, usersById);
      if (!vendorId) {
        noVendor++;
        console.warn(`Car ${car.id} (${car.title}): no migrated vendor for author_id=${car.author_id} - importing with vendor_id=null.`);
      }

      const live = await fetchLiveCarData(car.id);

      const typeName = (live?.type || '').trim().toLowerCase();
      const type = TYPE_NAME_TO_SLUG[typeName] || null;
      const vehicleClass = resolveVehicleClass(car.id, carTermRows, termsById);

      const featureTerms = live?.terms?.['10']?.child || [];
      const features = featureTerms.map((f) => f.slug);

      const make = live?.terms?.['17']?.child?.[0]?.title || null;
      const model = live?.terms?.['18']?.child?.[0]?.title || null;
      const yearStr = live?.terms?.['19']?.child?.[0]?.title || null;
      const year = yearStr && /^\d{4}$/.test(yearStr) ? parseInt(yearStr, 10) : null;

      const gallery = (live?.gallery || []).filter(Boolean);
      const images = gallery.length ? gallery : (live?.image ? [live.image] : []);

      const locationName = live?.location?.name || null;
      const location = locationName || car.address || null;
      const regionId = locationName ? regionIdByName.get(locationName.toLowerCase()) || null : null;

      const rawDrivenBy = live?.driven_by || car.driven_by;
      const driveType = rawDrivenBy === 'Self-drive' || rawDrivenBy === 'Chauffeur' ? rawDrivenBy : null;

      const insertRow = {
        vendor_id: vendorId,
        name: car.title,
        make,
        model,
        year,
        type,
        seats: car.passenger || null,
        transmission: normalizeGear(live?.gear || car.gear),
        drive_type: driveType,
        price_per_day: car.sale_price && car.sale_price < car.price ? car.sale_price : car.price,
        location,
        region_id: regionId,
        description: stripHtml(live?.content || car.content),
        features,
        images,
        status: normalizeStatus(car.status),
        min_booking_days: car.min_day_stays || 1,
        advance_notice: car.min_day_before_booking || 1,
        doors: car.door || null,
        baggage: car.baggage || null,
        vehicle_class: vehicleClass,
        cancellation_policy: stripHtml(live?.cancel_policy || live?.cancellation || car.cancel_policy || car.cancellation),
      };

      const { data: inserted, error } = await supabase.from('cars').insert(insertRow).select('id').single();
      if (error) throw new Error(error.message);

      carIdMap[car.id] = inserted.id;
      imported++;
      console.log(`Imported car ${car.id} (${car.title}) -> ${inserted.id}`);
    } catch (err) {
      failed++;
      console.error(`FAILED car ${car.id} (${car.title}):`, err.message);
    }

    await sleep(150); // be polite to the live Laravel API
  }

  writeFileSync(join(DATA_DIR, 'car-id-map.json'), JSON.stringify(carIdMap, null, 2));

  console.log('\n--- Summary ---');
  console.log(`Imported: ${imported}, failed: ${failed}, imported without a vendor link: ${noVendor}`);
  console.log(`Wrote ${Object.keys(carIdMap).length} id mappings to supabase/scripts/data/car-id-map.json`);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
