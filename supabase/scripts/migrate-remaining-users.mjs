// Closes out the user migration migrate-users.mjs deliberately deferred:
// that script only covered the ~56 vendor accounts that own a real car
// listing. This script covers everyone else in the raw Laravel `users`
// export - renters, non-listing vendors, and WopeCar's own staff accounts -
// using the exact same mechanism (Supabase Admin API + a generated-but-
// unsent recovery link, since Laravel's bcrypt hashes can't be imported
// into Supabase Auth directly).
//
// Excludes 5 confirmed Bravo-template seed/demo users (ids 1,2,3,4,5 -
// "Vendor 01"/"Customer 01" plus 3 @bookingcore.test placeholder accounts;
// one of these, id 4, already has a stray Supabase account from the first
// migration run since migrate-users.mjs's vendor-id scope wasn't itself
// filtered for seed cars - harmless, left alone here, just not duplicated).
//
// Resumable like migrate-cars.mjs's car-id-map.json: re-running this script
// is safe - it skips anyone already present in user-id-map.json (including
// the 56 vendors from the first run) and the admin API's own "already
// registered" error is caught as a fallback too.
//
// Role metadata: role_id 2 (Laravel "vendor") -> 'vendor', everything else
// (3 "customer", 1 "administrator", null) -> 'renter' - matches the
// signup trigger's own 'renter' default and keeps the distinction that
// actually matters to the app (Vendor Mode gating), not Laravel's 3-way
// split. Staff accounts (role_id 1) additionally get `is_support = true`
// set directly in public.users in a follow-up pass, since the signup
// trigger (0006_update_signup_trigger.sql) only populates
// full_name/phone/role from metadata, not is_support.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=<key> node supabase/scripts/migrate-remaining-users.mjs [--limit=N]

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
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

const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function loadJson(name) {
  return JSON.parse(readFileSync(join(DATA_DIR, name), 'utf-8'));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Confirmed via direct inspection - see header comment.
const SEED_USER_IDS = new Set([1, 2, 3, 4, 5]);

// Looks up an existing Supabase auth user by email via public.users (kept
// in sync with auth.users by the signup trigger) instead of
// admin.listUsers(), which is paginated - at this scale a plain unpaginated
// scan silently misses real matches past the first page, turning a genuine
// "this email is already registered" into a false failure.
async function findExistingUserIdByEmail(email) {
  const { data, error } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
  if (error) {
    console.warn(`  Lookup by email failed for ${email}:`, error.message);
    return null;
  }
  return data?.id ?? null;
}

async function main() {
  const allUsers = loadJson('users.json');
  const userIdMapPath = join(DATA_DIR, 'user-id-map.json');
  const idMap = existsSync(userIdMapPath) ? loadJson('user-id-map.json') : {};
  const alreadyMigrated = new Set(Object.keys(idMap).map(Number));

  const deletedCount = allUsers.filter((u) => u.deleted_at && !SEED_USER_IDS.has(u.id) && !alreadyMigrated.has(u.id)).length;
  let toMigrate = allUsers.filter((u) => !SEED_USER_IDS.has(u.id) && !alreadyMigrated.has(u.id) && !u.deleted_at);
  console.log(`${allUsers.length} total Laravel users, ${SEED_USER_IDS.size} seed/demo excluded, ${deletedCount} soft-deleted (deleted_at set) excluded, ${alreadyMigrated.size} already migrated, ${toMigrate.length} remaining.`);

  if (LIMIT) {
    toMigrate = toMigrate.slice(0, LIMIT);
    console.log(`--limit=${LIMIT} set - running only the first ${toMigrate.length}.`);
  }

  const resetLinks = [];
  let created = 0;
  let reused = 0;
  let skipped = 0;
  let failed = 0;

  for (const u of toMigrate) {
    if (!u.email) {
      console.warn(`Skipping Laravel user ${u.id} - no email on file.`);
      skipped++;
      continue;
    }

    const role = u.role_id === 2 ? 'vendor' : 'renter';

    const { data: created_, error } = await supabase.auth.admin.createUser({
      email: u.email,
      email_confirm: true,
      user_metadata: {
        full_name: u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || null,
        phone: u.phone || null,
        role,
      },
    });

    if (error) {
      if (error.message?.toLowerCase().includes('already been registered') || error.status === 422) {
        const matchId = await findExistingUserIdByEmail(u.email);
        if (matchId) {
          idMap[u.id] = matchId;
          reused++;
          console.log(`Laravel user ${u.id} (${u.email}) already exists in Supabase - reusing ${matchId}.`);
          continue;
        }
        console.error(`Laravel user ${u.id} (${u.email}): reported as existing but not found in public.users - possible auth/profile row mismatch, needs manual look.`);
      }
      console.error(`FAILED to create Laravel user ${u.id} (${u.email}):`, error.message);
      failed++;
      continue;
    }

    idMap[u.id] = created_.user.id;
    created++;
    if (created % 100 === 0) {
      console.log(`... ${created} created so far (latest: Laravel user ${u.id}, ${u.email})`);
      // Persist progress periodically, not just at the very end, so a run
      // that's interrupted partway through doesn't lose everything already
      // done - re-running picks up from here via alreadyMigrated.
      writeFileSync(userIdMapPath, JSON.stringify(idMap, null, 2));
    }

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: u.email,
    });
    if (linkError) {
      console.warn(`  Could not generate reset link for ${u.email}:`, linkError.message);
    } else {
      resetLinks.push({ laravelId: u.id, email: u.email, link: linkData.properties?.action_link });
    }

    await sleep(50);
  }

  writeFileSync(userIdMapPath, JSON.stringify(idMap, null, 2));
  writeFileSync(join(DATA_DIR, 'password-reset-links-remaining-users.json'), JSON.stringify(resetLinks, null, 2));

  console.log('\n--- Summary ---');
  console.log(`Created: ${created}, reused (already existed): ${reused}, skipped (no email): ${skipped}, failed: ${failed}`);
  console.log(`Total id mappings now in user-id-map.json: ${Object.keys(idMap).length}`);
  console.log(`Wrote ${resetLinks.length} password-reset links to supabase/scripts/data/password-reset-links-remaining-users.json`);
  console.log('These links are NOT sent automatically - decide how to notify users before sending anything.');

  // Every role_id=1 (Laravel "administrator") user, not just ones created
  // in this run - several staff accounts were already migrated back in the
  // first (vendor-scoped) pass since they also own a car listing, so
  // is_support needs backfilling for those too, not just today's new ones.
  const allStaffIds = allUsers.filter((u) => u.role_id === 1).map((u) => u.id);
  const staffWithAccount = allStaffIds.filter((id) => idMap[id]);
  console.log(`\n${staffWithAccount.length} of ${allStaffIds.length} staff/admin account(s) (role_id=1) have a Supabase auth account - setting is_support=true...`);
  for (const laravelId of staffWithAccount) {
    const uuid = idMap[laravelId];
    const { error: updErr } = await supabase.from('users').update({ is_support: true }).eq('id', uuid);
    if (updErr) console.error(`  Failed to set is_support for Laravel user ${laravelId}:`, updErr.message);
    else console.log(`  Set is_support=true for Laravel user ${laravelId} -> ${uuid}`);
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
