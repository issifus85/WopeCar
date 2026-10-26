// Supabase Edge Function - clears the balance on a paid booking whose total staff raised (bookings.balance_due).
//
// Two callers, two bodies:
//   renter (app / website), after a Paystack payment of the balance:   { bookingId, reference }
//   staff, recording money collected outside the app (cash, transfer): { bookingId, manual: true, amount, note? }
//
// The Paystack path verifies the transaction with Paystack and applies it with the service role - see _shared/balancePayment.ts for what is
// checked (it must have been started FOR this balance, by this renter, in GHS, and can only ever be applied once). A staff payment is
// recorded the same way (booking_balance_payments, balance_due lowered) but needs an admin / support session.
//
// Returns { status: 'applied' | 'already_applied' | 'nothing_due', applied, balanceAfter }. A rejected payment is a 4xx with { error }.
//
// Deploy with: supabase functions deploy confirm-balance-payment
// Uses the existing PAYSTACK_SECRET_KEY secret.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { applyBalancePayment, confirmBalanceFromPaystack, fetchPaystackTransaction, PaymentRejected, triggerBalanceQuickbooks } from '../_shared/balancePayment.ts';

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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: getUserError } = await callerClient.auth.getUser();
    if (getUserError || !user) return jsonResponse({ error: 'Invalid or expired session.' }, 401);

    const { bookingId, reference, manual, amount, note } = await req.json();
    if (!bookingId || typeof bookingId !== 'string') return jsonResponse({ error: 'bookingId is required.' }, 400);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    let result;
    if (manual) {
      const { data: profile } = await adminClient.from('users').select('role, is_support').eq('id', user.id).maybeSingle();
      if (!(profile?.role === 'admin' || profile?.is_support)) return jsonResponse({ error: 'Only staff can record a payment.' }, 403);
      const numeric = Number(amount);
      if (!numeric || numeric <= 0) return jsonResponse({ error: 'A positive amount is required.' }, 400);
      // Checked BEFORE anything is written: staff can record up to the balance, never more.
      const { data: current } = await adminClient.from('bookings').select('balance_due').eq('id', bookingId).maybeSingle();
      if (!current) return jsonResponse({ error: 'Booking not found.' }, 404);
      const owed = Number(current.balance_due ?? 0);
      if (owed <= 0.005) return jsonResponse({ error: 'This booking has no balance due.' }, 409);
      if (numeric > owed + 0.005) return jsonResponse({ error: `Only GHS ${owed.toFixed(2)} is owed. Record at most the balance due.` }, 400);
      result = await applyBalancePayment(adminClient, { bookingId, amount: numeric, method: 'manual', recordedBy: user.id, note: typeof note === 'string' ? note.slice(0, 300) : null });
    } else {
      if (!reference || typeof reference !== 'string') return jsonResponse({ error: 'reference is required.' }, 400);
      const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY');
      if (!paystackSecretKey) return jsonResponse({ error: 'PAYSTACK_SECRET_KEY is not configured for this project.' }, 500);
      const tx = await fetchPaystackTransaction(reference, paystackSecretKey);
      if (tx.status !== 'success') return jsonResponse({ transaction_status: tx.status, status: 'not_paid', applied: 0, balanceAfter: null });
      result = await confirmBalanceFromPaystack(adminClient, { bookingId, reference, tx, payerId: user.id });
    }

    if (result.status === 'applied') {
      // QuickBooks (payment against the current invoice + receipt email) in the background; a QuickBooks problem never undoes the payment.
      // deno-lint-ignore no-explicit-any
      const edgeRuntime = (globalThis as any).EdgeRuntime;
      const qb = triggerBalanceQuickbooks(adminClient, result.paymentId);
      if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(qb);
      else await qb;
    }
    return jsonResponse({ status: result.status, applied: result.applied, balanceAfter: result.balanceAfter });
  } catch (e) {
    if (e instanceof PaymentRejected) return jsonResponse({ error: e.message }, e.status);
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
