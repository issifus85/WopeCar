// Supabase Edge Function - applies a Paystack payment to a WopeDriver request, right after the customer pays in the app
// (or website). Body: { driverBookingId, reference }. Verifies the transaction with Paystack, then records it through
// _shared/driverPayment.ts (paystack-webhook does the same if the app never comes back; whichever runs second is a no-op).
//
// Returns { status: 'applied' | 'already_applied' | 'not_paid', amountPaid, amountDue }. A rejected payment is a 4xx with { error }.
//
// Deploy with: supabase functions deploy confirm-driver-booking-payment
// Uses the existing PAYSTACK_SECRET_KEY secret.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchPaystackTransaction, PaymentRejected } from '../_shared/confirmPayment.ts';
import { confirmDriverPaymentFromPaystack } from '../_shared/driverPayment.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization header.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: getUserError } = await callerClient.auth.getUser();
    if (getUserError || !user) return jsonResponse({ error: 'Invalid or expired session.' }, 401);

    const { driverBookingId, reference } = await req.json();
    if (!driverBookingId || typeof driverBookingId !== 'string') return jsonResponse({ error: 'driverBookingId is required.' }, 400);
    if (!reference || typeof reference !== 'string') return jsonResponse({ error: 'reference is required.' }, 400);

    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!paystackSecretKey) return jsonResponse({ error: 'PAYSTACK_SECRET_KEY is not configured for this project.' }, 500);

    const tx = await fetchPaystackTransaction(reference, paystackSecretKey);
    if (tx.status !== 'success') return jsonResponse({ status: 'not_paid', transaction_status: tx.status });

    const adminClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const result = await confirmDriverPaymentFromPaystack(adminClient, { driverBookingId, reference, tx, payerId: user.id });
    return jsonResponse(result);
  } catch (e) {
    if (e instanceof PaymentRejected) return jsonResponse({ error: e.message }, e.status);
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
