// Supabase Edge Function - confirms a Paystack transaction's real status
// server-to-server, replacing the old Laravel
// /payments/paystack/verify/:reference endpoint (services/paystackApi.js).
// See paystack-initialize's header comment for the full context on why
// this had to move off Laravel.
//
// Requires the same PAYSTACK_SECRET_KEY secret as paystack-initialize.
// Deploy with: supabase functions deploy paystack-verify

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

    const { reference } = await req.json();
    if (!reference || typeof reference !== 'string') {
      return jsonResponse({ error: 'reference is required.' }, 400);
    }

    const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${paystackSecretKey}` },
    });
    const paystackJson = await paystackRes.json();

    if (!paystackRes.ok || !paystackJson.status) {
      return jsonResponse({ error: paystackJson.message || 'Could not verify payment with Paystack.' }, 502);
    }

    return jsonResponse({
      transaction_status: paystackJson.data.status,
      amount: paystackJson.data.amount,
      reference: paystackJson.data.reference,
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
