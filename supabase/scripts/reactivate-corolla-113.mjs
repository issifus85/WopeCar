// Reverts deactivate-duplicate-corolla.mjs: puts Laravel id 113's listing
// back to status=active per the user's request.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=<key> node supabase/scripts/reactivate-corolla-113.mjs

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

const UUID = 'a7385327-626a-4eb4-98be-ea4f86372872'; // Laravel id 113

async function main() {
  const { data, error } = await supabase
    .from('cars')
    .update({ status: 'active' })
    .eq('id', UUID)
    .select('id, name, status')
    .single();
  if (error) throw new Error(`Failed to update car: ${error.message}`);
  console.log(`After: ${data.name} (${data.id}) status=${data.status}`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
