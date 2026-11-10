// Supabase Edge Function - the ONLY way a client-side checkout marks bookings
// paid. The caller (mobile app or website) has just completed a Paystack
// charge and sends { bookingIds, reference }; this verifies the transaction
// with Paystack and applies it to the caller's own bookings with the service
// role - see _shared/confirmPayment.ts for exactly what is checked and why.
// Replaces the clients' old direct `update bookings set payment_status='paid'`
// (which any signed-in user could forge).
//
// Returns { transaction_status, amount, reference, channel, channel_bank,
// paid_at, outcomes: { [bookingId]: 'confirmed'|'dates_conflict'|'failed' } }.
// A rejected payment (wrong amount, reference reused, not the payer's
// booking...) is a 4xx with { error }.
//
// `asAdmin: true` is the admin tools' "Mark as Paid" with method
// "Paystack (seen in the dashboard)": the renter really did pay through
// Paystack, but no client ever came back to claim it. The caller is an admin
// rather than the payer, so the payer is taken from the bookings' own renter -
// every other check (the transaction succeeded, in GHS, for at least what is
// owed, the reference not already used elsewhere, and paid from the renter's
// own email) still has to pass. Confirming it here instead of flipping the
// status by hand is what puts the reference on the booking, so the payment can
// be refunded and paystack-reconcile / paystack-webhook recognise it.
//
// Deploy with: supabase functions deploy confirm-booking-payment
// Uses the existing PAYSTACK_SECRET_KEY secret.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { confirmBookingsForReference, fetchPaystackTransaction, PaymentRejected } from '../_shared/confirmPayment.ts';

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
    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!paystackSecretKey) return jsonResponse({ error: 'PAYSTACK_SECRET_KEY is not configured for this project.' }, 500);

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: getUserError } = await callerClient.auth.getUser();
    if (getUserError || !user) return jsonResponse({ error: 'Invalid or expired session.' }, 401);

    const { bookingIds, bookingId, reference, asAdmin } = await req.json();
    const ids: string[] = Array.isArray(bookingIds) ? bookingIds : bookingId ? [bookingId] : [];
    if (!reference || typeof reference !== 'string') return jsonResponse({ error: 'reference is required.' }, 400);
    if (ids.length === 0 || ids.some((id) => typeof id !== 'string')) return jsonResponse({ error: 'bookingIds is required.' }, 400);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Who the payment has to belong to: normally the caller, who is the payer.
    let payerId = user.id;
    if (asAdmin === true) {
      const { data: isAdmin } = await callerClient.rpc('is_admin');
      if (isAdmin !== true) return jsonResponse({ error: 'Only an admin can attribute a payment to someone else.' }, 403);
      const unique = Array.from(new Set(ids));
      const { data: rows, error: renterError } = await adminClient.from('bookings').select('renter_id').in('id', unique);
      if (renterError) return jsonResponse({ error: renterError.message }, 500);
      if (!rows || rows.length !== unique.length) return jsonResponse({ error: 'Booking not found.' }, 404);
      const renterIds = Array.from(new Set(rows.map((r: { renter_id: string }) => r.renter_id)));
      if (renterIds.length !== 1) return jsonResponse({ error: 'These bookings belong to different renters.' }, 400);
      payerId = renterIds[0];
    }

    const tx = await fetchPaystackTransaction(reference, paystackSecretKey);
    const base = {
      transaction_status: tx.status,
      amount: tx.amount,
      reference: tx.reference,
      channel: tx.channel,
      channel_bank: tx.bank,
      paid_at: tx.paidAt,
    };
    if (tx.status !== 'success') return jsonResponse({ ...base, outcomes: {} });

    const outcomes = await confirmBookingsForReference(adminClient, { reference, bookingIds: ids, tx, payerId });
    return jsonResponse({ ...base, outcomes });
  } catch (e) {
    if (e instanceof PaymentRejected) return jsonResponse({ error: e.message }, e.status);
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
