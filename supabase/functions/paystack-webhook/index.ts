// Supabase Edge Function - Paystack's server-to-server webhook. Safety net
// for the case the client-side confirmation never runs (customer pays then
// closes the tab / loses signal before the redirect lands): on `charge.success`
// it applies the payment to the bookings paystack-initialize stamped into the
// transaction's metadata, using the same checks as confirm-booking-payment.
// Idempotent with it - whichever runs second finds the bookings already paid
// with this reference and changes nothing.
//
// Only transactions started by paystack-initialize WITH bookingIds carry that
// metadata; anything else (older app builds, QuickBooks-style pay-later links)
// is acknowledged and ignored here, exactly as before.
//
// Authenticity: Paystack signs the raw body with HMAC-SHA512 using the secret
// key (x-paystack-signature); anything else is rejected. Deployed WITHOUT JWT
// verification because Paystack can't send one.
//
// Deploy with: supabase functions deploy paystack-webhook --no-verify-jwt
// Then set the webhook URL in the Paystack dashboard (Settings -> API Keys &
// Webhooks) to https://<project-ref>.supabase.co/functions/v1/paystack-webhook
// - test mode and live mode each have their own webhook URL field.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { confirmBookingsForReference, fetchPaystackTransaction, PaymentRejected } from '../_shared/confirmPayment.ts';

async function hmacSha512Hex(key: string, message: string) {
  const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');

  const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!paystackSecretKey) return new Response('not configured', { status: 500 });

  const rawBody = await req.text();
  const signature = req.headers.get('x-paystack-signature') ?? '';
  const expected = await hmacSha512Hex(paystackSecretKey, rawBody);
  if (!timingSafeEqual(signature, expected)) return new Response('invalid signature', { status: 401 });

  try {
    const event = JSON.parse(rawBody);
    if (event?.event !== 'charge.success') return new Response('ignored');

    const reference: string | undefined = event.data?.reference;
    if (!reference) return new Response('no reference');

    // Re-fetch from Paystack rather than trusting the webhook body's fields.
    const tx = await fetchPaystackTransaction(reference, paystackSecretKey);
    const bookingIds = tx.metadata?.booking_ids;
    const payerId = tx.metadata?.user_id;
    if (!Array.isArray(bookingIds) || bookingIds.length === 0 || !payerId) return new Response('no bookings on this transaction');

    const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const outcomes = await confirmBookingsForReference(adminClient, { reference, bookingIds, tx, payerId });
    console.log(`paystack-webhook ${reference}: ${JSON.stringify(outcomes)}`);
    return new Response('ok');
  } catch (e) {
    if (e instanceof PaymentRejected) {
      // A rejection is a decision, not a transient failure - 200 so Paystack
      // doesn't keep retrying; it's logged for follow-up.
      console.error(`paystack-webhook rejected: ${e.message}`);
      return new Response('rejected');
    }
    console.error(`paystack-webhook error: ${e instanceof Error ? e.message : e}`);
    return new Response('error', { status: 500 }); // let Paystack retry
  }
});
