// Supabase Edge Function - Paystack catch-up sweep. Runs every 15 minutes from pg_cron (internal
// secret, no user session).
//
// Why it exists: a Paystack charge only becomes a paid booking through one of two routes - the
// client coming back from checkout (confirm-booking-payment / confirm-balance-payment /
// confirm-driver-booking-payment) or Paystack's webhook (paystack-webhook). If the customer pays
// and closes the tab AND the webhook delivery is lost or keeps failing, the money is taken and the
// booking stays `unpaid` with nobody alerted - until the 24h hold (expire_unpaid_bookings, called
// by quickbooks-reconcile) quietly cancels it. Nothing checked Paystack's own record of what
// succeeded. This does.
//
// Each run:
//   1. lists SUCCESSFUL transactions from Paystack for the lookback window (default 48h);
//   2. works out what each one was for from the metadata paystack-initialize stamped on it;
//   3. asks the database whether it has already been applied (every path keys on the reference);
//   4. for the ones that have not: re-verifies the transaction with Paystack and applies it through
//      _shared/paystackApply.ts - the very same code paystack-webhook runs, so a sweep can never
//      make a different decision from the webhook;
//   5. emails the support/admin address about anything it applied (a webhook was missed) or
//      anything a person has to decide.
//
// What it deliberately does NOT do automatically:
//   - a transaction with no WopeCar metadata (older app builds, QuickBooks pay-later links) cannot
//     be attributed to a booking, so it is only counted, and flagged for review when its amount and
//     customer email match an unpaid booking;
//   - a payment whose booking has since been CANCELLED is flagged, never applied: marking a
//     cancelled booking paid feeds vendor payout totals and is awkward to undo, so a person decides
//     whether to reinstate the trip or refund.
//
// Body (all optional): {"dryRun": true} lists what it would do and changes nothing;
// {"hours": 72} widens the lookback (capped at 7 days); {"reference": "abc123"} re-applies one
// specific transaction, for support recovering a single payment by hand.
//
// Uses the existing PAYSTACK_SECRET_KEY secret. Deployed WITH JWT verification: the pg_cron job
// sends the project's anon key like every other cron job, and isTrustedInternalCaller (the
// x-cron-secret in internal_secrets) is what actually authorizes the call.
//
// Deploy with: supabase functions deploy paystack-reconcile

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchPaystackTransaction } from '../_shared/confirmPayment.ts';
import { applyPaystackSuccess, getAdminClient, PaymentRejected, readIntent, type ApplyOutcome, type TransactionIntent } from '../_shared/paystackApply.ts';
import { raisePaymentAlert } from '../_shared/alerts.ts';
import { isTrustedInternalCaller, unauthorizedResponse } from '../_shared/cronAuth.ts';

const DEFAULT_HOURS = 48; // longer than the 24h unpaid hold, so a payment that slipped through is still found after the booking was auto-cancelled
const MAX_HOURS = 7 * 24;
const MIN_AGE_MS = 10 * 60 * 1000; // give the client redirect and the webhook their chance first
const PER_PAGE = 100;
const MAX_PAGES = 10; // 1,000 transactions per run is far beyond real volume; a guard, not a target
const MAX_APPLIES = 20;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

type ListedTransaction = {
  reference: string;
  status: string;
  amount: number; // pesewas
  currency: string | null;
  paidAt: string | null;
  channel: string | null;
  customerEmail: string | null;
  metadata: unknown;
};

/**
 * Paystack's List Transactions endpoint. Paginated with `page`; `meta.next` is an opaque cursor and
 * `meta` carries no page count, so paging stops on the first empty page (or the page guard).
 */
async function listSuccessfulTransactions(secretKey: string, fromIso: string, toIso: string): Promise<ListedTransaction[]> {
  const all: ListedTransaction[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `https://api.paystack.co/transaction?status=success&perPage=${PER_PAGE}&page=${page}&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${secretKey}` } });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.status) {
      throw new Error(`Paystack list transactions failed (${res.status}): ${json?.message ?? res.statusText}`);
    }
    const rows = Array.isArray(json.data) ? json.data : [];
    if (rows.length === 0) break;
    for (const d of rows) {
      if (typeof d?.reference !== 'string') continue;
      all.push({
        reference: d.reference,
        status: String(d.status ?? ''),
        amount: Number(d.amount) || 0,
        currency: d.currency ?? null,
        paidAt: d.paid_at ?? d.paidAt ?? null,
        channel: d.channel ?? null,
        customerEmail: typeof d.customer?.email === 'string' ? d.customer.email.toLowerCase() : null,
        metadata: d.metadata,
      });
    }
    if (rows.length < PER_PAGE) break;
  }
  return all;
}

type Classification =
  | { state: 'applied' }
  | { state: 'candidate' }
  | { state: 'review'; reason: string };

/**
 * Has this transaction already landed in our database? Every apply path keys on the Paystack
 * reference, so each kind has one cheap, exact check.
 */
async function classify(admin: SupabaseClient, intent: TransactionIntent, reference: string): Promise<Classification> {
  // The sweep's main loop deals with these before getting here; a manually supplied reference can
  // still be one, and there is nothing in our data to match it against.
  if (intent.kind === 'unattributed') {
    return { state: 'review', reason: 'payment carries no booking reference, so it cannot be attributed automatically' };
  }

  if (intent.kind === 'wopedriver') {
    // driver_bookings/driver_booking_payments only exist where WopeDriver is deployed; a
    // 'wopedriver' transaction cannot occur anywhere else, but fail safe rather than loudly.
    const { data, error } = await admin.from('driver_booking_payments').select('id').eq('reference', reference).limit(1);
    if (error) return { state: 'review', reason: `could not check driver payments: ${error.message}` };
    return (data ?? []).length > 0 ? { state: 'applied' } : { state: 'candidate' };
  }

  if (intent.kind === 'balance') {
    const { data, error } = await admin.from('booking_balance_payments').select('id').eq('reference', reference).limit(1);
    if (error) return { state: 'review', reason: `could not check balance payments: ${error.message}` };
    return (data ?? []).length > 0 ? { state: 'applied' } : { state: 'candidate' };
  }

  if (intent.kind === 'modify') {
    const { data, error } = await admin
      .from('pending_booking_modifications')
      .select('applied_at')
      .eq('reference', reference)
      .maybeSingle();
    if (error) return { state: 'review', reason: `could not check saved changes: ${error.message}` };
    if (!data) return { state: 'review', reason: 'paid change has no saved change to apply' };
    return data.applied_at ? { state: 'applied' } : { state: 'candidate' };
  }

  // Ordinary checkout.
  const { data: bookings, error } = await admin
    .from('bookings')
    .select('id, booking_ref, status, payment_status, payment_ref')
    .in('id', intent.bookingIds);
  if (error) return { state: 'review', reason: `could not read bookings: ${error.message}` };
  if (!bookings || bookings.length !== intent.bookingIds.length) {
    return { state: 'review', reason: 'the booking this payment was for no longer exists' };
  }
  if (bookings.every((b) => b.payment_ref === reference && b.payment_status === 'paid')) return { state: 'applied' };

  const otherRef = bookings.find((b) => b.payment_ref && b.payment_ref !== reference);
  if (otherRef) {
    return {
      state: 'review',
      reason: `booking ${otherRef.booking_ref} is already recorded against a different payment (${otherRef.payment_ref})`,
    };
  }
  const cancelled = bookings.find((b) => b.status === 'cancelled');
  if (cancelled) {
    return {
      state: 'review',
      reason: `booking ${cancelled.booking_ref} was cancelled before this payment could be applied - reinstate the trip or refund the payment`,
    };
  }
  return { state: 'candidate' };
}

/** An unattributable payment is worth a human look if it matches an unpaid booking by payer and amount. */
async function looksLikeAMissedBooking(admin: SupabaseClient, tx: ListedTransaction, since: string): Promise<string | null> {
  if (!tx.customerEmail) return null;
  const { data: user } = await admin.from('users').select('id').ilike('email', tx.customerEmail).maybeSingle();
  if (!user) return null;
  const { data: bookings } = await admin
    .from('bookings')
    .select('booking_ref, total_cost')
    .eq('renter_id', user.id)
    .eq('payment_status', 'unpaid')
    .gte('created_at', since)
    .limit(20);
  const paid = tx.amount / 100;
  const match = (bookings ?? []).find((b) => Math.abs(Number(b.total_cost ?? 0) - paid) < 0.5);
  return match ? `matches unpaid booking ${match.booking_ref} (GHS ${Number(match.total_cost).toFixed(2)}) by payer and amount` : null;
}

function describe(outcome: ApplyOutcome): string {
  if (outcome.kind === 'booking') return `booking: ${JSON.stringify(outcome.outcomes)}`;
  if (outcome.kind === 'unattributed') return 'unattributed';
  return `${outcome.kind}: ${outcome.status}${outcome.detail ? ` (${outcome.detail})` : ''}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!(await isTrustedInternalCaller(req))) return unauthorizedResponse();

  const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!paystackSecretKey) return jsonResponse({ error: 'PAYSTACK_SECRET_KEY is not configured for this project.' }, 500);

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = !!body?.dryRun;
    const hours = Math.min(Math.max(Number(body?.hours) || DEFAULT_HOURS, 1), MAX_HOURS);
    const admin = getAdminClient();

    // Support recovery of one payment by hand: verify and apply exactly this reference.
    if (typeof body?.reference === 'string' && body.reference) {
      const tx = await fetchPaystackTransaction(body.reference, paystackSecretKey);
      if (tx.status !== 'success') return jsonResponse({ reference: body.reference, transaction_status: tx.status, applied: false });
      if (dryRun) {
        const intent = readIntent(tx.metadata);
        return jsonResponse({ dryRun: true, reference: tx.reference, intent, classification: await classify(admin, intent, tx.reference) });
      }
      const outcome = await applyPaystackSuccess(admin, { reference: tx.reference, tx });
      return jsonResponse({ reference: tx.reference, outcome });
    }

    const now = Date.now();
    const since = new Date(now - hours * 60 * 60 * 1000).toISOString();
    const until = new Date(now - MIN_AGE_MS).toISOString();

    const listed = await listSuccessfulTransactions(paystackSecretKey, since, until);
    const ripe = listed.filter((tx) => tx.status === 'success' && (!tx.paidAt || new Date(tx.paidAt).getTime() <= now - MIN_AGE_MS));

    const applied: { reference: string; detail: string }[] = [];
    const failed: { reference: string; detail: string }[] = [];
    const review: { reference: string; amount: number; email: string | null; reason: string }[] = [];
    let alreadyApplied = 0;
    let unattributed = 0;
    const wouldApply: { reference: string; amount: number; kind: string }[] = [];

    for (const tx of ripe) {
      const intent = readIntent(tx.metadata);

      if (intent.kind === 'unattributed') {
        unattributed++;
        const hint = await looksLikeAMissedBooking(admin, tx, since);
        if (hint) review.push({ reference: tx.reference, amount: tx.amount / 100, email: tx.customerEmail, reason: `payment carries no booking reference but ${hint}` });
        continue;
      }

      const verdict = await classify(admin, intent, tx.reference);
      if (verdict.state === 'applied') {
        alreadyApplied++;
        continue;
      }
      if (verdict.state === 'review') {
        review.push({ reference: tx.reference, amount: tx.amount / 100, email: tx.customerEmail, reason: verdict.reason });
        continue;
      }

      if (dryRun) {
        wouldApply.push({ reference: tx.reference, amount: tx.amount / 100, kind: intent.kind });
        continue;
      }
      if (applied.length + failed.length >= MAX_APPLIES) break;

      // Re-verify with Paystack: the list response is a lead, never the record we act on.
      try {
        const verified = await fetchPaystackTransaction(tx.reference, paystackSecretKey);
        const outcome = await applyPaystackSuccess(admin, { reference: tx.reference, tx: verified });
        if (outcome.changed) {
          applied.push({ reference: tx.reference, detail: describe(outcome) });
          console.log(`paystack-reconcile applied ${tx.reference}: ${describe(outcome)}`);
        } else {
          alreadyApplied++;
        }
      } catch (e) {
        const detail = e instanceof PaymentRejected ? `rejected: ${e.message}` : `error: ${e instanceof Error ? e.message : e}`;
        failed.push({ reference: tx.reference, detail });
        console.error(`paystack-reconcile ${tx.reference}: ${detail}`);
      }
    }

    const summary = {
      dryRun,
      window: { from: since, to: until, hours },
      scanned: ripe.length,
      alreadyApplied,
      unattributed,
      ...(dryRun ? { wouldApply } : { applied, failed }),
      review,
    };

    // Anything applied here means a webhook delivery was missed - worth knowing even though it was
    // put right automatically, because a pattern of them points at the webhook itself.
    if (!dryRun && applied.length > 0) {
      await raisePaymentAlert(
        admin,
        'paystack_webhook_missed',
        `${applied.length} Paystack payment${applied.length === 1 ? '' : 's'} had to be recovered automatically`,
        `${applied.length} successful Paystack payment${applied.length === 1 ? ' was' : 's were'} not recorded by the app, the website or the Paystack webhook, and ${applied.length === 1 ? 'was' : 'were'} applied by the catch-up sweep. The booking${applied.length === 1 ? ' is' : 's are'} now paid and the customer${applied.length === 1 ? ' has' : 's have'} been emailed - no action is needed for ${applied.length === 1 ? 'it' : 'them'}. If this keeps happening, check the webhook URL in the Paystack dashboard (Settings -> API Keys & Webhooks).`,
        applied.map((a) => `${a.reference}: ${a.detail}`).join('\n')
      );
    }
    if (!dryRun && (review.length > 0 || failed.length > 0)) {
      const items = [...review.map((r) => `${r.reference} (GHS ${r.amount.toFixed(2)}${r.email ? `, ${r.email}` : ''}): ${r.reason}`), ...failed.map((f) => `${f.reference}: ${f.detail}`)];
      await raisePaymentAlert(
        admin,
        'paystack_needs_review',
        `${items.length} Paystack payment${items.length === 1 ? '' : 's'} need${items.length === 1 ? 's' : ''} a decision`,
        `The catch-up sweep found successful Paystack payment${items.length === 1 ? '' : 's'} it could not apply on its own. Each one is real money already taken, so please reinstate the booking, record the payment by hand, or refund it.`,
        items.join('\n')
      );
    }

    return jsonResponse(summary);
  } catch (e) {
    // A PaymentRejected is a decision about one payment, not a fault here - only the manual
    // single-reference path can reach this (the sweep records them per transaction in `failed`), and
    // it should say 402/403/409 rather than make an operator think the sweep itself broke.
    if (e instanceof PaymentRejected) {
      console.error(`paystack-reconcile rejected: ${e.message}`);
      return jsonResponse({ error: e.message, rejected: true }, e.status);
    }
    console.error(`paystack-reconcile error: ${e instanceof Error ? e.message : e}`);
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
