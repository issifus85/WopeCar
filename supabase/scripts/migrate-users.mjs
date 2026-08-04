// One-time migration: creates Supabase auth users for the Laravel vendors
// who own at least one of the 142 real cars being migrated (see the "Laravel
// -> Supabase Data Migration, Phase 1: Cars & Users" plan). Scoped to just
// these ~57 vendor accounts, not all 4,783 Laravel users - migrating renter
// accounts is a separate, later decision given the real user count turned
// out to be two orders of magnitude bigger than first estimated.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=<key> node supabase/scripts/migrate-users.mjs [--limit=N]
//
// The service_role key is read only from the environment - never hardcode
// it here or write it to any output file. --limit=N runs only the first N
// vendor users, for a small test batch before the full run (see the plan's
// verification step 2).
//
// Output: supabase/scripts/data/user-id-map.json - {laravelId: supabaseUuid}
// for migrate-cars.mjs to consume, plus supabase/scripts/data/password-reset-links.json
// - recovery links generated but NOT sent automatically. Review these and
// decide how to notify vendors (email blast vs. direct outreach) rather than
// having this script silently email real business partners.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');

const SUPABASE_URL = 'https://qvactycnufaowwsiqdrz.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY env var is required. Example:');
  console.error('  SUPABASE_SERVICE_ROLE_KEY=... node supabase/scripts/migrate-users.mjs');
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

async function main() {
  const cars = loadJson('bravo_cars.json');
  const allUsers = loadJson('users.json');

  const vendorIds = [...new Set(cars.map((c) => c.author_id).filter((id) => id != null))];
  console.log(`Found ${vendorIds.length} distinct vendor user ids referenced by ${cars.length} cars.`);

  const usersById = new Map(allUsers.map((u) => [u.id, u]));
  let vendorUsers = vendorIds
    .map((id) => usersById.get(id))
    .filter(Boolean);

  const missing = vendorIds.filter((id) => !usersById.has(id));
  if (missing.length) {
    console.warn(`WARNING: ${missing.length} author_id(s) not found in users.json (deleted/orphaned Laravel users?):`, missing);
  }

  if (LIMIT) {
    vendorUsers = vendorUsers.slice(0, LIMIT);
    console.log(`--limit=${LIMIT} set - running only the first ${vendorUsers.length} vendor users.`);
  }

  const idMap = {};
  const resetLinks = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const u of vendorUsers) {
    if (!u.email) {
      console.warn(`Skipping Laravel user ${u.id} - no email on file.`);
      skipped++;
      continue;
    }

    const { data: created_, error } = await supabase.auth.admin.createUser({
      email: u.email,
      email_confirm: true,
      user_metadata: {
        full_name: u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || null,
        phone: u.phone || null,
        role: 'vendor',
      },
    });

    if (error) {
      // Already exists is expected on a re-run - look up the existing user
      // instead of treating it as a hard failure.
      if (error.message?.toLowerCase().includes('already been registered') || error.status === 422) {
        const { data: existing, error: lookupError } = await supabase.auth.admin.listUsers();
        const match = existing?.users?.find((x) => x.email === u.email);
        if (match) {
          idMap[u.id] = match.id;
          console.log(`Laravel user ${u.id} (${u.email}) already exists in Supabase - reusing ${match.id}.`);
          continue;
        }
        console.error(`Laravel user ${u.id} (${u.email}): reported as existing but not found via listUsers():`, lookupError?.message);
      }
      console.error(`FAILED to create Laravel user ${u.id} (${u.email}):`, error.message);
      failed++;
      continue;
    }

    idMap[u.id] = created_.user.id;
    created++;
    console.log(`Created Laravel user ${u.id} (${u.email}) -> ${created_.user.id}`);

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: u.email,
    });
    if (linkError) {
      console.warn(`  Could not generate reset link for ${u.email}:`, linkError.message);
    } else {
      resetLinks.push({ laravelId: u.id, email: u.email, link: linkData.properties?.action_link });
    }
  }

  writeFileSync(join(DATA_DIR, 'user-id-map.json'), JSON.stringify(idMap, null, 2));
  writeFileSync(join(DATA_DIR, 'password-reset-links.json'), JSON.stringify(resetLinks, null, 2));

  console.log('\n--- Summary ---');
  console.log(`Created: ${created}, skipped (no email): ${skipped}, failed: ${failed}`);
  console.log(`Wrote ${Object.keys(idMap).length} id mappings to supabase/scripts/data/user-id-map.json`);
  console.log(`Wrote ${resetLinks.length} password-reset links to supabase/scripts/data/password-reset-links.json`);
  console.log('These links are NOT sent automatically - review before notifying vendors.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
