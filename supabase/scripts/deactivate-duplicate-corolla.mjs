// One-time cleanup: Laravel ids 113 and 119 are the same physical "TOYOTA
// COROLLA" (same vendor, same $700/day price, overlapping photos from the
// same shoot) listed twice in the source data - both currently status=active
// and both showing separately on the Home screen. Deactivating the older,
// less-complete listing (113) rather than deleting it, so it's recoverable
// if this call turns out to be wrong. See conversation for the full
// duplicate-detection pass this came out of.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=<key> node supabase/scripts/deactivate-duplicate-corolla.mjs

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qvactycnufaowwsiqdrz.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY env var is required.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DUPLICATE_UUID = 'a7385327-626a-4eb4-98be-ea4f86372872'; // Laravel id 113
const KEPT_UUID = '9c4af6b2-6988-4351-8d66-4a2711128bc7'; // Laravel id 119

async function main() {
  const { data: before, error: readErr } = await supabase
    .from('cars')
    .select('id, name, status')
    .eq('id', DUPLICATE_UUID)
    .single();
  if (readErr) throw new Error(`Failed to read car: ${readErr.message}`);
  console.log(`Before: ${before.name} (${before.id}) status=${before.status}`);

  const { data, error } = await supabase
    .from('cars')
    .update({ status: 'inactive' })
    .eq('id', DUPLICATE_UUID)
    .select('id, name, status')
    .single();
  if (error) throw new Error(`Failed to update car: ${error.message}`);

  console.log(`After: ${data.name} (${data.id}) status=${data.status}`);
  console.log(`Kept listing (unchanged): ${KEPT_UUID}`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
