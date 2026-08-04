// One-time corrective pass over cars already imported by migrate-cars.mjs.
//
// Root cause (confirmed by direct investigation, not speculation): for a
// real subset of migrated cars, Laravel's live /api/cars/{id} endpoint is
// now serving a COMPLETELY DIFFERENT vehicle's data than what the raw SQL
// export (bravo_cars.json) had for that same id - different title, photos,
// description, price-appropriate specs, all internally consistent with each
// other but not with the id's original raw record. migrate-cars.mjs trusted
// raw data for `name`/title but live data for description/images/make/
// model/year/type/features, stitching two different cars into one row per
// affected id (e.g. Supabase's "TOYOTA 4RUNNER" row had Hyundai Elantra
// photos, description, make, model and year).
//
// Verified fix: bravo_car_term.json + bravo_terms.json (the same raw tables
// migrate-cars.mjs already uses for vehicle_class) reliably reconstruct
// make/model/year/type/features for every car checked, matching the raw
// title in every case - more reliable than the live API entirely, so this
// script sources those fields from raw term data unconditionally. `content`
// (description) is 100% reliable from the raw export in every case checked,
// so it's always preferred over live too. Only `images` has no raw fallback
// (bravo_cars.json's `gallery` column is bare numeric media ids with no
// exported URL mapping) - live gallery is only trusted when live's own
// title plausibly matches the raw title (the same signal that distinguishes
// the 24 genuinely-contaminated cars from the 28 legitimately-matching
// ones); otherwise images are left empty rather than risk keeping another
// car's photos.
//
// Two cars (Laravel ids 76, 80) were confirmed to be test-data pollution
// live ("Tata Nexon (Test)", "Shalini test car") occupying what were real
// listing ids at export time - removed entirely rather than corrected.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=<key> node supabase/scripts/fix-car-data.mjs

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
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

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function loadJson(name) {
  return JSON.parse(readFileSync(join(DATA_DIR, name), 'utf-8'));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, '').trim();
}

// Same vocabulary as migrate-cars.mjs.
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

// Confirmed live test-data pollution, not real listings - see header comment.
const REMOVE_LARAVEL_IDS = new Set([76, 80]);

function tokens(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^(20\d{2}|19\d{2})$/.test(w));
}

// True if every distinct significant word in the shorter title appears in
// the longer one - tolerates "NISSAN ROGUE" vs "Nissan Rogue 2020" (same
// car, live just appends the year) while correctly rejecting "TOYOTA RAV 4"
// vs "Hyundai Santa Fe 2018" (different car entirely).
function sameCarLikely(rawTitle, liveTitle) {
  if (!liveTitle) return false;
  const rt = new Set(tokens(rawTitle));
  const lt = new Set(tokens(liveTitle));
  if (!rt.size || !lt.size) return false;
  const overlap = [...rt].filter((w) => lt.has(w)).length;
  return overlap >= Math.min(rt.size, lt.size);
}

async function fetchLiveCarData(id) {
  try {
    const res = await fetch(`${LARAVEL_API_BASE}/cars/${id}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data;
  } catch {
    return null;
  }
}

function resolveAttrTerms(carId, attrId, carTermRows, termsById) {
  const wantedTermIds = new Set(
    Object.values(termsById).filter((t) => t.attr_id === attrId).map((t) => t.id)
  );
  return carTermRows
    .filter((ct) => ct.target_id === carId && wantedTermIds.has(ct.term_id))
    .map((ct) => termsById[ct.term_id]);
}

async function main() {
  const carIdMap = loadJson('car-id-map.json');
  const bravoCars = loadJson('bravo_cars.json');
  const byId = new Map(bravoCars.map((c) => [c.id, c]));
  const carTermRows = loadJson('bravo_car_term.json');
  const termsRaw = loadJson('bravo_terms.json');
  const termsById = Object.fromEntries(termsRaw.map((t) => [t.id, t]));

  const entries = Object.entries(carIdMap).map(([laravelId, uuid]) => [Number(laravelId), uuid]);
  console.log(`${entries.length} previously-migrated cars to process.`);

  let updated = 0;
  let removed = 0;
  let failed = 0;

  for (const [laravelId, uuid] of entries) {
    if (REMOVE_LARAVEL_IDS.has(laravelId)) {
      const { error } = await supabase.from('cars').delete().eq('id', uuid);
      if (error) {
        console.error(`FAILED to remove car ${laravelId} (${uuid}):`, error.message);
        failed++;
      } else {
        console.log(`Removed test-data car ${laravelId} -> ${uuid}`);
        removed++;
      }
      continue;
    }

    const raw = byId.get(laravelId);
    if (!raw) {
      console.warn(`No raw row for car ${laravelId} - skipping.`);
      continue;
    }

    try {
      const live = await fetchLiveCarData(laravelId);
      const trustLive = !!(live && live.title && sameCarLikely(raw.title, live.title));

      const make = resolveAttrTerms(laravelId, 17, carTermRows, termsById)[0]?.name || null;
      const model = resolveAttrTerms(laravelId, 18, carTermRows, termsById)[0]?.name || null;
      const yearName = resolveAttrTerms(laravelId, 19, carTermRows, termsById)[0]?.name || null;
      const year = yearName && /^\d{4}$/.test(yearName) ? parseInt(yearName, 10) : null;
      const typeName = (resolveAttrTerms(laravelId, 9, carTermRows, termsById)[0]?.name || '').trim().toLowerCase();
      const type = TYPE_NAME_TO_SLUG[typeName] || null;
      const features = resolveAttrTerms(laravelId, 10, carTermRows, termsById)
        .map((t) => t.slug)
        .filter(Boolean);

      const images = trustLive ? (live.gallery || []).filter(Boolean) : [];

      const updateRow = {
        make,
        model,
        year,
        type,
        features,
        images,
        description: stripHtml(raw.content),
      };

      const { error } = await supabase.from('cars').update(updateRow).eq('id', uuid);
      if (error) throw new Error(error.message);

      console.log(`Updated car ${laravelId} (${raw.title}) -> ${uuid} [trustLive=${trustLive}, images=${images.length}]`);
      updated++;
    } catch (err) {
      failed++;
      console.error(`FAILED car ${laravelId} (${raw.title}):`, err.message);
    }

    await sleep(80);
  }

  console.log('\n--- Summary ---');
  console.log(`Updated: ${updated}, removed: ${removed}, failed: ${failed}`);
}

main().catch((err) => {
  console.error('Correction failed:', err);
  process.exit(1);
});
