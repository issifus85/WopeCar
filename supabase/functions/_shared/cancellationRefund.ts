// The cancellation refund, extracted from cancel-booking so the retry sweep
// (paystack-refund-retry) can never decide a different amount than the
// cancellation itself did - the same reason paystackApply.ts exists for the
// payment side.
//
// The split that matters:
//
//   planCancellationRefund()  - works out WHAT is owed. Depends on the moment
//                               of cancellation (hours until pickup decide the
//                               tier), so it runs ONCE, at cancellation.
//   executeRefundPlan()       - tries to move the money. Safe to run again and
//                               again: it is handed the parts still outstanding
//                               and reports back the ones that are still
//                               outstanding after it tried.
//
// This is why the plan is persisted on the booking (bookings.refund_plan,
// migration 0179) instead of being recomputed on retry: by the time a retry
// runs, hours-until-pickup has moved and the trip may even have started, which
// would silently reprice - or zero - a refund the renter was already promised.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { combineDateAndTime } from './time.ts';

export const DEFAULT_FULL_REFUND_HOURS = 48; // matches the configured app_settings value and the website fallback
export const DEFAULT_PARTIAL_REFUND_HOURS = 24;
export const DEFAULT_PARTIAL_REFUND_PERCENTAGE = 0.5;

/**
 * One Paystack transaction and how much of the refund may be taken from it. A
 * refund can never exceed its own transaction, so a booking paid in several
 * charges (original + paid modifications) refunds in several parts.
 * `ref` is null when the money did not come through Paystack at all.
 */
export type RefundPart = { ref: string | null; cap: number };

export type RefundPlan = {
  /** Total still to return to the renter. */
  amount: number;
  /** The tier that was applied, 0..1, frozen at cancellation. */
  percentage: number;
  /** The scheduled pickup had already passed: Terms of Service 5.2, nothing is refunded. */
  inTrip: boolean;
  /** The transactions the refund comes out of, with the remaining headroom on each. */
  parts: RefundPart[];
  /** The money came in outside Paystack (admin "Mark as Paid"), so it has to go back the same way. */
  paidOffPaystack: boolean;
};

export type RefundAttempt = {
  /** What Paystack actually accepted on this attempt. */
  processed: number;
  /** The parts still outstanding - persist these and hand them back on the next attempt. */
  remainingParts: RefundPart[];
  /** Still owed after this attempt. */
  remaining: number;
  /** Why it did not all go through, in words an admin can act on. */
  error: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// deno-lint-ignore no-explicit-any
type Booking = any;

/**
 * Works out what a cancellation owes the renter, and out of which transactions.
 * Call this at cancellation time only - see the header note.
 */
export async function planCancellationRefund(adminClient: SupabaseClient, booking: Booking): Promise<RefundPlan> {
  const { data: settingsRows } = await adminClient
    .from('app_settings')
    .select('key, value')
    .in('key', ['cancellation_full_refund_hours', 'cancellation_partial_refund_hours', 'cancellation_partial_refund_percentage']);
  const settingsMap = Object.fromEntries((settingsRows ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
  const fullHours = Number(settingsMap.cancellation_full_refund_hours ?? DEFAULT_FULL_REFUND_HOURS);
  const partialHours = Number(settingsMap.cancellation_partial_refund_hours ?? DEFAULT_PARTIAL_REFUND_HOURS);
  const partialPct = Number(settingsMap.cancellation_partial_refund_percentage ?? DEFAULT_PARTIAL_REFUND_PERCENTAGE);

  // The pickup time is "9:00 AM" for app bookings and "09:00" for website ones - read both (slicing the string left app bookings with an
  // Invalid Date, so hoursUntilPickup was NaN and every cancellation fell into the 0% tier).
  const pickupAt = combineDateAndTime(booking.start_date, booking.pickup_time, '10:00');
  const hoursUntilPickup = (pickupAt.getTime() - Date.now()) / 3600000;

  const inTrip = hoursUntilPickup < 0;
  let percentage: number;
  if (hoursUntilPickup >= fullHours) percentage = 1;
  else if (hoursUntilPickup >= partialHours) percentage = partialPct;
  else percentage = 0;

  // The cancellation tiers apply to what the renter has ACTUALLY PAID for this booking - not to its current total_cost. They differ
  // once the booking was modified: a change that lowered the total never returned the difference (the team follows up on it), so the
  // renter paid more than total_cost, and a change that raised it can have been paid in a separate Paystack transaction. Paid =
  //   the total the booking had before its first modification (or total_cost if it was never modified)
  //   + every amount charged with a later modification (positive amounts only: a reduction returns nothing by itself, and a
  //     staff-raised total that was never collected has amount_charged 0).
  const { data: mods } = await adminClient
    .from('booking_modifications')
    .select('old_total_cost, old_security_deposit, amount_charged, payment_ref, created_at')
    .eq('booking_id', booking.id)
    .order('created_at', { ascending: true });
  const originalPaid = mods && mods.length > 0 ? Number(mods[0].old_total_cost) : Number(booking.total_cost);
  // A payment recorded by hand (admin "Mark as Paid") writes the reference the admin was given onto the booking too - a bank,
  // mobile money or Wise reference, not a Paystack transaction. Paystack cannot refund against it, so the original payment counts
  // as having no reference here: the refund due is still worked out and reported, for the team to return the money the same way it
  // came in. "Paystack (seen in the dashboard)" is the exception - that reference was verified with Paystack when it was recorded.
  const { data: manualPayments } = await adminClient
    .from('booking_manual_payments')
    .select('method')
    .eq('booking_id', booking.id);
  const paidOffPaystack = (manualPayments ?? []).some((m: { method: string }) => m.method !== 'paystack_dashboard');
  const originalRef = paidOffPaystack ? null : booking.payment_ref;
  // Each part is refunded against the Paystack transaction that took the money (a refund can't exceed its own transaction).
  const parts: RefundPart[] = [{ ref: originalRef, cap: originalPaid }];
  for (const m of mods ?? []) {
    const charged = Number(m.amount_charged);
    if (charged > 0) {
      if (m.payment_ref && m.payment_ref !== originalRef) parts.push({ ref: m.payment_ref, cap: charged });
      else parts[0].cap += charged;
    }
  }
  const paidBase = round2(parts.reduce((sum, part) => sum + part.cap, 0));
  // The security deposit is refundable by definition - it is only ever kept if the car comes back damaged - so cancelling before
  // the trip returns it in FULL at every tier, even inside the no-refund window. The tiers apply to the rest (rental, add-ons,
  // delivery, WopeCare, driver). The deposit paid is the one the booking had before its first modification (or its current one).
  const depositPaid = Math.min(
    paidBase,
    Math.max(0, mods && mods.length > 0 ? Number(mods[0].old_security_deposit ?? booking.security_deposit) : Number(booking.security_deposit))
  );
  let amount = round2(depositPaid + (paidBase - depositPaid) * percentage);
  // Once the trip has started (Terms of Service 5.2) a cancellation is strictly non-refundable: no Paystack refund is triggered for unused days.
  // The security deposit is NOT refunded here either - it is returned by the team after the vehicle has been inspected.
  if (inTrip) {
    amount = 0;
    percentage = 0;
  }

  return { amount, percentage, inTrip, parts, paidOffPaystack };
}

/**
 * Tries to return `amount` through the given parts, newest-paid last, and reports
 * what is left. Never throws: a Paystack outage leaves the plan intact for the
 * retry sweep rather than losing it.
 *
 * Idempotency: Paystack itself has no idempotency key on /refund, so the caller's
 * contract is to only ever pass parts that are still outstanding. Each successful
 * part is removed from `remainingParts`, so a part can never be refunded twice
 * across attempts.
 */
export async function executeRefundPlan(
  paystackSecretKey: string | undefined,
  parts: RefundPart[],
  amount: number,
  opts?: { paidOffPaystack?: boolean }
): Promise<RefundAttempt> {
  if (amount <= 0) return { processed: 0, remainingParts: [], remaining: 0, error: null };
  if (!paystackSecretKey) {
    return { processed: 0, remainingParts: parts, remaining: amount, error: 'Refunds are not configured for this project yet — process this refund manually.' };
  }

  let processed = 0;
  let remaining = amount;
  let error: string | null = null;
  const remainingParts: RefundPart[] = [];

  for (const part of parts) {
    if (remaining <= 0.001) {
      remainingParts.push(part);
      continue;
    }
    const take = round2(Math.min(remaining, part.cap));
    if (take <= 0) continue;
    if (!part.ref) {
      error = opts?.paidOffPaystack
        ? 'This booking was paid outside Paystack, so the refund cannot be processed automatically — return it the way the money came in.'
        : 'A payment on this booking has no Paystack reference — process the rest of the refund manually.';
      remainingParts.push(part);
      continue;
    }
    try {
      const paystackRes = await fetch('https://api.paystack.co/refund', {
        method: 'POST',
        headers: { Authorization: `Bearer ${paystackSecretKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction: part.ref, amount: Math.round(take * 100) }),
      });
      const paystackJson = await paystackRes.json().catch(() => ({}));
      if (paystackRes.ok && paystackJson.status) {
        processed = round2(processed + take);
        remaining = round2(remaining - take);
        // Whatever headroom is left on this transaction stays available for a later part of the plan.
        const leftOnPart = round2(part.cap - take);
        if (leftOnPart > 0) remainingParts.push({ ref: part.ref, cap: leftOnPart });
      } else {
        error = paystackJson.message || 'Paystack refund request failed — process this refund manually.';
        remainingParts.push(part);
      }
    } catch {
      error = 'Could not reach Paystack to process the refund — process it manually.';
      remainingParts.push(part);
    }
  }

  return { processed, remainingParts, remaining: round2(Math.max(0, remaining)), error };
}

/** Reads a persisted refund_plan back into parts, tolerating anything unexpected in the column. */
export function readRefundPlan(raw: unknown): RefundPart[] {
  if (!Array.isArray(raw)) return [];
  const parts: RefundPart[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as { ref?: unknown; cap?: unknown };
    const cap = Number(e.cap);
    if (!Number.isFinite(cap) || cap <= 0) continue;
    parts.push({ ref: typeof e.ref === 'string' && e.ref ? e.ref : null, cap: round2(cap) });
  }
  return parts;
}
