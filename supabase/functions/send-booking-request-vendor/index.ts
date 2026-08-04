// Supabase Edge Function - notifies a vendor by email that a new booking
// needs their review, in case they miss the in-app notification. Same
// security pattern as the other booking emails: identify the caller from
// their own JWT (must be the renter who owns the booking), then use
// service_role for the actual read + outbound email.
//
// Deliberately excludes the client's contact info (email/phone) from the
// vendor-facing email - only their first name and the booking's own
// details, since the vendor doesn't need to reach the client directly
// outside the app.
//
// Deploy with: supabase functions deploy send-booking-request-vendor
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

function formatCurrency(amount: number | null | undefined) {
  return `GHS ${Number(amount ?? 0).toFixed(2)}`;
}

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// deno-lint-ignore no-explicit-any
function buildEmailHtml({ booking, car, renterFirstName }: any) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f5f5;padding:32px 16px;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
      <div style="background:#154B59;padding:28px 24px;text-align:center;">
        <img src="https://qvactycnufaowwsiqdrz.supabase.co/functions/v1/logo-mark" alt="WopeCar" width="180" style="display:inline-block;height:auto;max-width:180px;" />
      </div>
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="width:56px;height:56px;border-radius:28px;background:#EEF9F9;display:inline-block;text-align:center;font-size:28px;line-height:56px;">&#128276;</div>
          <h1 style="font-size:20px;color:#154B59;margin:16px 0 4px;">New Booking Request</h1>
          <p style="font-size:14px;color:#666666;margin:0;">A renter just booked ${escapeHtml(car?.name ?? 'your car')} - please review and respond in the app.</p>
        </div>

        <div style="background:#f5f5f5;border-radius:12px;padding:16px;margin-bottom:20px;">
          <div style="font-size:16px;font-weight:bold;color:#154B59;margin-bottom:2px;">${escapeHtml(car?.name ?? 'Your Car')}</div>
          <div style="font-size:13px;color:#666666;">Requested by ${escapeHtml(renterFirstName || 'a renter')}</div>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
          <tr><td style="padding:6px 0;color:#5b6b6c;">Pickup</td><td style="padding:6px 0;text-align:right;color:#154B59;">${formatDate(booking.start_date)} &middot; ${escapeHtml(booking.pickup_time)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Return</td><td style="padding:6px 0;text-align:right;color:#154B59;">${formatDate(booking.end_date)} &middot; ${escapeHtml(booking.return_time)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Pickup location</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(booking.pickup_location)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Drive type</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(booking.drive_type)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Booking ref</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(booking.booking_ref)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Rental total</td><td style="padding:6px 0;text-align:right;color:#154B59;">${formatCurrency(booking.rental_cost)}</td></tr>
        </table>

        <div style="text-align:center;">
          <span style="display:inline-block;background:#154B59;color:#ffffff;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:10px;">Review in the WopeCar Vendor app</span>
        </div>
      </div>
      <div style="background:#f5f5f5;padding:16px 24px;text-align:center;">
        <p style="font-size:12px;color:#999999;margin:0;">Open the Vendor Bookings tab to accept or decline this request.</p>
      </div>
    </div>
  </div>`;
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

    // Step 1: identify the caller - must be the renter who owns this booking.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: getUserError } = await callerClient.auth.getUser();
    if (getUserError || !user) {
      return jsonResponse({ error: 'Invalid or expired session.' }, 401);
    }

    // Step 2: service_role fetch, scoped to a booking this caller actually owns.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: booking, error: bookingError } = await adminClient
      .from('bookings')
      .select('*, cars(name), vendors(user_id)')
      .eq('id', bookingId)
      .eq('renter_id', user.id)
      .single();
    if (bookingError || !booking) {
      return jsonResponse({ error: 'Booking not found.' }, 404);
    }

    if (!booking.vendors?.user_id) {
      return jsonResponse({ error: 'Booking has no vendor to notify.' }, 404);
    }

    const [{ data: renterProfile }, { data: vendorUser }] = await Promise.all([
      adminClient.from('users').select('full_name').eq('id', user.id).maybeSingle(),
      adminClient.from('users').select('email').eq('id', booking.vendors.user_id).maybeSingle(),
    ]);

    if (!vendorUser?.email) {
      return jsonResponse({ error: 'Vendor has no email on file.' }, 404);
    }

    if (!resendApiKey) {
      return jsonResponse({ error: 'RESEND_API_KEY is not configured for this project.' }, 500);
    }

    const renterFirstName = (renterProfile?.full_name || '').trim().split(/\s+/)[0] || null;
    const html = buildEmailHtml({ booking, car: booking.cars, renterFirstName });

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'WopeCar <bookings@wopecar.com>',
        to: [vendorUser.email],
        subject: `New Booking Request - ${booking.cars?.name ?? 'Your Car'}`,
        html,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      return jsonResponse({ error: `Resend error: ${errText}` }, 502);
    }

    return jsonResponse({ success: true });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
