import supabase, { edgeFunctionErrorMessage } from './supabase';
import { payWithPaystack } from './paystackCheckout';

/**
 * Pays the balance on a PAID booking whose total staff raised (bookings.balance_due): a Paystack charge for exactly that amount,
 * then confirm-balance-payment verifies it with Paystack and clears the balance. Resolves with { status, applied, balanceAfter };
 * throws an Error with a user-facing message if the payment is cancelled or refused.
 */
export async function payBookingBalance(bookingId, amount) {
  const reference = await payWithPaystack(amount, [bookingId], 'balance');
  const { data, error } = await supabase.functions.invoke('confirm-balance-payment', { body: { bookingId, reference } });
  if (error) throw new Error(await edgeFunctionErrorMessage(error));
  if (data?.error) throw new Error(data.error);
  if (data?.status === 'not_paid') throw new Error('Payment was not successful. Please try again.');
  return data;
}
