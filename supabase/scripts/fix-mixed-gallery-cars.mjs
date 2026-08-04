// Fifth corrective pass: a follow-up to fix-car-photos-final.mjs's 4 fully-
// wrong-vehicle clears. Found by the user browsing the app: "another Corolla
// has elantra images". Investigation found the wrong photos weren't the
// car's *entire* gallery this time - they were an old, unfoldered batch of
// media ids mixed into the front of an otherwise-correct gallery that also
// contains later, properly-named-folder photos of the real car (e.g. Laravel
// id 62 "HONDA CR-V BLACK EDITION" has 8 old images literally named
// kia-forte-front-2.jpg/kia-forte-back-2.jpg ahead of 10 real photos from a
// folder named "Tracy's Honda CRV"). Clearing the whole gallery like the
// last pass did would have thrown away real, correct photos - this script
// keeps only the verified-correct batch for each of the 4 confirmed cases:
//   - id 33  "TOYOTA RAV 4"            -> old batch was a Honda CR-V
//   - id 59  "TOYOTA COROLLA"          -> old batch was a Hyundai Elantra
//   - id 62  "HONDA CR-V BLACK EDITION"-> old batch was a Kia Forte
//   - id 65  "HONDA HR-V"              -> old batch was a Hyundai Santa Fe
// Every other multi-folder gallery among the active listings was checked by
// hand in the same pass and found fine (folder-name mismatches that turned
// out to be the same car under a misleading/misspelled folder name).
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=<key> node supabase/scripts/fix-mixed-gallery-cars.mjs

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

// Laravel id -> Supabase car uuid, and the media ids that belong to the
// REAL vehicle's correctly-named photo folder (verified by eye - see header
// comment above for which vendor folder each came from).
const FIXES = {
  33: { uuid: '66687cf9-c28c-4f40-aac3-1c78bfcdb7ce', name: 'TOYOTA RAV 4', keepIds: ['3187', '3192', '3193', '3191', '3212', '3213', '3195', '3214', '3211', '3189', '3196', '3197'] },
  59: { uuid: '42acbc84-51b7-45fc-89b7-52910b4291e5', name: 'TOYOTA COROLLA', keepIds: ['2353', '2354', '2355', '2356', '2359', '2357', '2358', '2364', '2360', '2361', '2362', '2365'] },
  62: { uuid: '68e8d3a6-21a4-4892-b50a-d8ae0bba89af', name: 'HONDA CR-V BLACK EDITION', keepIds: ['2591', '2595', '2592', '2593', '2589', '2583', '2585', '2586', '2596', '2608'] },
  65: { uuid: '22bed751-7a3b-465b-8364-4aa76ec92b2a', name: 'HONDA HR-V', keepIds: ['2293', '2290', '2339', '2292', '2291', '2294', '2295', '2297', '2296', '2298', '2300', '2299'] },
};

async function main() {
  const mediaById = loadMediaFileMap();

  for (const [laravelId, fix] of Object.entries(FIXES)) {
    const images = fix.keepIds
      .map((id) => mediaById.get(id))
      .filter(Boolean)
      .map((path) => `${PROD_UPLOADS_BASE}/${path}`);

    if (images.length !== fix.keepIds.length) {
      console.warn(`car ${laravelId} (${fix.name}): expected ${fix.keepIds.length} resolvable media ids, got ${images.length} - check media_files.csv is current.`);
    }

    const { data, error } = await supabase
      .from('cars')
      .update({ images })
      .eq('id', fix.uuid)
      .select('id, name');
    if (error) {
      console.error(`FAILED car ${laravelId} (${fix.name}):`, error.message);
      continue;
    }
    if (!data || !data.length) {
      console.warn(`car ${laravelId} (${fix.name}): no row updated (uuid not found?)`);
      continue;
    }
    console.log(`Fixed car ${laravelId} (${data[0].name}) -> ${images.length} correct photo(s) kept, wrong batch dropped.`);
  }
}

main().catch((err) => {
  console.error('Correction failed:', err);
  process.exit(1);
});
