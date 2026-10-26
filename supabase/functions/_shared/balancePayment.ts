// Paying the balance on a PAID booking whose total was raised by staff (bookings.balance_due, migration 0163).
//
// A balance is created by modify-booking (staff raise a paid booking and take no payment at that moment) and is cleared by exactly
// two things, both run with the service role:
//   - confirmBalanceFromPaystack(): the renter paid it on Paystack (client-triggered via confirm-balance-payment, or Paystack-triggered
//     via paystack-webhook - idempotent, whichever runs second changes nothing).
//   - recordManualBalancePayment(): staff recorded money they collected outside the app.
// Both go through applyBalancePayment(), which writes the booking_balance_payments row (Paystack reference unique -> a payment can never
// be applied twice) and lowers bookings.balance_due. It also books the money onto the booking's latest un-paid modification, because
// cancel-booking works out "what the renter actually paid" from booking_modifications.amount_charged / payment_ref.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchPaystackTransaction, PaymentRejected, type PaystackTransaction } from './confirmPayment.ts';

export type BalanceResult = {
  status: 'applied' | 'already_applied' | 'nothing_due';
  /** What was taken off the balance (never more than was owed). */
  applied: number;
  /** Money received beyond the balance (a balance that changed while the payment was in flight) - needs a manual refund. */
  extra: number;
  balanceAfter: number;
  paymentId: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function applyBalancePayment(
  adminClient: SupabaseClient,
  opts: { bookingId: string; amount: number; method: 'paystack' | 'manual'; reference?: string | null; recordedBy?: string | null; note?: string | null }
): Promise<BalanceResult> {
  const { bookingId, method } = opts;
  const reference = opts.reference ?? null;
  const amount = round2(Number(opts.amount));
  if (!(amount > 0)) throw new PaymentRejected('The amount must be greater than zero.');

  if (reference) {
    const { data: existing } = await adminClient.from('booking_balance_payments').select('id, amount').eq('reference', reference).maybeSingle();
    if (existing) {
      const { data: b } = await adminClient.from('bookings').select('balance_due').eq('id', bookingId).maybeSingle();
      return { status: 'already_applied', applied: Number(existing.amount), extra: 0, balanceAfter: Number(b?.balance_due ?? 0), paymentId: existing.id };
    }
  }

  const { data: booking, error } = await adminClient.from('bookings').select('id, balance_due, payment_status, renter_id, booking_ref').eq('id', bookingId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!booking) throw new PaymentRejected('Booking not found.', 404);

  const balance = Number(booking.balance_due ?? 0);
  if (balance <= 0.005) {
    return { status: 'nothing_due', applied: 0, extra: amount, balanceAfter: 0, paymentId: null };
  }

  const applied = round2(Math.min(amount, balance));
  const { data: inserted, error: insertError } = await adminClient
    .from('booking_balance_payments')
    .insert({ booking_id: bookingId, amount: applied, method, reference, recorded_by: opts.recordedBy ?? null, note: opts.note ?? null })
    .select('id')
    .single();
  if (insertError) {
    // Unique reference: another request (the webhook, a double tap) applied this very payment a moment ago.
    if ((insertError as { code?: string }).code === '23505' && reference) {
      const { data: b } = await adminClient.from('bookings').select('balance_due').eq('id', bookingId).maybeSingle();
      return { status: 'already_applied', applied, extra: 0, balanceAfter: Number(b?.balance_due ?? 0), paymentId: null };
    }
    throw new Error(insertError.message);
  }

  const balanceAfter = Math.max(0, round2(balance - applied));
  const { error: updateError } = await adminClient.from('bookings').update({ balance_due: balanceAfter }).eq('id', bookingId);
  if (updateError) throw new Error(updateError.message);

  // Book the money onto the modification that raised the total (so a later cancellation refunds against what was really paid).
  const { data: mods } = await adminClient
    .from('booking_modifications')
    .select('id, amount_charged, payment_ref, created_at')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false });
  const target = (mods ?? []).find((m) => !m.payment_ref && Number(m.amount_charged ?? 0) <= 0) ?? (mods ?? [])[0] ?? null;
  if (target) {
    await adminClient
      .from('booking_modifications')
      .update({ amount_charged: round2(Number(target.amount_charged ?? 0) + applied), ...(method === 'paystack' && reference ? { payment_ref: reference } : {}) })
      .eq('id', target.id);
  }

  await adminClient.from('notifications').insert({
    user_id: booking.renter_id,
    type: 'booking_balance_paid',
    title: balanceAfter > 0 ? 'Payment received' : 'Balance paid',
    body: balanceAfter > 0
      ? `We received GHS ${applied.toFixed(2)} for booking ${booking.booking_ref}. GHS ${balanceAfter.toFixed(2)} is still due.`
      : `Thank you - the balance on booking ${booking.booking_ref} is paid in full.`,
    booking_id: bookingId,
  });

  return { status: 'applied', applied, extra: round2(Math.max(0, amount - applied)), balanceAfter, paymentId: inserted.id };
}

/** Everything that has to hold before a Paystack transaction may clear a booking's balance. Throws PaymentRejected otherwise. */
export async function confirmBalanceFromPaystack(
  adminClient: SupabaseClient,
  opts: { bookingId: string; reference: string; tx: PaystackTransaction; payerId: string }
): Promise<BalanceResult> {
  const { bookingId, reference, tx, payerId } = opts;
  if (tx.status !== 'success') throw new PaymentRejected('This payment was not successful.');
  if (tx.currency && tx.currency !== 'GHS') throw new PaymentRejected('Unexpected payment currency.');

  const { data: booking, error } = await adminClient.from('bookings').select('id, renter_id, balance_due, payment_ref').eq('id', bookingId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!booking) throw new PaymentRejected('Booking not found.', 404);
  if (booking.renter_id !== payerId) throw new PaymentRejected('Not authorized to pay this booking.', 403);

  // The transaction must have been started FOR this balance by paystack-initialize - a reference that paid for a booking or an
  // earlier modification can never be replayed against a balance.
  const meta = tx.metadata as { booking_ids?: string[]; user_id?: string; purpose?: string } | null;
  if (meta?.purpose !== 'balance' || !Array.isArray(meta.booking_ids) || !meta.booking_ids.includes(bookingId)) {
    throw new PaymentRejected('This payment was not made for this booking balance.', 403);
  }
  if (meta.user_id && meta.user_id !== payerId) throw new PaymentRejected('This payment belongs to a different account.', 403);
  if (booking.payment_ref === reference) throw new PaymentRejected('This payment reference was already used for the booking.', 409);

  const { data: payer } = await adminClient.from('users').select('email').eq('id', payerId).maybeSingle();
  const payerEmail = payer?.email?.toLowerCase() ?? null;
  if (tx.customerEmail && payerEmail && tx.customerEmail !== payerEmail) throw new PaymentRejected('This payment was made by a different account.', 403);

  const { data: usedInMod } = await adminClient.from('booking_modifications').select('id').eq('payment_ref', reference).limit(1);
  if ((usedInMod ?? []).length > 0) {
    // Already booked onto a modification: only fine if it is this very balance payment being confirmed a second time.
    const { data: again } = await adminClient.from('booking_balance_payments').select('id').eq('reference', reference).maybeSingle();
    if (!again) throw new PaymentRejected('This payment reference was already used.', 409);
  }

  const result = await applyBalancePayment(adminClient, { bookingId, amount: tx.amount / 100, method: 'paystack', reference, recordedBy: payerId });
  if (result.status === 'nothing_due') {
    console.error(`confirm-balance-payment: GHS ${tx.amount / 100} received for booking ${bookingId} (ref ${reference}) but nothing was due - refund needed.`);
  } else if (result.extra > 0.5) {
    console.error(`confirm-balance-payment: GHS ${result.extra} more than the balance was received for booking ${bookingId} (ref ${reference}) - refund the difference.`);
  }
  return result;
}

/** Tells QuickBooks about a balance payment (a payment against the booking's current invoice + a receipt to the renter). Background, never throws. */
export async function triggerBalanceQuickbooks(adminClient: SupabaseClient, paymentId: string | null): Promise<void> {
  if (!paymentId) return;
  try {
    const { data: secretRow } = await adminClient.from('internal_secrets').select('value').eq('name', 'cron').maybeSingle();
    const { error } = await adminClient.functions.invoke('quickbooks-record-balance-payment', {
      body: { balancePaymentId: paymentId },
      headers: secretRow?.value ? { 'x-cron-secret': secretRow.value } : {},
    });
    if (error) console.error('quickbooks-record-balance-payment failed:', error.message);
  } catch (e) {
    console.error('quickbooks-record-balance-payment call failed:', e);
  }
}

export { fetchPaystackTransaction, PaymentRejected };
