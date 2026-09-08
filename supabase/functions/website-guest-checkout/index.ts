// Supabase Edge Function - bootstraps a real, authenticated Supabase session
// for a brand-new website "guest checkout" visitor with no password, so the
// rest of the checkout flow (booking insert, document upload, Paystack) can
// treat a guest exactly like any other signed-in user - the same
// bookings_renter_insert RLS policy (renter_id = auth.uid()) applies either
// way, no special-casing needed downstream.
//
// SECURITY: this only ever creates a session for a genuinely NEW email
// address. If the email already has an account, this deliberately refuses
// and tells the caller to sign in instead - minting a session for an
// EXISTING account from a public, unauthenticated endpoint (given only an
// email address, no password) would be a plain account-takeover oracle:
// anyone could type in someone else's real email and be logged into their
// account. A returning guest who wants to check out again from a new
// browser/session should sign in (with their real password, or "Forgot
// password?" if they never set one) rather than re-using guest checkout -
// this repo's existing /login flow already covers that.
//
// verify_jwt: false - this is the one step in the checkout flow that must
// be callable with NO Authorization header at all (that's the whole point:
// the caller doesn't have a session yet). Same precedent as
// send-inquiry-notification/send-signup-notification.
//
// Deploy with: supabase functions deploy website-guest-checkout

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
    const { email, fullName, phone } = await req.json();
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return jsonResponse({ error: 'A valid email address is required.' }, 400);
    }
    const normalizedEmail = email.trim().toLowerCase();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: existing } = await adminClient.from('users').select('id').eq('email', normalizedEmail).maybeSingle();
    if (existing) {
      return jsonResponse(
        { error: 'account_exists', message: 'An account with this email already exists. Please sign in instead.' },
        409
      );
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      email_confirm: true,
      user_metadata: { full_name: fullName || null, phone: phone || null, role: 'renter' },
    });
    if (createError || !created?.user) {
      return jsonResponse({ error: createError?.message || 'Could not create guest account.' }, 500);
    }

    // Mint a real session for the account we just created, without a
    // password - generateLink returns a one-time token this same request
    // immediately redeems via verifyOtp, so no email round-trip is needed
    // for a brand-new guest (there's no existing inbox ownership to prove -
    // this is the first time this email has ever been used on WopeCar).
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
    });
    if (linkError || !linkData?.properties?.hashed_token) {
      return jsonResponse({ error: linkError?.message || 'Could not start guest session.' }, 500);
    }

    const anonClient = createClient(supabaseUrl, anonKey);
    const { data: sessionData, error: verifyError } = await anonClient.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    });
    if (verifyError || !sessionData.session) {
      return jsonResponse({ error: verifyError?.message || 'Could not verify guest session.' }, 500);
    }

    return jsonResponse({
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      user_id: created.user.id,
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
