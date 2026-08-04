// Supabase Edge Function - real self-service account deletion.
//
// Why this needs to exist at all: the Supabase client SDK has no
// "delete my own account" call - deleting an auth.users row requires the
// service_role key, which must never reach client code. This function is
// the sanctioned, narrow bridge: it runs server-side (Deno), verifies the
// caller's identity and password itself, and only then uses service_role
// internally to do the actual delete.
//
// Deploy with: supabase functions deploy delete-account
// (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
// injected automatically by Supabase into every Edge Function's
// environment - no manual secret configuration needed.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header.' }, 401);
    }

    const { password } = await req.json();
    if (!password) {
      return jsonResponse({ error: 'Password is required to delete your account.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Step 1: identify the caller from their OWN access token. Anon-key
    // client scoped to just this request's Authorization header - never
    // service_role for this step, so this can only ever act as whoever is
    // actually calling.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: getUserError } = await callerClient.auth.getUser();
    if (getUserError || !user) {
      return jsonResponse({ error: 'Invalid or expired session.' }, 401);
    }

    // Step 2: re-verify the password before deleting anything - same
    // "re-enter your password" requirement Laravel's DELETE /api/account
    // already enforces. A throwaway anon client, so this sign-in attempt
    // never touches the caller's real session/token.
    const verifyClient = createClient(supabaseUrl, anonKey);
    const { error: passwordError } = await verifyClient.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (passwordError) {
      return jsonResponse({ error: 'Incorrect password.' }, 401);
    }

    // Step 3: only now, with identity + password both confirmed, use
    // service_role to actually delete. Cascades to public.users (ON DELETE
    // CASCADE, see supabase/migrations/0001_initial_schema.sql) and
    // everywhere else with a users FK - same end state as Laravel revoking
    // every Sanctum token and removing the account.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteError) {
      return jsonResponse({ error: deleteError.message }, 500);
    }

    return jsonResponse({ success: true });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
