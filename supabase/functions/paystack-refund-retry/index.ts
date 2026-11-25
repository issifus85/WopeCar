// Supabase Edge Function - finishes cancellation refunds that Paystack refused.
//
// cancel-booking has always computed the refund and called Paystack itself, identically for every
// surface (admin, renter, vendor). What it could not do was survive a refusal: the error went back
// in the HTTP response, the admin's cancel dialog showed it once, and then it was gone. Nothing was
// recorded on the booking, nobody was alerted, and nothing ever tried again.
//
// That is what this closes. cancel-booking now writes what is still owed (bookings.refund_owed) and
// the transactions it comes out of (bookings.refund_plan) - see migration 0179 - and this sweep
// works through that queue every 15 minutes until it is empty.
//
// The most common reason a refund is refused is the one that caused the two live misses on
// 2026-11-19: Paystack funds refunds out of the account's available balance, which was GH₵0.78
// against refunds of GH₵14,783.70 and GH₵6,011.00. That is not a code failure and no retry can fix
// it on its own - so the escalation matters as much as the retry: after RETRY_ALERT_ATTEMPTS tries
// the team gets an email naming the bookings and the amount, and the admin's Refunds Outstanding
// page shows the queue the whole time.
//
// Deliberately NOT done here:
//   - No recomputing of the refund. The tier depends on hours-until-pickup at the moment of
//     cancellation; recomputing it days later would silently reprice (or zero) a refund the renter
//     was already promised. The frozen plan is replayed as-is.
//   - No refund for money that did not come in through Paystack ("Mark as Paid" bank / mobile money
//     references, which Paystack knows nothing about). Those are flagged for a person and closed out
//     with admin_settle_booking_refund() once the money has been sent back the same way it came in.
//
// Body (all optional): {"dryRun": true} reports what it would do and changes nothing;
//                      {"bookingId": "..."} works one booking immediately, ignoring the spacing rule
//                        (this is what the admin's "Retry refund now" button calls);
//                      {"minAgeMinutes": n} overrides how long to leave a booking between attempts.
//
// Who may call it: deployed with verify_jwt=false (pg_cron has no user session) and authenticated
// EITHER on the x-cron-secret shared secret (the cron job) OR on a signed-in admin's own JWT, which
// is what the dashboard's "Retry refund now" button uses - checked here the same way cancel-booking
// checks it, so the dashboard needs no copy of the cron secret.
//
// Deploy with: supabase functions deploy paystack-refund-retry --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isTrustedInternalCaller, unauthorizedResponse } from '../_shared/cronAuth.ts';
import { executeRefundPlan, readRefundPlan, type RefundPart } from '../_shared/cancellationRefund.ts';
import { raisePaymentAlert } from '../_shared/alerts.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/** Leave an hour between attempts on the same booking: a refused refund is almost never fixed in 15 minutes. */
const DEFAULT_MIN_AGE_MINUTES = 60;
/** How many bookings to work through in one run - the queue is normally empty, this is a safety rail. */
const MAX_PER_RUN = 25;
/** From this many attempts on, a still-unpaid refund is escalated to the team by email. */
const RETRY_ALERT_ATTEMPTS = 3;

type Outcome = {
  booking_ref: string;
  owed_before: number;
  processed: number;
  owed_after: number;
  settled: boolean;
  error: string | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // The cron secret, or failing that a signed-in admin/support account.
    let caller = 'cron';
    if (!(await isTrustedInternalCaller(req))) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return unauthorizedResponse();
      const callerClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: getUserError } = await callerClient.auth.getUser();
      if (getUserError || !user) return unauthorizedResponse();
      const probe = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { data: profile } = await probe.from('users').select('role, is_support').eq('id', user.id).maybeSingle();
      if (profile?.role !== 'admin' && !profile?.is_support) return unauthorizedResponse();
      caller = user.id;
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = !!body?.dryRun;
    const singleBookingId: string | null = typeof body?.bookingId === 'string' && body.bookingId ? body.bookingId : null;
    const minAgeMinutes = Number.isFinite(Number(body?.minAgeMinutes)) ? Number(body.minAgeMinutes) : DEFAULT_MIN_AGE_MINUTES;

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY');

    let query = admin
      .from('bookings')
      .select('id, booking_ref, refund_owed, refund_plan, refund_attempts, refund_last_attempt_at, payment_status, refund_amount')
      .gt('refund_owed', 0)
      .order('refund_last_attempt_at', { ascending: true, nullsFirst: true })
      .limit(MAX_PER_RUN);
    if (singleBookingId) {
      // One booking on demand: still only if it really is owed something (the .gt above stands), but
      // without waiting out the spacing rule - a person is watching this one.
      query = query.eq('id', singleBookingId);
    } else {
      const cutoff = new Date(Date.now() - minAgeMinutes * 60000).toISOString();
      query = query.or(`refund_last_attempt_at.is.null,refund_last_attempt_at.lte.${cutoff}`);
    }

    const { data: owing, error: queryError } = await query;
    if (queryError) return jsonResponse({ error: queryError.message }, 500);

    if (!owing || owing.length === 0) {
      return jsonResponse({ dryRun, scanned: 0, settled: [], stillOwed: [], message: singleBookingId ? 'No outstanding refund on that booking.' : 'Nothing owed.' });
    }

    const settled: Outcome[] = [];
    const stillOwed: Outcome[] = [];
    const escalate: { ref: string; owed: number; attempts: number; error: string | null }[] = [];

    for (const booking of owing) {
      const owed = Number(booking.refund_owed);
      const parts: RefundPart[] = readRefundPlan(booking.refund_plan);
      const paidOffPaystack = parts.length > 0 && parts.every((p) => !p.ref);

      if (dryRun) {
        (owed > 0 ? stillOwed : settled).push({
          booking_ref: booking.booking_ref,
          owed_before: owed,
          processed: 0,
          owed_after: owed,
          settled: false,
          error: parts.length === 0 ? 'No refund plan stored — needs a person.' : paidOffPaystack ? 'Paid outside Paystack — needs a person.' : null,
        });
        continue;
      }

      // A booking with nothing to replay can never be fixed by retrying - stop burning attempts on
      // it and leave it in the queue for a person (the Refunds Outstanding page shows it).
      if (parts.length === 0 || paidOffPaystack) {
        const why = parts.length === 0
          ? 'No Paystack transaction recorded for this refund — return it by hand, then record it with "Mark refund as settled".'
          : 'This booking was paid outside Paystack — return the refund the way the money came in, then record it with "Mark refund as settled".';
        await admin.from('bookings').update({ refund_error: why, refund_last_attempt_at: new Date().toISOString() }).eq('id', booking.id);
        stillOwed.push({ booking_ref: booking.booking_ref, owed_before: owed, processed: 0, owed_after: owed, settled: false, error: why });
        escalate.push({ ref: booking.booking_ref, owed, attempts: Number(booking.refund_attempts), error: why });
        continue;
      }

      const attempt = await executeRefundPlan(paystackSecretKey, parts, owed, { paidOffPaystack });
      const attempts = Number(booking.refund_attempts) + 1;
      const owedAfter = attempt.remaining;
      const fullySettled = owedAfter <= 0.01;

      const patch: Record<string, unknown> = {
        refund_owed: fullySettled ? 0 : owedAfter,
        refund_plan: fullySettled ? null : attempt.remainingParts,
        refund_error: fullySettled ? null : attempt.error,
        refund_attempts: attempts,
        refund_last_attempt_at: new Date().toISOString(),
      };
      if (attempt.processed > 0) {
        patch.refund_amount = Math.round((Number(booking.refund_amount ?? 0) + attempt.processed) * 100) / 100;
        if (fullySettled && booking.payment_status === 'paid') patch.payment_status = 'refunded';
      }
      const { error: updateError } = await admin.from('bookings').update(patch).eq('id', booking.id);
      if (updateError) {
        // The money may well have moved - say so loudly rather than let the next run refund it again.
        console.error(`paystack-refund-retry ${booking.booking_ref}: refunded ${attempt.processed} but could not record it: ${updateError.message}`);
        await raisePaymentAlert(
          admin,
          'refund_record_failed',
          `refund of GH₵${attempt.processed.toFixed(2)} went through but was not recorded - ${booking.booking_ref}`,
          `Paystack accepted GH₵${attempt.processed.toFixed(2)} for booking ${booking.booking_ref}, but writing it back to the booking failed. Check the booking before any further retry so the renter is not refunded twice.`,
          updateError.message
        );
        continue;
      }

      const outcome: Outcome = {
        booking_ref: booking.booking_ref,
        owed_before: owed,
        processed: attempt.processed,
        owed_after: fullySettled ? 0 : owedAfter,
        settled: fullySettled,
        error: fullySettled ? null : attempt.error,
      };
      if (fullySettled) {
        console.log(`paystack-refund-retry ${booking.booking_ref}: refunded GH₵${attempt.processed.toFixed(2)} on attempt ${attempts}`);
        settled.push(outcome);
      } else {
        stillOwed.push(outcome);
        if (attempts >= RETRY_ALERT_ATTEMPTS) escalate.push({ ref: booking.booking_ref, owed: owedAfter, attempts, error: attempt.error });
      }
    }

    if (!dryRun && escalate.length > 0) {
      const total = escalate.reduce((sum, e) => sum + e.owed, 0);
      await raisePaymentAlert(
        admin,
        'refund_stuck',
        `${escalate.length} cancellation refund${escalate.length === 1 ? '' : 's'} still not paid - GH₵${total.toFixed(2)}`,
        `${escalate.length} cancelled booking${escalate.length === 1 ? ' has a refund' : 's have refunds'} that Paystack keeps refusing, GH₵${total.toFixed(2)} owed to renters in total. The most common cause is the Paystack balance: refunds are funded from the available balance, so a top-up usually clears the whole queue by itself. Everything here is retried automatically every 15 minutes.`,
        escalate.map((e) => `${e.ref}: GH₵${e.owed.toFixed(2)} owed after ${e.attempts} attempt${e.attempts === 1 ? '' : 's'} — ${e.error ?? 'unknown error'}`).join('\n')
      );
    }

    if (settled.length > 0 || escalate.length > 0) {
      console.log(`paystack-refund-retry (${caller === 'cron' ? 'cron' : `admin ${caller}`}): settled ${settled.length}, still owed ${stillOwed.length}`);
    }
    return jsonResponse({ dryRun, scanned: owing.length, settled, stillOwed, escalated: escalate.length });
  } catch (e) {
    console.error(`paystack-refund-retry error: ${e instanceof Error ? e.message : e}`);
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
