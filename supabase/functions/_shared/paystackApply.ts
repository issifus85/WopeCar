// Applying a SUCCESSFUL Paystack transaction to whatever it was started for.
//
// This is the one dispatcher behind both server-side entry points:
//   - paystack-webhook   - Paystack tells us the charge succeeded (the usual safety net for a
//                          customer who paid and then closed the tab).
//   - paystack-reconcile - a cron sweep that finds successful charges NEITHER the client nor the
//                          webhook ever applied (a lost/failing webhook delivery).
// It lives here rather than in the webhook so the two can never drift apart: the sweep must make
// exactly the decisions the webhook would have made.
//
// What a transaction is for comes from the metadata paystack-initialize stamped on it:
//   purpose 'wopedriver' -> _shared/driverPayment.ts  (driver_bookings)
//   purpose 'balance'    -> _shared/balancePayment.ts (bookings.balance_due)
//   purpose 'modify'     -> modify-booking, from the change saved against this reference
//   booking_ids, no purpose -> _shared/confirmPayment.ts (ordinary checkout)
//   anything else        -> 'unattributed': older app builds and QuickBooks pay-later links carry
//                           no metadata, so there is nothing here to apply them to.
// Every path is idempotent on the reference, so running this twice for one transaction is safe.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { confirmBookingsForReference, PaymentRejected, type BookingOutcome, type PaystackTransaction } from './confirmPayment.ts';
import { confirmBalanceFromPaystack, triggerBalanceQuickbooks, type BalanceResult } from './balancePayment.ts';
import { confirmDriverPaymentFromPaystack } from './driverPayment.ts';
import { getInternalSecret } from './cronAuth.ts';

export type ModifyStatus = 'applied' | 'already_applied' | 'in_progress' | 'no_saved_change' | 'refused';

/**
 * `changed` is true only when THIS call moved money state. Callers use it to decide whether to tell
 * anyone: a second run over the same transaction reports the same status with `changed: false`.
 */
export type ApplyOutcome =
  | { kind: 'wopedriver'; changed: boolean; status: 'applied' | 'already_applied'; detail?: string }
  | { kind: 'balance'; changed: boolean; status: BalanceResult['status']; detail?: string }
  | { kind: 'modify'; changed: boolean; status: ModifyStatus; detail?: string }
  | { kind: 'booking'; changed: boolean; bookingIds: string[]; outcomes: Record<string, BookingOutcome>; detail?: string }
  | { kind: 'unattributed'; changed: false };

export function getAdminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

/**
 * Paystack's metadata is documented as a "Stringified JSON object", and comes back from the API as
 * an object, a JSON string, `""` or `null` depending on how the transaction was started. Normalise
 * it so callers only ever deal with an object.
 */
// deno-lint-ignore no-explicit-any
export function readMetadata(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** What a transaction's metadata says it is for, without touching the database. */
export type TransactionIntent =
  | { kind: 'wopedriver'; driverBookingId: string; payerId: string }
  | { kind: 'balance'; bookingIds: string[]; payerId: string }
  | { kind: 'modify'; bookingIds: string[]; payerId: string }
  | { kind: 'booking'; bookingIds: string[]; payerId: string }
  | { kind: 'unattributed' };

export function readIntent(metadata: unknown): TransactionIntent {
  const meta = readMetadata(metadata);
  const payerId = typeof meta.user_id === 'string' ? meta.user_id : null;
  if (meta.purpose === 'wopedriver' && typeof meta.driver_booking_id === 'string' && payerId) {
    return { kind: 'wopedriver', driverBookingId: meta.driver_booking_id, payerId };
  }
  const bookingIds = Array.isArray(meta.booking_ids) ? meta.booking_ids.filter((id: unknown) => typeof id === 'string') : [];
  if (bookingIds.length === 0 || !payerId) return { kind: 'unattributed' };
  if (meta.purpose === 'balance') return { kind: 'balance', bookingIds, payerId };
  if (meta.purpose === 'modify') return { kind: 'modify', bookingIds, payerId };
  return { kind: 'booking', bookingIds, payerId };
}

/**
 * A paid booking change (paystack-initialize purpose 'modify'): apply the change saved for this
 * reference through modify-booking, on the renter's behalf, if the website callback hasn't already.
 * modify-booking makes this idempotent per reference.
 *
 * Throws on a transient failure (modify-booking 5xx) so the caller retries - the webhook by
 * answering Paystack with a 500, the reconcile sweep on its next run.
 */
async function applyPaidModification(adminClient: SupabaseClient, reference: string): Promise<ApplyOutcome> {
  const { data: pending } = await adminClient
    .from('pending_booking_modifications')
    .select('booking_id, renter_id, amount, applied_at')
    .eq('reference', reference)
    .maybeSingle();
  if (!pending) {
    console.error(`paystack-apply ${reference}: modify payment with no saved change`);
    return { kind: 'modify', changed: false, status: 'no_saved_change' };
  }
  if (pending.applied_at) return { kind: 'modify', changed: false, status: 'already_applied' };

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
    // Someone else (the website callback) is applying it right now - don't race them.
    return { kind: 'modify', changed: false, status: 'in_progress' };
  }
  if (res.ok && body.success) {
    console.log(`paystack-apply ${reference}: modification ${body.alreadyApplied ? 'already applied' : 'applied'}`);
    return body.alreadyApplied
      ? { kind: 'modify', changed: false, status: 'already_applied' }
      : { kind: 'modify', changed: true, status: 'applied' };
  }
  if (res.status >= 500) {
    // Transient: let the caller retry.
    throw new Error(`modify-booking ${res.status}: ${body.error ?? 'unknown error'}`);
  }
  // Refused (e.g. the price changed, the booking was cancelled): the renter has paid, so a person
  // must sort it out.
  const reason = `${res.status}: ${body.error ?? 'unknown error'}`;
  console.error(`paystack-apply ${reference}: paid change refused: ${reason}`);
  await alertSupportPaidChangeNotApplied(adminClient, reference, pending, reason);
  return { kind: 'modify', changed: false, status: 'refused', detail: reason };
}

// deno-lint-ignore no-explicit-any
async function alertSupportPaidChangeNotApplied(adminClient: SupabaseClient, reference: string, pending: any, reason: string) {
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

/**
 * Applies one successful transaction. `tx` must already have been fetched from Paystack
 * (fetchPaystackTransaction) rather than taken from a webhook body or a list response.
 *
 * Throws PaymentRejected when the payment cannot legitimately be applied (a decision - don't
 * retry), or a plain Error on a transient failure (do retry).
 */
export async function applyPaystackSuccess(
  adminClient: SupabaseClient,
  opts: { reference: string; tx: PaystackTransaction }
): Promise<ApplyOutcome> {
  const { reference, tx } = opts;
  const intent = readIntent(tx.metadata);

  if (intent.kind === 'unattributed') return { kind: 'unattributed', changed: false };

  if (intent.kind === 'wopedriver') {
    const result = await confirmDriverPaymentFromPaystack(adminClient, {
      driverBookingId: intent.driverBookingId,
      reference,
      tx,
      payerId: intent.payerId,
    });
    return { kind: 'wopedriver', changed: result.status === 'applied', status: result.status };
  }

  if (intent.kind === 'modify') {
    return await applyPaidModification(adminClient, reference);
  }

  if (intent.kind === 'balance') {
    const result = await confirmBalanceFromPaystack(adminClient, {
      bookingId: intent.bookingIds[0],
      reference,
      tx,
      payerId: intent.payerId,
    });
    if (result.status === 'applied') await triggerBalanceQuickbooks(adminClient, result.paymentId);
    return { kind: 'balance', changed: result.status === 'applied', status: result.status };
  }

  // Ordinary checkout. Read the current payment state first: confirmBookingsForReference reports
  // 'confirmed' both for a booking it just flipped and for one that was already paid with this
  // reference, and only the first of those should set off emails.
  const { data: before } = await adminClient.from('bookings').select('id, payment_status').in('id', intent.bookingIds);
  const wasUnpaid = new Set((before ?? []).filter((b) => b.payment_status !== 'paid').map((b) => b.id));

  const outcomes = await confirmBookingsForReference(adminClient, {
    reference,
    bookingIds: intent.bookingIds,
    tx,
    payerId: intent.payerId,
  });

  const newlyPaid = Object.entries(outcomes)
    .filter(([id, outcome]) => outcome === 'confirmed' && wasUnpaid.has(id))
    .map(([id]) => id);

  // The app and website fire these themselves right after a successful checkout; they only need
  // firing here when the client never came back. Both are one-shot server-side (migration 0173),
  // so a client that did come back means these return 'skipped' instead of sending twice.
  for (const bookingId of newlyPaid) await notifyBookingPaid(adminClient, bookingId);

  return {
    kind: 'booking',
    changed: newlyPaid.length > 0,
    bookingIds: intent.bookingIds,
    outcomes,
    detail: newlyPaid.length > 0 ? `newly paid: ${newlyPaid.join(', ')}` : undefined,
  };
}

/**
 * The "booking received" email to the renter/admin and the "a booking needs your review" email to
 * the vendor - the two best-effort calls app/checkout/payment.js makes after a successful charge,
 * which nothing fired when the client never got that far. QuickBooks needs no equivalent:
 * quickbooks-reconcile already catches up paid bookings with no invoice.
 *
 * Best-effort and never throws: the payment is already recorded, and a failed email must not undo
 * it or make the caller retry.
 */
export async function notifyBookingPaid(adminClient: SupabaseClient, bookingId: string): Promise<void> {
  const secret = await getInternalSecret();
  if (!secret) {
    console.error(`notifyBookingPaid ${bookingId}: no internal secret, skipping emails`);
    return;
  }
  const url = Deno.env.get('SUPABASE_URL');
  for (const fn of ['send-booking-confirmation', 'send-booking-request-vendor']) {
    try {
      const res = await fetch(`${url}/functions/v1/${fn}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
          'x-cron-secret': secret,
        },
        body: JSON.stringify({ bookingId }),
      });
      if (!res.ok) console.error(`${fn} for ${bookingId}: ${res.status} ${await res.text()}`);
    } catch (e) {
      console.error(`${fn} for ${bookingId} failed:`, e instanceof Error ? e.message : e);
    }
  }
}

export { PaymentRejected };
