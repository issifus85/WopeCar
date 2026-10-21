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
//     reference, set at checkout - see app/checkout/payment.js). If it
//     fails (e.g. Paystack outage, already-refunded transaction), the
//     booking still gets cancelled - the failure is reported back and
//     surfaced to the renter so a human can follow up manually. A refund
//     amount owed should never silently block the cancellation itself.
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
import { combineDateAndTime } from '../_shared/time.ts';

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

const DEFAULT_FULL_REFUND_HOURS = 168;
const DEFAULT_PARTIAL_REFUND_HOURS = 24;
const DEFAULT_PARTIAL_REFUND_PERCENTAGE = 0.5;

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
    let refundedSoFar = 0; // what Paystack actually accepted (can be less than refundAmount if one of several refunds failed)
    let refundError: string | null = null;

    if (booking.payment_status === 'paid') {
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

      if (hoursUntilPickup >= fullHours) refundPercentage = 1;
      else if (hoursUntilPickup >= partialHours) refundPercentage = partialPct;
      else refundPercentage = 0;

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
      // Each part is refunded against the Paystack transaction that took the money (a refund can't exceed its own transaction).
      const parts: { ref: string | null; cap: number }[] = [{ ref: booking.payment_ref, cap: originalPaid }];
      for (const m of mods ?? []) {
        const charged = Number(m.amount_charged);
        if (charged > 0) {
          if (m.payment_ref && m.payment_ref !== booking.payment_ref) parts.push({ ref: m.payment_ref, cap: charged });
          else parts[0].cap += charged;
        }
      }
      const paidBase = Math.round(parts.reduce((sum, part) => sum + part.cap, 0) * 100) / 100;
      // The security deposit is refundable by definition - it is only ever kept if the car comes back damaged - so cancelling before
      // the trip returns it in FULL at every tier, even inside the no-refund window. The tiers apply to the rest (rental, add-ons,
      // delivery, WopeCare, driver). The deposit paid is the one the booking had before its first modification (or its current one).
      const depositPaid = Math.min(
        paidBase,
        Math.max(0, mods && mods.length > 0 ? Number(mods[0].old_security_deposit ?? booking.security_deposit) : Number(booking.security_deposit))
      );
      refundAmount = Math.round((depositPaid + (paidBase - depositPaid) * refundPercentage) * 100) / 100;

      let processedTotal = 0;
      let remaining = refundAmount;
      if (refundAmount > 0) {
        if (!paystackSecretKey) {
          refundError = 'Refunds are not configured for this project yet — process this refund manually.';
        } else {
          for (const part of parts) {
            if (remaining <= 0.001) break;
            const take = Math.round(Math.min(remaining, part.cap) * 100) / 100;
            if (take <= 0) continue;
            if (!part.ref) {
              refundError = 'A payment on this booking has no Paystack reference — process the rest of the refund manually.';
              continue;
            }
            try {
              const paystackRes = await fetch('https://api.paystack.co/refund', {
                method: 'POST',
                headers: { Authorization: `Bearer ${paystackSecretKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ transaction: part.ref, amount: Math.round(take * 100) }),
              });
              const paystackJson = await paystackRes.json();
              if (paystackRes.ok && paystackJson.status) {
                processedTotal = Math.round((processedTotal + take) * 100) / 100;
                remaining = Math.round((remaining - take) * 100) / 100;
              } else {
                refundError = paystackJson.message || 'Paystack refund request failed — process this refund manually.';
              }
            } catch {
              refundError = 'Could not reach Paystack to process the refund — process it manually.';
            }
          }
        }
      }
      refundProcessed = refundAmount > 0 && processedTotal >= refundAmount - 0.01;
      refundedSoFar = processedTotal;
    }

    const updatePatch: Record<string, unknown> = { status: 'cancelled', cancellation_reason: reason || null };
    if (isVendorCaller) {
      updatePatch.vendor_accepted = false;
    }
    if (refundProcessed) {
      updatePatch.payment_status = 'refunded';
      updatePatch.refund_amount = refundAmount;
    } else if (refundedSoFar > 0) {
      updatePatch.refund_amount = refundedSoFar; // partly refunded - the rest is a manual follow-up (see refundError)
    }
    const { error: updateError } = await adminClient.from('bookings').update(updatePatch).eq('id', bookingId);
    if (updateError) {
      return jsonResponse({ error: updateError.message }, 500);
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
    const adminBody = `Booking ${booking.booking_ref} was cancelled by ${cancelledByLabel}.${reason ? ` Reason: ${reason}` : ''}`;
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

    return jsonResponse({ success: true, refunded: refundProcessed, refundAmount, refundPercentage, refundError });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
