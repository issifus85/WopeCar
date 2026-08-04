// Second corrective pass, on top of fix-car-data.mjs.
//
// Bug found after that pass ran: stripHtml() (in both migrate-cars.mjs and
// fix-car-data.mjs) only ever stripped HTML *tags* via regex - it never
// decoded HTML *entities* (&nbsp;, &ndash;, &rsquo;, &amp;, etc). Laravel's
// rich-text editor output is full of these (especially &nbsp; used for
// indentation in the rental terms boilerplate), so every migrated
// description/cancellation_policy has literal "&nbsp;" text sitting in it
// instead of a space - confirmed visually via a screenshot of the Car
// Detail screen. This re-derives both fields from the same raw `content`/
// `cancel_policy`/`cancellation` source, this time decoding entities too.
//
// Also removes 3 more test listings ("Test My Car", "Test Selfdrive Car",
// "Test Car for Mail" - Laravel ids 69/70/72) that slipped through the
// original migration's narrow exact-title test-data filter.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=<key> node supabase/scripts/fix-car-descriptions.mjs

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

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function loadJson(name) {
  return JSON.parse(readFileSync(join(DATA_DIR, name), 'utf-8'));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Named entities actually observed in this content, plus generic numeric
// entity decoding (&#123; / &#x1F;) - covers everything without pulling in
// a new npm dependency for a one-time script.
const NAMED_ENTITIES = {
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  hellip: '…',
  trade: '™',
  copy: '©',
  reg: '®',
  deg: '°',
  middot: '·',
  bull: '•',
};

function decodeEntities(str) {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (match, name) => NAMED_ENTITIES[name] ?? match);
}

function stripHtml(html) {
  const noTags = (html || '').replace(/<[^>]*>/g, '');
  return decodeEntities(noTags).replace(/[ \t]+/g, ' ').trim();
}

const REMOVE_LARAVEL_IDS = new Set([69, 70, 72]);

async function main() {
  const carIdMap = loadJson('car-id-map.json');
  const bravoCars = loadJson('bravo_cars.json');
  const byId = new Map(bravoCars.map((c) => [c.id, c]));

  const entries = Object.entries(carIdMap).map(([laravelId, uuid]) => [Number(laravelId), uuid]);
  console.log(`${entries.length} cars to process.`);

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
      const updateRow = {
        description: stripHtml(raw.content),
        cancellation_policy: stripHtml(raw.cancel_policy || raw.cancellation),
      };

      const { error } = await supabase.from('cars').update(updateRow).eq('id', uuid);
      if (error) throw new Error(error.message);

      console.log(`Fixed description for car ${laravelId} (${raw.title}) -> ${uuid}`);
      updated++;
    } catch (err) {
      failed++;
      console.error(`FAILED car ${laravelId} (${raw.title}):`, err.message);
    }

    await sleep(30);
  }

  console.log('\n--- Summary ---');
  console.log(`Updated: ${updated}, removed: ${removed}, failed: ${failed}`);
}

main().catch((err) => {
  console.error('Correction failed:', err);
  process.exit(1);
});
