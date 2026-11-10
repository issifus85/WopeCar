// WopeDriver payments (driver_bookings, migrations 0171/0172). A Paystack charge started by paystack-initialize with purpose
// 'wopedriver' is applied here, from either confirm-driver-booking-payment (the app, right after paying) or paystack-webhook
// (if the app never comes back). apply_driver_booking_payment() keys on the Paystack reference, so whichever runs second
// changes nothing.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PaymentRejected, type PaystackTransaction } from './confirmPayment.ts';

export type DriverPaymentResult = { status: 'applied' | 'already_applied'; amountPaid: number; amountDue: number };

export async function confirmDriverPaymentFromPaystack(
  adminClient: SupabaseClient,
  opts: { driverBookingId: string; reference: string; tx: PaystackTransaction; payerId: string }
): Promise<DriverPaymentResult> {
  const { driverBookingId, reference, tx, payerId } = opts;
  // deno-lint-ignore no-explicit-any
  const meta = (tx.metadata ?? {}) as any;
  if (tx.status !== 'success') throw new PaymentRejected('Payment was not successful.', 402);
  if (tx.currency && tx.currency !== 'GHS') throw new PaymentRejected('Unexpected payment currency.');
  if (meta.purpose !== 'wopedriver' || meta.driver_booking_id !== driverBookingId || meta.user_id !== payerId) {
    throw new PaymentRejected('This payment was not made for this driver booking.', 403);
  }
  const { data: booking } = await adminClient.from('driver_bookings').select('id, user_id').eq('id', driverBookingId).maybeSingle();
  if (!booking || booking.user_id !== payerId) throw new PaymentRejected('Driver booking not found.', 404);

  const { data, error } = await adminClient.rpc('apply_driver_booking_payment', {
    p_booking_id: driverBookingId,
    p_amount: tx.amount / 100,
    p_method: 'paystack',
    p_reference: reference,
  });
  if (error) throw new Error(error.message);

  const result: DriverPaymentResult = { status: data.status, amountPaid: Number(data.amount_paid), amountDue: Number(data.amount_due) };
  if (result.status === 'applied') {
    // Receipt to the customer and a heads-up to support (best-effort: the payment is already recorded).
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-driver-booking-notification`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverBookingId, event: 'paid', paymentId: data.payment_id }),
    }).catch((e) => console.error('driver payment notification failed:', e));
  }
  return result;
}
