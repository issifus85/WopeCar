// Supabase Edge Function - starts a Paystack transaction server-side,
// replacing the old Laravel /payments/paystack/initialize endpoint
// (services/paystackApi.js). That endpoint required a Laravel Sanctum
// bearer token - nothing has written that token since auth moved to
// Supabase (see services/tokenStorage.js's own header comment), so real
// bookings could not be paid for at all: app/checkout/payment.js ->
// services/paystackCheckout.js's payWithPaystack() -> this call, always
// 401'd. Same security property as the Laravel version: the Paystack
// secret key never reaches the client, only the hosted checkout URL does.
//
// Requires the PAYSTACK_SECRET_KEY secret:
//   supabase secrets set PAYSTACK_SECRET_KEY=<key> --project-ref qvactycnufaowwsiqdrz
//
// Deploy with: supabase functions deploy paystack-initialize

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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY');

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: getUserError } = await callerClient.auth.getUser();
    if (getUserError || !user) {
      return jsonResponse({ error: 'Invalid or expired session.' }, 401);
    }

    if (!paystackSecretKey) {
      return jsonResponse({ error: 'PAYSTACK_SECRET_KEY is not configured for this project.' }, 500);
    }

    const { amount, callbackUrl } = await req.json();
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      return jsonResponse({ error: 'A positive amount is required.' }, 400);
    }
    if (!callbackUrl || typeof callbackUrl !== 'string') {
      return jsonResponse({ error: 'callbackUrl is required.' }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile } = await adminClient.from('users').select('email').eq('id', user.id).maybeSingle();
    const email = profile?.email || user.email;
    if (!email) {
      return jsonResponse({ error: 'No email on file for this account.' }, 400);
    }

    // Paystack wants the smallest currency unit (pesewas for GHS) - the
    // client always sends plain GHS cedis (e.g. draft.totalCost), matching
    // what the Laravel backend previously accepted from the same call site.
    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: Math.round(numericAmount * 100),
        callback_url: callbackUrl,
      }),
    });
    const paystackJson = await paystackRes.json();

    if (!paystackRes.ok || !paystackJson.status) {
      return jsonResponse({ error: paystackJson.message || 'Could not initialize payment with Paystack.' }, 502);
    }

    return jsonResponse({
      authorization_url: paystackJson.data.authorization_url,
      reference: paystackJson.data.reference,
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
