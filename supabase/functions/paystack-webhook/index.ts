// Supabase Edge Function - Paystack's server-to-server webhook. Safety net
// for the case the client-side confirmation never runs (customer pays then
// closes the tab / loses signal before the redirect lands): on `charge.success`
// it applies the payment to the bookings paystack-initialize stamped into the
// transaction's metadata, using the same checks as confirm-booking-payment.
// Idempotent with it - whichever runs second finds the bookings already paid
// with this reference and changes nothing.
//
// A WopeDriver payment (metadata purpose 'wopedriver') is applied through _shared/driverPayment.ts.
//
// A paid booking CHANGE (metadata purpose 'modify') is applied from the change saved by paystack-initialize, through
// modify-booking (see applyPaidModification below and migration 0168).
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
import { confirmBalanceFromPaystack, triggerBalanceQuickbooks } from '../_shared/balancePayment.ts';
import { getInternalSecret } from '../_shared/cronAuth.ts';
import { confirmDriverPaymentFromPaystack } from '../_shared/driverPayment.ts';

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

// A paid booking change (paystack-initialize purpose 'modify'): apply the change saved for this reference through modify-booking,
// on the renter's behalf, if the website callback hasn't already. modify-booking makes this idempotent per reference.
// deno-lint-ignore no-explicit-any
async function applyPaidModification(adminClient: any, reference: string): Promise<Response> {
  const { data: pending } = await adminClient.from('pending_booking_modifications').select('booking_id, renter_id, amount, applied_at').eq('reference', reference).maybeSingle();
  if (!pending) {
    console.error(`paystack-webhook ${reference}: modify payment with no saved change`);
    return new Response('no saved change');
  }
  if (pending.applied_at) return new Response('already applied');

  const secret = await getInternalSecret();
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/modify-booking`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      'Content-Type': 'application/json',
      'x-cron-secret': secret ?? '',
    },
    body: JSON.stringify({ pendingReference: reference, actAsUserId: pending.renter_id }),
  });
  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try {
    body = await res.json();
  } catch {
    // keep {}
  }
  if (res.ok && body.inProgress) {
    // The website callback is applying it right now; ask Paystack to retry so we confirm it landed (or apply it if that failed).
    return new Response('in progress', { status: 503 });
  }
  if (res.ok && body.success) {
    console.log(`paystack-webhook ${reference}: modification ${body.alreadyApplied ? 'already applied' : 'applied'}`);
    return new Response('ok');
  }
  if (res.status >= 500) {
    console.error(`paystack-webhook ${reference}: modify-booking ${res.status} ${body.error ?? ''}`);
    return new Response('error', { status: 500 }); // transient: let Paystack retry
  }
  // Refused (e.g. the price changed, the booking was cancelled): the renter has paid, so a person must sort it out.
  console.error(`paystack-webhook ${reference}: paid change refused: ${res.status} ${body.error ?? ''}`);
  await alertSupportPaidChangeNotApplied(adminClient, reference, pending, `${res.status}: ${body.error ?? 'unknown error'}`);
  return new Response('refused');
}

// deno-lint-ignore no-explicit-any
async function alertSupportPaidChangeNotApplied(adminClient: any, reference: string, pending: any, reason: string) {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) return;
  const [{ data: supportSetting }, { data: booking }] = await Promise.all([
    adminClient.from('app_settings').select('value').eq('key', 'support_email').maybeSingle(),
    adminClient.from('bookings').select('booking_ref').eq('id', pending.booking_id).maybeSingle(),
  ]);
  const to = typeof supportSetting?.value === 'string' ? supportSetting.value : null;
  if (!to) return;
  const ref = booking?.booking_ref ?? pending.booking_id;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'WopeCar <bookings@wopecar.com>',
      to: [to],
      subject: `Action needed: paid change not applied - ${ref}`,
      html: `<p>A renter paid <strong>GHS ${Number(pending.amount).toFixed(2)}</strong> (Paystack <strong>${reference}</strong>) to change booking <strong>${ref}</strong>, but the change could not be applied automatically.</p><p>Reason: ${reason}</p><p>Please apply the change in the admin (Modify, then Record balance payment with this reference) or refund the payment.</p>`,
    }),
  }).catch((e) => console.error('support alert failed:', e));
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
    // deno-lint-ignore no-explicit-any
    const meta = (tx.metadata ?? {}) as any;
    if (meta.purpose === 'wopedriver' && meta.driver_booking_id && meta.user_id) {
      // A WopeDriver payment (confirm-driver-booking-payment is the client-side twin; whichever runs second is a no-op).
      const driverAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const result = await confirmDriverPaymentFromPaystack(driverAdmin, { driverBookingId: meta.driver_booking_id, reference, tx, payerId: meta.user_id });
      console.log(`paystack-webhook ${reference}: wopedriver ${result.status}`);
      return new Response('ok');
    }
    const bookingIds = tx.metadata?.booking_ids;
    const payerId = tx.metadata?.user_id;
    if (!Array.isArray(bookingIds) || bookingIds.length === 0 || !payerId) return new Response('no bookings on this transaction');

    const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    if ((tx.metadata as { purpose?: string } | null)?.purpose === 'modify') {
      return await applyPaidModification(adminClient, reference);
    }
    if ((tx.metadata as { purpose?: string } | null)?.purpose === 'balance') {
      // A balance payment (confirm-balance-payment is the client-side twin; whichever runs second is a no-op).
      const result = await confirmBalanceFromPaystack(adminClient, { bookingId: bookingIds[0], reference, tx, payerId });
      if (result.status === 'applied') await triggerBalanceQuickbooks(adminClient, result.paymentId);
      console.log(`paystack-webhook ${reference}: balance ${result.status}`);
      return new Response('ok');
    }
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
