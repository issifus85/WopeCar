// Supabase Edge Function - the single, authoritative cancel-a-booking path
// for every surface (web admin, mobile admin, mobile renter, mobile
// vendor). Centralizing this here (rather than each surface doing its own
// `.update({status: 'cancelled'})`) is deliberate: it's the only way the
// tiered cancellation-refund policy (app_settings:
// cancellation_full_refund_hours / cancellation_partial_refund_hours /
// cancellation_partial_refund_percentage), the real Paystack refund call,
// and full notification coverage (in-app + push, for renter, vendor, AND
// every admin/support user) are guaranteed to be applied identically
// everywhere, instead of independent reimplementations drifting apart. The
// vendor's own decline flow (services/vendorBookingsApi.js's
// declineBookingRequest) used to bypass this with a raw table update -
// fixed to route through here too, closing a real gap where declining
// produced zero in-app/push notifications for anyone.
//
// Business rules enforced here (matches the same rules already documented
// for the web admin's Bookings page):
//   - Admins/support may cancel a 'pending' or 'confirmed' booking.
//   - Renters may only cancel their OWN 'pending' booking (confirmed
//     bookings are admin-only, same as everywhere else in this app).
//   - Vendors may only decline (cancel) their OWN 'pending' booking, same
//     restriction as renters - declining only makes sense before they've
//     accepted; once confirmed, only an admin can cancel it. Sets
//     vendor_accepted=false so vendorStatusFor() in vendorBookingsApi.js
//     still shows this as "Declined" rather than a generic "Cancelled",
//     matching what the old raw-update code did.
//   - A refund is only attempted if payment_status = 'paid'. The refund
//     percentage is computed from hours-until-pickup against the two
//     configured thresholds; 100% at/above the full-refund threshold, the
//     configured partial percentage between the two thresholds, 0% below
//     the partial threshold.
//   - The real Paystack refund is a best-effort, synchronous API call
//     against the booking's own `payment_ref` (Paystack's transaction
//     reference, set at checkout - see app/checkout/payment.js). A booking
//     paid by hand (admin "Mark as Paid") carries a bank / mobile money
//     reference there instead, which Paystack knows nothing about: those are
//     skipped and reported as a manual follow-up. If the call itself
//     fails (e.g. Paystack outage, an insufficient Paystack balance, an
//     already-refunded transaction), the booking still gets cancelled - a
//     refund owed should never block the cancellation itself.
//   - Whatever Paystack would not take is RECORDED, not just reported:
//     bookings.refund_owed / refund_plan (migration 0179) hand it to the
//     paystack-refund-retry sweep, and the team is emailed at once. Before
//     that existed, a refused refund lived only in this function's HTTP
//     response - seen once in the cancel dialog, then gone, with nothing
//     retrying it. Two live cancellations on 2026-11-19 were lost that way
//     (GH₵14,783.70 and GH₵6,011.00, both refused over a GH₵0.78 Paystack
//     balance). The refund maths itself moved to _shared/cancellationRefund.ts
//     so the sweep can never price a refund differently than this did.
//
// Notifications: in-app (notifications table) + push (send-push-notification
// Edge Function) for the renter, the vendor (if one is assigned), and every
// admin/support user (role='admin' or is_support=true) - matches exactly
// who send-booking-cancelled already emails, now with in-app/push parity
// too. Best-effort throughout - a failed notification never fails the
// cancellation itself.
//
// Deploy with: supabase functions deploy cancel-booking
// (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
// injected automatically; PAYSTACK_SECRET_KEY is the same secret
// paystack-initialize/paystack-verify already use.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getInternalSecret } from '../_shared/cronAuth.ts';
import { executeRefundPlan, planCancellationRefund } from '../_shared/cancellationRefund.ts';
import { raisePaymentAlert } from '../_shared/alerts.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header.' }, 401);
    }

    const { bookingId, reason } = await req.json();
    if (!bookingId) {
      return jsonResponse({ error: 'bookingId is required.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY');

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller }, error: getUserError } = await callerClient.auth.getUser();
    if (getUserError || !caller) {
      return jsonResponse({ error: 'Invalid or expired session.' }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile } = await adminClient.from('users').select('role, is_support').eq('id', caller.id).single();
    const isAdmin = callerProfile?.role === 'admin' || !!callerProfile?.is_support;

    const { data: booking, error: bookingError } = await adminClient.from('bookings').select('*').eq('id', bookingId).single();
    if (bookingError || !booking) {
      return jsonResponse({ error: 'Booking not found.' }, 404);
    }

    let vendorUserId: string | null = null;
    if (booking.vendor_id) {
      const { data: vendor } = await adminClient.from('vendors').select('user_id').eq('id', booking.vendor_id).single();
      vendorUserId = vendor?.user_id ?? null;
    }

    const isOwner = booking.renter_id === caller.id;
    const isVendorCaller = !!vendorUserId && vendorUserId === caller.id;
    if (!isAdmin && !isOwner && !isVendorCaller) {
      return jsonResponse({ error: 'Not authorized to cancel this booking.' }, 403);
    }
    if (booking.status === 'cancelled' || booking.status === 'completed') {
      return jsonResponse({ error: `This booking is already ${booking.status} and cannot be cancelled.` }, 400);
    }
    if (!isAdmin && booking.status !== 'pending') {
      return jsonResponse({ error: 'Only an admin can cancel a confirmed booking.' }, 403);
    }

    let refundAmount = 0;
    let refundPercentage = 0;
    let refundProcessed = false;
    let inTrip = false; // the scheduled pickup time has passed: Terms of Service 5.2 - nothing is refunded automatically
    let refundedSoFar = 0; // what Paystack actually accepted (can be less than refundAmount if one of several refunds failed)
    let refundError: string | null = null;
    let refundOwed = 0; // left for paystack-refund-retry (and visible in the admin) when Paystack refused
    let refundPlan: { ref: string | null; cap: number }[] = [];

    if (booking.payment_status === 'paid') {
      // What is owed, and out of which Paystack transactions. Worked out HERE and only here: the
      // tier depends on hours-until-pickup right now, so a retry hours or days later must replay
      // this decision rather than make its own (see _shared/cancellationRefund.ts).
      const plan = await planCancellationRefund(adminClient, booking);
      refundAmount = plan.amount;
      refundPercentage = plan.percentage;
      inTrip = plan.inTrip;

      const attempt = await executeRefundPlan(paystackSecretKey, plan.parts, refundAmount, { paidOffPaystack: plan.paidOffPaystack });
      refundedSoFar = attempt.processed;
      refundError = attempt.error;
      refundProcessed = refundAmount > 0 && attempt.remaining <= 0.01;
      // Anything Paystack would not take is remembered rather than lost with the HTTP response.
      // paystack-refund-retry works through this every 15 minutes and escalates by email if it
      // stays stuck; the admin's Refunds Outstanding page shows it the whole time.
      refundOwed = refundProcessed ? 0 : attempt.remaining;
      refundPlan = refundProcessed ? [] : attempt.remainingParts;
    }

    const updatePatch: Record<string, unknown> = { status: 'cancelled', cancellation_reason: reason || null };
    if (isVendorCaller) {
      updatePatch.vendor_accepted = false;
    }
    if (refundProcessed) {
      updatePatch.payment_status = 'refunded';
      updatePatch.refund_amount = refundAmount;
    } else if (refundedSoFar > 0) {
      updatePatch.refund_amount = refundedSoFar; // partly refunded - the rest is owed (refundOwed below)
    }
    // Hand anything Paystack refused to the retry sweep instead of losing it with this response.
    if (refundOwed > 0) {
      updatePatch.refund_owed = refundOwed;
      updatePatch.refund_plan = refundPlan;
      updatePatch.refund_error = refundError;
      updatePatch.refund_attempts = 1;
      updatePatch.refund_last_attempt_at = new Date().toISOString();
    }
    const { error: updateError } = await adminClient.from('bookings').update(updatePatch).eq('id', bookingId);
    if (updateError) {
      return jsonResponse({ error: updateError.message }, 500);
    }

    // Tell the team the moment money is owed and did not move. Until this existed, the only trace
    // of a refused refund was the sentence in the cancel dialog, seen once by whoever clicked it.
    if (refundOwed > 0) {
      await raisePaymentAlert(
        adminClient,
        'refund_not_processed',
        `refund of GH₵${refundOwed.toFixed(2)} could not be paid - ${booking.booking_ref}`,
        `Booking ${booking.booking_ref} was cancelled by ${isAdmin ? 'WopeCar Support' : isOwner ? 'the renter' : 'the vendor'} and GH₵${refundOwed.toFixed(2)} is owed to the renter, but Paystack would not process it. It is now in the automatic retry queue (every 15 minutes) and on the Refunds Outstanding page in the admin. If the cause is the Paystack balance - refunds are funded from the available balance - a top-up clears it with no further action.`,
        refundError ?? undefined
      );
    }

    // Who did it, in the words a recipient should read. Admin/support is
    // checked BEFORE ownership: a staff account that is also the booking's
    // renter (common for internal test accounts) cancelling from the admin
    // tools is still WopeCar Support cancelling, not "the client".
    const cancelledByLabel = isAdmin ? 'WopeCar Support' : isOwner ? 'the client' : 'the vendor';
    const cancelledBySuffix = isAdmin ? ' by WopeCar Support' : isVendorCaller ? ' by the vendor' : '';

    let renterBody = `Your booking ${booking.booking_ref} was cancelled${cancelledBySuffix}.`;
    if (refundProcessed) {
      renterBody += ` GH₵${Math.round(refundAmount)} has been refunded.`;
    } else if (refundAmount > 0) {
      renterBody += ` A refund of GH₵${Math.round(refundAmount)} is due but could not be processed automatically — our team will follow up.`;
    } else if (booking.payment_status === 'paid' && inTrip) {
      renterBody += ' The trip had already started, so no refund applies for unused days (Terms of Service, section 5.2). Your security deposit is returned after the vehicle has been inspected.';
    } else if (booking.payment_status === 'paid') {
      renterBody += ' This cancellation falls outside our refund window, so no refund applies.';
    }
    if (reason) renterBody += ` Reason: ${reason}`;

    const pushNotifications: { userId: string; title: string; body: string }[] = [];
    // One notification per person: the renter/vendor rows below and the
    // admin fan-out can name the same user (a staff renter, or a vendor who
    // is also support), who used to receive both.
    const notified = new Set<string>();

    notified.add(booking.renter_id);
    await adminClient.from('notifications').insert({
      user_id: booking.renter_id,
      type: 'booking_cancelled',
      title: 'Booking cancelled',
      body: renterBody,
      booking_id: booking.id,
    });
    pushNotifications.push({ userId: booking.renter_id, title: 'Booking cancelled', body: renterBody });

    if (vendorUserId && !notified.has(vendorUserId)) {
      notified.add(vendorUserId);
      const vendorBody = `Booking ${booking.booking_ref} was cancelled${cancelledBySuffix}.${reason ? ` Reason: ${reason}` : ''}`;
      await adminClient.from('notifications').insert({
        user_id: vendorUserId,
        type: 'booking_cancelled',
        title: 'Booking cancelled',
        body: vendorBody,
        booking_id: booking.id,
      });
      pushNotifications.push({ userId: vendorUserId, title: 'Booking cancelled', body: vendorBody });
    }

    // Admin/support - every admin gets an in-app + push notification too
    // now (previously email-only for this event, same as every other
    // booking event in this app). "cancelledBy" mirrors send-booking-
    // cancelled's own wording for the admin email.
    const adminBody = `Booking ${booking.booking_ref} was cancelled by ${cancelledByLabel}.${reason ? ` Reason: ${reason}` : ''}${inTrip ? ' Trip already started: no automatic refund was made; the security deposit is returned after the inspection.' : ''}`;
    const { data: adminUsers } = await adminClient.from('users').select('id').or('role.eq.admin,is_support.eq.true');
    for (const adminUser of adminUsers ?? []) {
      // Skip anyone already told above, and the staff member who just did
      // the cancelling themselves.
      if (notified.has(adminUser.id) || adminUser.id === caller.id) continue;
      notified.add(adminUser.id);
      await adminClient.from('notifications').insert({
        user_id: adminUser.id,
        type: 'booking_cancelled',
        title: 'Booking cancelled',
        body: adminBody,
        booking_id: booking.id,
      });
      pushNotifications.push({ userId: adminUser.id, title: 'Booking cancelled', body: adminBody });
    }

    if (pushNotifications.length) {
      await adminClient.functions.invoke('send-push-notification', { body: { notifications: pushNotifications } }).catch(() => {});
    }

    // QuickBooks credit note - fire-and-forget, errors logged not thrown: a
    // QuickBooks failure must never undo or fail a cancellation that
    // already succeeded above.
    if (refundAmount > 0) {
      try {
        // quickbooks-credit-note only accepts staff or this internal secret - a renter cancelling
        // their own booking is not allowed to post credit memos directly.
        const internalSecret = await getInternalSecret();
        await fetch(`${supabaseUrl}/functions/v1/quickbooks-credit-note`, {
          method: 'POST',
          headers: { Authorization: authHeader, 'Content-Type': 'application/json', ...(internalSecret ? { 'x-cron-secret': internalSecret } : {}) },
          body: JSON.stringify({ bookingId: booking.id, refundAmount, reason: reason || 'Booking cancellation refund' }),
        });
      } catch (e) {
        console.error('QuickBooks credit note failed:', e);
      }
    }

    return jsonResponse({ success: true, refunded: refundProcessed, refundAmount, refundPercentage, refundError, inTrip, refundOwed, refundedSoFar });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
