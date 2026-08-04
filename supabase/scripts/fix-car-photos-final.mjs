// Fourth corrective pass on migrated car photos + a read-only vendor-mapping
// verification, in response to a user report that a few listings still show
// visibly wrong photos ("TOYOTA COASTER" showing a red Hyundai Elantra,
// etc.) even after the media-table-based fix-car-images.mjs pass.
//
// Root cause for the wrong-photo cars (confirmed via direct visual
// inspection of each car's real production photos, not a script bug): the
// SOURCE `bravo_cars.gallery` value for these specific rows genuinely points
// at another vehicle's media - most likely a relisted/repurposed listing
// whose gallery was never updated. No script can "fix" this since the
// correct photos were never captured anywhere we have access to - the only
// honest fix is to clear the wrong photos rather than show them.
//
// This script does three independent things in one run:
//   1. Clears `images` to [] for the small set of cars confirmed wrong by
//      eye (see CONFIRMED_WRONG_PHOTOS below).
//   2. For every other migrated car, HEAD-checks each of its current image
//      URLs against the live server and strips any that 404, keeping the
//      rest (some cars have a handful of broken links mixed with otherwise-
//      correct photos - blanking the whole car would lose real, working
//      photos for no reason).
//   3. Read-only: verifies every migrated car's vendor_id actually resolves
//      (via vendors.user_id) back to the same Laravel user as the car's own
//      raw author_id. Needs the service role key because `vendors` has no
//      public read policy, so this couldn't be checked with the app's own
//      anon key.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=<key> node supabase/scripts/fix-car-photos-final.mjs
//   SUPABASE_SERVICE_ROLE_KEY=<key> node supabase/scripts/fix-car-photos-final.mjs --verify-only

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');

const SUPABASE_URL = 'https://qvactycnufaowwsiqdrz.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY env var is required.');
  process.exit(1);
}
const VERIFY_ONLY = process.argv.includes('--verify-only');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function loadJson(name) {
  return JSON.parse(readFileSync(join(DATA_DIR, name), 'utf-8'));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Laravel ids confirmed by direct visual inspection to have another
// vehicle's photos in their gallery - see conversation for the
// title/actual-photo mismatch for each.
const CONFIRMED_WRONG_PHOTOS = new Set([
  28, // "TOYOTA COASTER" -> actually a red Hyundai Elantra
  51, // "Honda e:NP2" -> actually a Mitsubishi (diamond badge grille)
  52, // "TOYOTA LANDCRUISER PRADO" -> actually a Chevrolet (bowtie badge)
  55, // "TOYOTA PRADO" -> actually a white Hyundai Elantra
]);

async function urlIsBroken(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (res.status === 404) return true;
    if (res.ok) return false;
    // Some CDNs/proxies don't support HEAD - fall back to a ranged GET.
    const res2 = await fetch(url, { headers: { Range: 'bytes=0-0' } });
    return res2.status === 404;
  } catch {
    return false; // network hiccup - don't punish a working image for a flaky check
  }
}

async function fixPhotos(carIdMap, bravoCarsById) {
  const { data: cars, error } = await supabase.from('cars').select('id, name, images');
  if (error) throw new Error(`Failed to load cars: ${error.message}`);
  const carById = new Map(cars.map((c) => [c.id, c]));

  let cleared = 0;
  let filtered = 0;
  let totalUrlsRemoved = 0;
  let unchanged = 0;
  let failed = 0;

  for (const [laravelIdStr, uuid] of Object.entries(carIdMap)) {
    const laravelId = Number(laravelIdStr);
    const car = carById.get(uuid);
    if (!car) continue; // already-removed row from an earlier pass

    if (CONFIRMED_WRONG_PHOTOS.has(laravelId)) {
      if (!car.images || car.images.length === 0) { unchanged++; continue; }
      try {
        const { error: updErr } = await supabase.from('cars').update({ images: [] }).eq('id', uuid);
        if (updErr) throw new Error(updErr.message);
        console.log(`Cleared ${car.images.length} wrong photo(s) for car ${laravelId} (${car.name})`);
        cleared++;
      } catch (err) {
        failed++;
        console.error(`FAILED clearing car ${laravelId} (${car.name}):`, err.message);
      }
      await sleep(20);
      continue;
    }

    const images = car.images || [];
    if (!images.length) { unchanged++; continue; }

    const checks = await Promise.all(images.map(urlIsBroken));
    const kept = images.filter((_, i) => !checks[i]);
    const removedCount = images.length - kept.length;

    if (removedCount === 0) { unchanged++; continue; }

    try {
      const { error: updErr } = await supabase.from('cars').update({ images: kept }).eq('id', uuid);
      if (updErr) throw new Error(updErr.message);
      console.log(`Removed ${removedCount} broken image(s) for car ${laravelId} (${car.name}) - ${kept.length} remain`);
      filtered++;
      totalUrlsRemoved += removedCount;
    } catch (err) {
      failed++;
      console.error(`FAILED filtering car ${laravelId} (${car.name}):`, err.message);
    }
    await sleep(20);
  }

  console.log('\n--- Photo fix summary ---');
  console.log(`Cleared (confirmed wrong vehicle): ${cleared}`);
  console.log(`Filtered (had some broken links): ${filtered} (${totalUrlsRemoved} broken URLs removed total)`);
  console.log(`Unchanged (already fine): ${unchanged}`);
  console.log(`Failed: ${failed}`);
}

async function verifyVendorMapping(carIdMap, bravoCarsById, userIdMap) {
  const { data: cars, error: carsErr } = await supabase.from('cars').select('id, name, vendor_id');
  if (carsErr) throw new Error(`Failed to load cars: ${carsErr.message}`);
  const { data: vendors, error: vendorsErr } = await supabase.from('vendors').select('id, user_id, business_name');
  if (vendorsErr) throw new Error(`Failed to load vendors: ${vendorsErr.message}`);
  const carById = new Map(cars.map((c) => [c.id, c]));
  const vendorById = new Map(vendors.map((v) => [v.id, v]));

  let checked = 0, correct = 0, wrong = 0;
  const problems = [];

  for (const [laravelIdStr, uuid] of Object.entries(carIdMap)) {
    const laravelId = Number(laravelIdStr);
    const raw = bravoCarsById.get(laravelId);
    if (!raw) continue;
    const car = carById.get(uuid);
    if (!car) continue;

    checked++;
    const expectedUserId = userIdMap[raw.author_id];
    if (!expectedUserId) {
      problems.push(`car ${laravelId} (${car.name}): raw author_id=${raw.author_id} has no migrated vendor user, but car.vendor_id=${car.vendor_id ?? 'null'}`);
      wrong++;
      continue;
    }
    if (!car.vendor_id) {
      problems.push(`car ${laravelId} (${car.name}): vendor_id is NULL, expected user_id=${expectedUserId} (author_id=${raw.author_id})`);
      wrong++;
      continue;
    }
    const vendor = vendorById.get(car.vendor_id);
    if (!vendor) {
      problems.push(`car ${laravelId} (${car.name}): vendor_id=${car.vendor_id} does not exist in vendors table`);
      wrong++;
      continue;
    }
    if (vendor.user_id !== expectedUserId) {
      problems.push(`car ${laravelId} (${car.name}): vendor_id=${car.vendor_id} -> user_id=${vendor.user_id}, but raw author_id=${raw.author_id} maps to user_id=${expectedUserId}`);
      wrong++;
      continue;
    }
    correct++;
  }

  console.log('\n--- Vendor mapping verification ---');
  console.log(`Checked: ${checked}, Correct: ${correct}, Wrong: ${wrong}`);
  console.log(`Total vendors in Supabase: ${vendors.length}`);
  if (problems.length) {
    console.log('\nProblems:');
    problems.forEach((p) => console.log(' - ' + p));
  }
}

async function main() {
  const carIdMap = loadJson('car-id-map.json');
  const bravoCars = loadJson('bravo_cars.json');
  const bravoCarsById = new Map(bravoCars.map((c) => [c.id, c]));
  const userIdMap = loadJson('user-id-map.json');

  if (!VERIFY_ONLY) {
    await fixPhotos(carIdMap, bravoCarsById);
  }
  await verifyVendorMapping(carIdMap, bravoCarsById, userIdMap);
}

main().catch((err) => {
  console.error('Correction failed:', err);
  process.exit(1);
});
