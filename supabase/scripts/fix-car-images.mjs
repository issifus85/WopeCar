// Third and final corrective pass on the migrated cars.
//
// The first two corrective scripts (fix-car-data.mjs, fix-car-descriptions.mjs)
// established that the *live API enrichment* migrate-cars.mjs originally used
// to fill in gallery/make/model/etc. was hitting wopecarpreprod.com, which
// turned out to be a genuinely separate database (wopeca5_dev) from
// production (wopeca5_wopecar) - confirmed via each site's own .env
// DB_DATABASE value. The raw SQL export (bravo_cars.json etc.) was correctly
// pulled from production the whole time, so make/model/year/type/features/
// description were already fixed correctly by the first two scripts using
// that raw data.
//
// Images were the one field with no raw fallback - bravo_cars.json's
// `gallery` column is just a CSV of numeric media ids, and there was no
// exported id->file mapping. That mapping now exists: `media_files.csv`, a
// full export of production's own media_files table (id, file_name,
// file_path, ...). Confirmed by direct request that production serves real
// files at https://wopecar.com/uploads/{file_path} (wopecarpreprod.com
// does not - separate storage, matching its separate database). This
// script resolves every car's real gallery ids against that table and
// writes real, correct, production-sourced image URLs - no live API call
// of any kind needed.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=<key> node supabase/scripts/fix-car-images.mjs

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');

const SUPABASE_URL = 'https://qvactycnufaowwsiqdrz.supabase.co';
const PROD_UPLOADS_BASE = 'https://wopecar.com/uploads';
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

// Minimal quoted-CSV line parser (handles "" escaped quotes) - no new
// dependency needed for a one-time script.
function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else cur += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

function loadMediaFileMap() {
  const raw = readFileSync(join(DATA_DIR, 'media_files.csv'), 'utf-8');
  const lines = raw.split('\n').filter(Boolean);
  const cols = parseCsvLine(lines[0]);
  const idIdx = cols.indexOf('id');
  const pathIdx = cols.indexOf('file_path');
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const f = parseCsvLine(lines[i]);
    map.set(f[idIdx], f[pathIdx]);
  }
  return map;
}

async function main() {
  const carIdMap = loadJson('car-id-map.json');
  const bravoCars = loadJson('bravo_cars.json');
  const byId = new Map(bravoCars.map((c) => [c.id, c]));
  const mediaById = loadMediaFileMap();
  console.log(`Loaded ${mediaById.size} media file records.`);

  const entries = Object.entries(carIdMap).map(([laravelId, uuid]) => [Number(laravelId), uuid]);
  console.log(`${entries.length} previously-migrated cars to process.`);

  let updated = 0;
  let skippedNoGallery = 0;
  let skippedRemoved = 0;
  let failed = 0;
  let totalImagesSet = 0;

  for (const [laravelId, uuid] of entries) {
    const raw = byId.get(laravelId);
    if (!raw) {
      console.warn(`No raw row for car ${laravelId} - skipping.`);
      continue;
    }

    const galleryIds = (raw.gallery || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!galleryIds.length) {
      skippedNoGallery++;
      continue;
    }

    const images = galleryIds
      .map((id) => mediaById.get(id))
      .filter(Boolean)
      .map((path) => `${PROD_UPLOADS_BASE}/${path}`);

    if (!images.length) {
      skippedNoGallery++;
      continue;
    }

    try {
      const { data, error } = await supabase
        .from('cars')
        .update({ images })
        .eq('id', uuid)
        .select('id');
      if (error) throw new Error(error.message);
      if (!data || !data.length) {
        skippedRemoved++;
        continue; // row no longer exists (one of the earlier test-data removals)
      }
      console.log(`Set ${images.length} image(s) for car ${laravelId} (${raw.title}) -> ${uuid}`);
      updated++;
      totalImagesSet += images.length;
    } catch (err) {
      failed++;
      console.error(`FAILED car ${laravelId} (${raw.title}):`, err.message);
    }

    await sleep(20);
  }

  console.log('\n--- Summary ---');
  console.log(`Updated: ${updated} (${totalImagesSet} total images set)`);
  console.log(`Skipped - no gallery/no resolvable media: ${skippedNoGallery}`);
  console.log(`Skipped - row already removed: ${skippedRemoved}`);
  console.log(`Failed: ${failed}`);
}

main().catch((err) => {
  console.error('Correction failed:', err);
  process.exit(1);
});
