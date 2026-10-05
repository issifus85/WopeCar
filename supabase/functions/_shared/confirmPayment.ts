// Server-side confirmation of a Paystack payment against reserved bookings.
//
// Before this existed, every client (mobile app, website) marked its own
// booking `payment_status: 'paid'` straight from the browser/phone after
// calling paystack-verify - and the bookings RLS/trigger let a renter write
// payment fields on their own row, so anyone signed in could mark a booking
// paid with a made-up reference without paying. Everything that turns a
// booking "paid" now goes through confirmBookingsForReference(), run with the
// service role by confirm-booking-payment (client-triggered) and
// paystack-webhook (Paystack-triggered), which checks, against Paystack's own
// record of the transaction:
//   1. the transaction really succeeded, in GHS;
//   2. the amount paid covers the sum of the bookings being confirmed;
//   3. the reference isn't already attached to different bookings;
//   4. (when paystack-initialize stamped it) the bookings are the ones this
//      payment was started for, and belong to the payer.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type PaystackTransaction = {
  status: string;
  amount: number; // pesewas
  currency: string | null;
  reference: string;
  channel: string | null;
  bank: string | null;
  paidAt: string | null;
  customerEmail: string | null;
  metadata: { booking_ids?: string[]; user_id?: string } | null;
};

export type BookingOutcome = 'confirmed' | 'dates_conflict' | 'failed';

export class PaymentRejected extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function fetchPaystackTransaction(reference: string, secretKey: string): Promise<PaystackTransaction> {
  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const json = await res.json();
  if (!res.ok || !json.status) {
    // Paystack 4xx (e.g. unknown reference) is a bad request from our caller, not a server fault.
    if (res.status >= 400 && res.status < 500) throw new PaymentRejected(json.message || 'Could not verify payment with Paystack.', 400);
    throw new Error(json.message || 'Could not verify payment with Paystack.');
  }
  const d = json.data;
  return {
    status: d.status,
    amount: Number(d.amount) || 0,
    currency: d.currency ?? null,
    reference: d.reference ?? reference,
    channel: d.channel ?? null,
    bank: d.authorization?.bank ?? null,
    paidAt: d.paid_at ?? null,
    customerEmail: typeof d.customer?.email === 'string' ? d.customer.email.toLowerCase() : null,
    metadata: d.metadata && typeof d.metadata === 'object' ? d.metadata : null,
  };
}

/**
 * `payerId` is the signed-in caller (confirm-booking-payment) or the user id
 * Paystack's metadata names (paystack-webhook) - every booking must belong to
 * them. Throws PaymentRejected when the payment can't legitimately be applied;
 * otherwise returns one outcome per booking id (idempotent: a booking already
 * paid with this same reference is simply 'confirmed' again).
 */
export async function confirmBookingsForReference(
  adminClient: SupabaseClient,
  opts: { reference: string; bookingIds: string[]; tx: PaystackTransaction; payerId: string }
): Promise<Record<string, BookingOutcome>> {
  const { reference, tx, payerId } = opts;
  const bookingIds = Array.from(new Set(opts.bookingIds));
  if (bookingIds.length === 0) throw new PaymentRejected('No bookings to confirm.');

  if (tx.status !== 'success') throw new PaymentRejected('This payment was not successful.');
  if (tx.currency && tx.currency !== 'GHS') throw new PaymentRejected('Unexpected payment currency.');

  const { data: bookings, error } = await adminClient
    .from('bookings')
    .select('id, renter_id, total_cost, payment_status, payment_ref')
    .in('id', bookingIds);
  if (error) throw new Error(error.message);
  if (!bookings || bookings.length !== bookingIds.length) throw new PaymentRejected('Booking not found.', 404);
  if (bookings.some((b) => b.renter_id !== payerId)) throw new PaymentRejected('Not authorized to confirm this booking.', 403);

  const stamped = tx.metadata?.booking_ids;
  if (Array.isArray(stamped) && stamped.length > 0) {
    if (tx.metadata?.user_id && tx.metadata.user_id !== payerId) throw new PaymentRejected('This payment belongs to a different account.', 403);
    if (bookingIds.some((id) => !stamped.includes(id))) throw new PaymentRejected('This payment was not made for these bookings.', 403);
  }

  // Whoever paid must be the one claiming it: paystack-initialize always uses
  // the signed-in user's own email, so the transaction's customer email must
  // match theirs. (This is what binds payments from older app builds, which
  // don't stamp booking ids into the metadata.)
  const { data: payer } = await adminClient.from('users').select('email').eq('id', payerId).maybeSingle();
  const payerEmail = payer?.email?.toLowerCase() ?? null;
  if (tx.customerEmail && payerEmail && tx.customerEmail !== payerEmail) {
    throw new PaymentRejected('This payment was made by a different account.', 403);
  }

  const { data: sharing, error: sharingError } = await adminClient.from('bookings').select('id').eq('payment_ref', reference);
  if (sharingError) throw new Error(sharingError.message);
  if ((sharing ?? []).some((b) => !bookingIds.includes(b.id))) {
    throw new PaymentRejected('This payment reference was already used for other bookings.', 409);
  }

  const owed = bookings.reduce((sum, b) => sum + Number(b.total_cost ?? 0), 0);
  const paid = tx.amount / 100;
  // Half a cedi of slack for rounding between pesewas and cedis; never more.
  if (paid + 0.5 < owed) {
    console.error(`confirm-payment amount mismatch ref=${reference} paid=${paid} owed=${owed}`);
    throw new PaymentRejected(`The amount paid (GH₵${paid.toFixed(2)}) does not cover these bookings (GH₵${owed.toFixed(2)}). Contact support with reference ${reference}.`, 402);
  }

  const outcomes: Record<string, BookingOutcome> = {};
  for (const b of bookings) {
    if (b.payment_status === 'paid') {
      outcomes[b.id] = b.payment_ref === reference ? 'confirmed' : 'failed';
      continue;
    }
    const { error: updateError } = await adminClient
      .from('bookings')
      .update({ payment_status: 'paid', payment_ref: reference })
      .eq('id', b.id);
    if (!updateError) {
      outcomes[b.id] = 'confirmed';
    } else if ((updateError as { code?: string }).code === '23P01') {
      // bookings_no_overlapping_paid_dates: another renter's booking for the
      // same car+dates was confirmed first. The charge already succeeded, so
      // record the reference on the cancelled reservation for a manual refund.
      await adminClient
        .from('bookings')
        .update({
          status: 'cancelled',
          payment_ref: reference,
          cancellation_reason: `Payment succeeded (ref ${reference}) but these dates were booked by another renter first - needs manual refund.`,
        })
        .eq('id', b.id);
      outcomes[b.id] = 'dates_conflict';
    } else {
      console.error(`confirm-payment update failed booking=${b.id}: ${updateError.message}`);
      outcomes[b.id] = 'failed';
    }
  }
  return outcomes;
}
