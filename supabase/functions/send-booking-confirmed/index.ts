// Supabase Edge Function - sends the real "Booking Confirmed" email once a
// booking has actually been confirmed to fulfill, not just paid for. Fires
// from TWO independent trigger points, both legitimate ("first one wins" -
// whichever happens first sends this once, no distinction in the message
// either way per the product decision):
//   - a vendor accepting the request (services/vendorBookingsApi.js's
//     acceptBookingRequest)
//   - an admin manually confirming from the back office
//     (services/adminBookingsApi.js's confirmBooking)
// Callable by whichever of the two actually performed the confirming action
// - the vendor who owns the booking, or an admin. Not callable by the
// renter (they can't self-confirm their own booking). Same security pattern
// as the other booking emails: identify the caller from their own JWT, then
// use service_role for the read + outbound email calls.
//
// Deploy with: supabase functions deploy send-booking-confirmed
// Reuses the same RESEND_API_KEY secret as the other booking emails.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function emailShell(bodyHtml: string) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f5f5;padding:32px 16px;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
      <div style="background:#154B59;padding:28px 24px;text-align:center;">
        <img src="https://qvactycnufaowwsiqdrz.supabase.co/functions/v1/logo-mark" alt="WopeCar" width="180" style="display:inline-block;height:auto;max-width:180px;" />
      </div>
      ${bodyHtml}
    </div>
  </div>`;
}

// deno-lint-ignore no-explicit-any
function bookingRowsHtml(booking: any) {
  return `
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
      <tr><td style="padding:6px 0;color:#5b6b6c;">Pickup</td><td style="padding:6px 0;text-align:right;color:#154B59;">${formatDate(booking.start_date)} &middot; ${escapeHtml(booking.pickup_time)}</td></tr>
      <tr><td style="padding:6px 0;color:#5b6b6c;">Return</td><td style="padding:6px 0;text-align:right;color:#154B59;">${formatDate(booking.end_date)} &middot; ${escapeHtml(booking.return_time)}</td></tr>
      <tr><td style="padding:6px 0;color:#5b6b6c;">Pickup location</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(booking.pickup_location)}</td></tr>
      <tr><td style="padding:6px 0;color:#5b6b6c;">Booking ref</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(booking.booking_ref)}</td></tr>
    </table>`;
}

// wopecar:// is this app's registered custom scheme (app.json's "scheme"),
// mapped straight to app/booking/[id].js by Expo Router - same pattern as
// send-review-request's wopecar://review/${bookingId}. Only resolves if
// WopeCar is installed on the device the link is tapped from - see
// send-review-request's own comment for the full caveat (no https fallback
// yet, revisit once this ships to the App Store/Play Store).
// deno-lint-ignore no-explicit-any
function buildRenterEmailHtml({ booking, car, vendor }: any) {
  const bookingUrl = `wopecar://booking/${booking.id}`;
  const body = `
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="width:56px;height:56px;border-radius:28px;background:#EEF9F9;display:inline-block;text-align:center;font-size:28px;line-height:56px;">&#9989;</div>
          <h1 style="font-size:20px;color:#154B59;margin:16px 0 4px;">Your Booking is Confirmed!</h1>
          <p style="font-size:14px;color:#666666;margin:0;">${escapeHtml(vendor?.business_name ?? 'Your host')} has confirmed your booking for ${escapeHtml(car?.name ?? 'your car')}. You're all set.</p>
        </div>

        <div style="background:#f5f5f5;border-radius:12px;padding:16px;margin-bottom:20px;">
          <div style="font-size:16px;font-weight:bold;color:#154B59;margin-bottom:2px;">${escapeHtml(car?.name ?? 'Your Car')}</div>
          <div style="font-size:13px;color:#666666;">${escapeHtml(vendor?.business_name ?? 'WopeCar')}</div>
        </div>

        ${bookingRowsHtml(booking)}

        <div style="text-align:center;margin-top:8px;">
          <a href="${bookingUrl}" style="display:inline-block;background:#154B59;color:#ffffff;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:10px;text-decoration:none;">View Your Booking</a>
        </div>
      </div>
      <div style="background:#f5f5f5;padding:16px 24px;text-align:center;">
        <p style="font-size:12px;color:#999999;margin:0;">Safe travels! Find this booking anytime under Bookings in the app.</p>
      </div>`;
  return emailShell(body);
}

// Vendor-facing confirmation, added alongside the renter/admin emails above -
// this function previously never notified the vendor at all despite being
// one of its two trigger points (vendor accept, admin confirm). Must NEVER
// include the client's name/email/phone/total, rental/addon/delivery/
// deposit costs, or wopecar_margin - only vendor_payout_per_day/
// vendor_payout_total, the two figures the vendor is meant to see (see
// bookings_compute_vendor_payout, which stamps them server-side so this
// function never has to compute anything itself, just read the row).
// deno-lint-ignore no-explicit-any
function buildVendorEmailHtml({ booking, car, vendorOwnerName, supportEmail, supportPhone }: any) {
  const payoutPerDay = Number(booking.vendor_payout_per_day ?? 0);
  const payoutTotal = Number(booking.vendor_payout_total ?? 0);
  const days = Number(booking.billable_days ?? 0);
  const body = `
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="width:56px;height:56px;border-radius:28px;background:#EEF9F9;display:inline-block;text-align:center;font-size:28px;line-height:56px;">&#127881;</div>
          <h1 style="font-size:20px;color:#154B59;margin:16px 0 4px;">Booking Confirmed</h1>
          <p style="font-size:14px;color:#666666;margin:0;">Hi ${escapeHtml(vendorOwnerName)}, great news &mdash; a booking has been confirmed for your ${escapeHtml(car?.name ?? 'car')}.</p>
        </div>

        <div style="font-size:11px;font-weight:bold;letter-spacing:0.06em;color:#999999;text-transform:uppercase;margin-bottom:8px;">Booking Details</div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
          <tr><td style="padding:6px 0;color:#5b6b6c;">Booking Reference</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(booking.booking_ref)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Vehicle</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(car?.name ?? '—')}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Pickup Date</td><td style="padding:6px 0;text-align:right;color:#154B59;">${formatDate(booking.start_date)} &middot; ${escapeHtml(booking.pickup_time)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Return Date</td><td style="padding:6px 0;text-align:right;color:#154B59;">${formatDate(booking.end_date)} &middot; ${escapeHtml(booking.return_time)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Pickup Location</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(booking.pickup_location)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Return Location</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(booking.return_location)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Duration</td><td style="padding:6px 0;text-align:right;color:#154B59;">${days} day${days === 1 ? '' : 's'}</td></tr>
        </table>

        <div style="background:#EEF9F9;border-radius:12px;padding:16px 18px;margin-bottom:20px;">
          <div style="font-size:11px;font-weight:bold;letter-spacing:0.06em;color:#3EB6BA;text-transform:uppercase;margin-bottom:10px;">Your Earnings</div>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:4px 0;color:#5b6b6c;">Payout Rate</td><td style="padding:4px 0;text-align:right;color:#154B59;">GHS ${payoutPerDay.toFixed(2)}/day</td></tr>
            <tr><td style="padding:4px 0;color:#154B59;font-weight:bold;">Total Payout</td><td style="padding:4px 0;text-align:right;color:#154B59;font-weight:bold;font-size:16px;">GHS ${payoutTotal.toFixed(2)}</td></tr>
          </table>
        </div>

        <p style="font-size:12.5px;color:#999999;line-height:1.6;margin:0 0 20px;">
          Your payout will be processed after the rental is completed, in accordance with WopeCar's payment schedule.
        </p>

        <p style="font-size:12.5px;color:#999999;line-height:1.6;margin:0;text-align:center;">
          If you have any questions, contact WopeCar Support:<br />
          ${supportEmail ? escapeHtml(supportEmail) : 'support@wopecar.com'}${supportPhone ? ` | ${escapeHtml(supportPhone)}` : ''}
        </p>
      </div>
      <div style="background:#f5f5f5;padding:16px 24px;text-align:center;">
        <p style="font-size:12px;color:#999999;margin:0;">The WopeCar Team</p>
      </div>`;
  return emailShell(body);
}

// deno-lint-ignore no-explicit-any
function buildAdminEmailHtml({ booking, car, vendor, confirmedBy }: any) {
  const body = `
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:20px;">
          <h1 style="font-size:18px;color:#154B59;margin:0 0 4px;">Booking Confirmed</h1>
          <p style="font-size:13px;color:#666666;margin:0;">Booking ${escapeHtml(booking.booking_ref)} &middot; confirmed by ${escapeHtml(confirmedBy)}</p>
        </div>

        <div style="background:#f5f5f5;border-radius:12px;padding:16px;margin-bottom:16px;">
          <div style="font-size:16px;font-weight:bold;color:#154B59;margin-bottom:2px;">${escapeHtml(car?.name ?? 'Car')}</div>
          <div style="font-size:13px;color:#666666;">${escapeHtml(vendor?.business_name ?? 'N/A')}</div>
        </div>

        ${bookingRowsHtml(booking)}
      </div>`;
  return emailShell(body);
}

async function sendResendEmail(resendApiKey: string, payload: Record<string, unknown>) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend error: ${errText}`);
  }
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

    const { bookingId } = await req.json();
    if (!bookingId) {
      return jsonResponse({ error: 'bookingId is required.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: getUserError } = await callerClient.auth.getUser();
    if (getUserError || !user) {
      return jsonResponse({ error: 'Invalid or expired session.' }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: booking, error: bookingError } = await adminClient
      .from('bookings')
      .select('*, cars(name), vendors(business_name, user_id, owner:users!vendors_user_id_fkey(full_name, email)), renter:renter_id(id, full_name, email)')
      .eq('id', bookingId)
      .single();
    if (bookingError || !booking) {
      return jsonResponse({ error: 'Booking not found.' }, 404);
    }

    const { data: callerProfile } = await adminClient.from('users').select('role').eq('id', user.id).maybeSingle();

    const isVendor = booking.vendors?.user_id === user.id;
    const isAdmin = callerProfile?.role === 'admin';
    if (!isVendor && !isAdmin) {
      return jsonResponse({ error: 'Not authorized to confirm this booking.' }, 403);
    }

    if (!booking.renter?.email) {
      return jsonResponse({ error: 'Renter has no email on file.' }, 404);
    }

    if (!resendApiKey) {
      return jsonResponse({ error: 'RESEND_API_KEY is not configured for this project.' }, 500);
    }

    const { data: supportSettings } = await adminClient
      .from('app_settings')
      .select('key, value')
      .in('key', ['support_email', 'support_phone_1']);
    const supportEmail = supportSettings?.find((s) => s.key === 'support_email' && typeof s.value === 'string')?.value ?? null;
    const supportPhone = supportSettings?.find((s) => s.key === 'support_phone_1' && typeof s.value === 'string')?.value ?? null;
    const confirmedBy = isVendor ? 'the vendor' : 'admin/support';

    const sends: Promise<void>[] = [
      sendResendEmail(resendApiKey, {
        from: 'WopeCar <bookings@wopecar.com>',
        to: [booking.renter.email],
        subject: `Booking Confirmed - ${booking.cars?.name ?? 'Your Car'}`,
        html: buildRenterEmailHtml({ booking, car: booking.cars, vendor: booking.vendors }),
      }),
    ];

    // The vendor themselves - this function previously only emailed the
    // renter and admin/support, never the one party being told "you're
    // getting paid for this." Best-effort in the sense that a missing
    // vendor owner email doesn't fail the whole confirm - same posture as
    // the admin CC below.
    const vendorOwnerEmail = booking.vendors?.owner?.email;
    if (vendorOwnerEmail) {
      sends.push(sendResendEmail(resendApiKey, {
        from: 'WopeCar <bookings@wopecar.com>',
        to: [vendorOwnerEmail],
        subject: `Booking Confirmed - Your ${booking.cars?.name ?? 'Car'} is Booked`,
        html: buildVendorEmailHtml({
          booking,
          car: booking.cars,
          vendorOwnerName: booking.vendors?.owner?.full_name || booking.vendors?.business_name || 'there',
          supportEmail,
          supportPhone,
        }),
      }));
    }

    if (supportEmail) {
      sends.push(sendResendEmail(resendApiKey, {
        from: 'WopeCar <bookings@wopecar.com>',
        to: [supportEmail],
        subject: `Booking Confirmed - ${booking.booking_ref}`,
        html: buildAdminEmailHtml({ booking, car: booking.cars, vendor: booking.vendors, confirmedBy }),
      }));
    }

    const results = await Promise.allSettled(sends);
    const failures = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    if (failures.length === results.length) {
      return jsonResponse({ error: failures.map((f) => String(f.reason)).join('; ') }, 502);
    }

    // Push + in-app for the renter, best-effort. This is the ONE place both
    // trigger paths (vendor accept, admin confirm) converge, so it's also
    // the right place for the renter's push/in-app notification - covers
    // both uniformly without adminBookingsApi.js's confirmBooking() and
    // vendorBookingsApi.js's acceptBookingRequest() each needing their own
    // copy. Uses adminClient (service_role) rather than a client-side
    // notifyUser() call, since the notifications table's RLS only allows an
    // admin or the row's own user to insert - a vendor caller (one of the
    // two legitimate callers of this whole function) has no insert policy
    // of their own to notify a *different* user (the renter) with.
    const notifyTitle = 'Booking confirmed';
    const notifyBody = `Your booking for ${booking.cars?.name ?? 'your car'} has been confirmed.`;
    try {
      await adminClient.from('notifications').insert({
        user_id: booking.renter_id,
        type: 'booking_confirmed',
        title: notifyTitle,
        body: notifyBody,
        booking_id: booking.id,
      });
      await adminClient.functions.invoke('send-push-notification', {
        body: { notifications: [{ userId: booking.renter_id, title: notifyTitle, body: notifyBody }] },
      });
    } catch (_e) {
      // best-effort - a failed push/in-app shouldn't fail the confirm flow
    }

    return jsonResponse({
      success: true,
      partialFailures: failures.length ? failures.map((f) => String(f.reason)) : null,
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
