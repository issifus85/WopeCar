// Supabase Edge Function - sends the "Booking Received" email via Resend
// right after a booking is created and paid for: one to the renter, one to
// admin/support with full details (client, vendor, cost breakdown). Despite
// the function's name (kept as-is to avoid an unnecessary redeploy-under-a-
// new-name churn), this is deliberately NOT the "your booking is confirmed"
// message - payment alone doesn't mean the vendor/admin has actually agreed
// to fulfill the trip yet. That real confirmation email is a separate
// function, send-booking-confirmed, fired once a vendor accepts or an admin
// confirms (see services/vendorBookingsApi.js's acceptBookingRequest and
// services/adminBookingsApi.js's confirmBooking).
// Mirrors delete-account's security pattern: identify the caller from their
// own JWT first, then use service_role only for the actual privileged work
// (joined read across bookings/cars/vendors/users, plus the outbound
// email calls) - never trust a client-supplied cost breakdown or HTML.
//
// Deploy with: supabase functions deploy send-booking-confirmation
// Needs one secret this project doesn't already have (Supabase's dashboard
// SMTP settings for Auth emails are a separate mechanism, not available to
// Edge Functions as an env var):
//   supabase secrets set RESEND_API_KEY=re_xxx
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected
// automatically, same as every other Edge Function in this project. The
// `from` address below (bookings@wopecar.com) must be on a domain verified
// in the same Resend account already used for Auth SMTP - adjust if that's
// not wopecar.com.

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

function formatCurrency(amount: number | null | undefined) {
  return `GHS ${Number(amount ?? 0).toFixed(2)}`;
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
function buildCostRows(booking: any) {
  const addonsRow = (booking.addon_names ?? []).length
    ? `<tr><td style="padding:6px 0;color:#5b6b6c;">Add-ons</td><td style="padding:6px 0;text-align:right;color:#154B59;">${formatCurrency(booking.addons_cost)}</td></tr>`
    : '';
  const deliveryRow = Number(booking.delivery_fee) > 0
    ? `<tr><td style="padding:6px 0;color:#5b6b6c;">Delivery fee</td><td style="padding:6px 0;text-align:right;color:#154B59;">${formatCurrency(booking.delivery_fee)}</td></tr>`
    : '';
  const promoRow = Number(booking.promo_discount_amount) > 0
    ? `<tr><td style="padding:6px 0;color:#2E7D32;">Promo${booking.promo_code ? ` (${escapeHtml(booking.promo_code)})` : ''}</td><td style="padding:6px 0;text-align:right;color:#2E7D32;">-${formatCurrency(booking.promo_discount_amount)}</td></tr>`
    : '';
  return `
    <table style="width:100%;border-collapse:collapse;font-size:14px;border-top:1px solid #e5e5e5;padding-top:8px;">
      <tr><td style="padding:6px 0;color:#5b6b6c;">Rental</td><td style="padding:6px 0;text-align:right;color:#154B59;">${formatCurrency(booking.rental_cost)}</td></tr>
      ${addonsRow}
      ${deliveryRow}
      <tr><td style="padding:6px 0;color:#5b6b6c;">Security deposit</td><td style="padding:6px 0;text-align:right;color:#154B59;">${formatCurrency(booking.security_deposit)}</td></tr>
      ${promoRow}
      <tr><td style="padding:10px 0 0;font-weight:bold;color:#154B59;border-top:1px solid #e5e5e5;">Total Paid</td><td style="padding:10px 0 0;text-align:right;font-weight:bold;color:#3EB6BA;font-size:16px;border-top:1px solid #e5e5e5;">${formatCurrency(booking.total_cost)}</td></tr>
    </table>`;
}

// deno-lint-ignore no-explicit-any
function buildEmailHtml({ booking, car, vendor, renterName, supportEmail }: any) {
  const body = `
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="width:56px;height:56px;border-radius:28px;background:#EEF9F9;display:inline-block;text-align:center;font-size:28px;line-height:56px;">&#128179;</div>
          <h1 style="font-size:20px;color:#154B59;margin:16px 0 4px;">Booking Received!</h1>
          <p style="font-size:14px;color:#666666;margin:0;">Hi ${escapeHtml(renterName || 'there')}, we've received your booking and payment for ${escapeHtml(car?.name ?? 'your car')}. It's now pending confirmation from ${escapeHtml(vendor?.business_name ?? 'the host')} - we'll email you as soon as it's confirmed.</p>
        </div>

        <div style="background:#f5f5f5;border-radius:12px;padding:16px;margin-bottom:20px;">
          <div style="font-size:16px;font-weight:bold;color:#154B59;margin-bottom:2px;">${escapeHtml(car?.name ?? 'Your Car')}</div>
          <div style="font-size:13px;color:#666666;">${escapeHtml(vendor?.business_name ?? 'WopeCar')}</div>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
          <tr><td style="padding:6px 0;color:#5b6b6c;">Pickup</td><td style="padding:6px 0;text-align:right;color:#154B59;">${formatDate(booking.start_date)} &middot; ${escapeHtml(booking.pickup_time)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Return</td><td style="padding:6px 0;text-align:right;color:#154B59;">${formatDate(booking.end_date)} &middot; ${escapeHtml(booking.return_time)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Pickup location</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(booking.pickup_location)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Booking ref</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(booking.booking_ref)}</td></tr>
        </table>

        ${buildCostRows(booking)}
      </div>
      <div style="background:#f5f5f5;padding:16px 24px;text-align:center;">
        <p style="font-size:12px;color:#999999;margin:0;">Questions? Contact us${supportEmail ? ` at <a href="mailto:${escapeHtml(supportEmail)}" style="color:#3EB6BA;">${escapeHtml(supportEmail)}</a>` : ''}.</p>
      </div>`;
  return emailShell(body);
}

/** Admin/support-facing version - everything the renter email has, plus full client and vendor contact details, since support needs to be able to reach either side without digging through the admin panel. */
// deno-lint-ignore no-explicit-any
function buildAdminEmailHtml({ booking, car, vendor, renter, vendorUser }: any) {
  const body = `
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:20px;">
          <h1 style="font-size:18px;color:#154B59;margin:0 0 4px;">New Paid Booking - Pending Confirmation</h1>
          <p style="font-size:13px;color:#666666;margin:0;">Booking ${escapeHtml(booking.booking_ref)}</p>
        </div>

        <div style="background:#f5f5f5;border-radius:12px;padding:16px;margin-bottom:16px;">
          <div style="font-size:16px;font-weight:bold;color:#154B59;margin-bottom:2px;">${escapeHtml(car?.name ?? 'Car')}</div>
          <div style="font-size:13px;color:#666666;">${escapeHtml(booking.drive_type)} &middot; ${escapeHtml(booking.pickup_location)} &rarr; ${escapeHtml(booking.return_location)}</div>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
          <tr><td style="padding:6px 0;color:#5b6b6c;">Pickup</td><td style="padding:6px 0;text-align:right;color:#154B59;">${formatDate(booking.start_date)} &middot; ${escapeHtml(booking.pickup_time)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Return</td><td style="padding:6px 0;text-align:right;color:#154B59;">${formatDate(booking.end_date)} &middot; ${escapeHtml(booking.return_time)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Payment ref</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(booking.payment_ref)}</td></tr>
        </table>

        <div style="border-top:1px solid #e5e5e5;padding-top:12px;margin-bottom:16px;">
          <div style="font-size:13px;font-weight:bold;color:#154B59;margin-bottom:6px;">Client</div>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:4px 0;color:#5b6b6c;">Name</td><td style="padding:4px 0;text-align:right;color:#154B59;">${escapeHtml(renter?.full_name || 'N/A')}</td></tr>
            <tr><td style="padding:4px 0;color:#5b6b6c;">Email</td><td style="padding:4px 0;text-align:right;color:#154B59;">${escapeHtml(renter?.email || 'N/A')}</td></tr>
            <tr><td style="padding:4px 0;color:#5b6b6c;">Phone</td><td style="padding:4px 0;text-align:right;color:#154B59;">${escapeHtml(renter?.phone || 'N/A')}</td></tr>
          </table>
        </div>

        <div style="border-top:1px solid #e5e5e5;padding-top:12px;margin-bottom:16px;">
          <div style="font-size:13px;font-weight:bold;color:#154B59;margin-bottom:6px;">Vendor</div>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:4px 0;color:#5b6b6c;">Business</td><td style="padding:4px 0;text-align:right;color:#154B59;">${escapeHtml(vendor?.business_name || 'N/A')}</td></tr>
            <tr><td style="padding:4px 0;color:#5b6b6c;">Email</td><td style="padding:4px 0;text-align:right;color:#154B59;">${escapeHtml(vendorUser?.email || 'N/A')}</td></tr>
            <tr><td style="padding:4px 0;color:#5b6b6c;">Phone</td><td style="padding:4px 0;text-align:right;color:#154B59;">${escapeHtml(vendorUser?.phone || 'N/A')}</td></tr>
          </table>
        </div>

        ${buildCostRows(booking)}

        <div style="text-align:center;margin-top:20px;">
          <a href="https://admin.wopecar.com/bookings" style="display:inline-block;background:#154B59;color:#ffffff;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:10px;text-decoration:none;">Confirm in the Admin Dashboard</a>
        </div>
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

    // Step 1: identify the caller from their own token, same as delete-account.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: getUserError } = await callerClient.auth.getUser();
    if (getUserError || !user) {
      return jsonResponse({ error: 'Invalid or expired session.' }, 401);
    }

    // Step 2: service_role fetch, but still scoped to a booking this caller
    // actually owns - never trust bookingId alone to mean "send this email".
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: booking, error: bookingError } = await adminClient
      .from('bookings')
      .select('*, cars(name, images), vendors(business_name, user_id)')
      .eq('id', bookingId)
      .eq('renter_id', user.id)
      .single();
    if (bookingError || !booking) {
      return jsonResponse({ error: 'Booking not found.' }, 404);
    }

    const [{ data: renterProfile }, { data: supportSetting }, { data: vendorUser }] = await Promise.all([
      adminClient.from('users').select('full_name, email, phone').eq('id', user.id).maybeSingle(),
      adminClient.from('app_settings').select('value').eq('key', 'support_email').maybeSingle(),
      booking.vendors?.user_id
        ? adminClient.from('users').select('email, phone').eq('id', booking.vendors.user_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const supportEmail = typeof supportSetting?.value === 'string' ? supportSetting.value : null;

    if (!resendApiKey) {
      return jsonResponse({ error: 'RESEND_API_KEY is not configured for this project.' }, 500);
    }

    const renterHtml = buildEmailHtml({
      booking,
      car: booking.cars,
      vendor: booking.vendors,
      renterName: renterProfile?.full_name,
      supportEmail,
    });

    // Renter confirmation is the primary purpose of this endpoint - a
    // failure here is a real error the caller should see.
    await sendResendEmail(resendApiKey, {
      from: 'WopeCar <bookings@wopecar.com>',
      to: [user.email],
      subject: `Booking Received - ${booking.cars?.name ?? 'Your Car'}`,
      html: renterHtml,
    });

    // Admin notification is best-effort - support not getting a copy
    // shouldn't make the renter's own confirmation email look like it failed.
    let adminEmailError: string | null = null;
    if (supportEmail) {
      const adminHtml = buildAdminEmailHtml({
        booking,
        car: booking.cars,
        vendor: booking.vendors,
        renter: { full_name: renterProfile?.full_name, email: renterProfile?.email ?? user.email, phone: renterProfile?.phone },
        vendorUser,
      });
      try {
        await sendResendEmail(resendApiKey, {
          from: 'WopeCar <bookings@wopecar.com>',
          to: [supportEmail],
          subject: `New Paid Booking (Pending Confirmation) - ${booking.booking_ref}`,
          html: adminHtml,
        });
      } catch (e) {
        adminEmailError = e instanceof Error ? e.message : 'Unknown error sending admin notification.';
      }
    }

    return jsonResponse({ success: true, adminEmailError });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
