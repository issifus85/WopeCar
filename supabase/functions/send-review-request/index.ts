// Supabase Edge Function - invites a renter to review their trip right
// after admin marks the booking completed (services/adminBookingsApi.js's
// markBookingCompleted() is the only real call site - booking completion is
// a manual admin action in this app, not automatic). Caller must be an
// admin - identified from their own JWT, then role verified via
// service_role before anything is sent.
//
// Deploy with: supabase functions deploy send-review-request
// Reuses the same RESEND_API_KEY secret as the other email functions.

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

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function buildEmailHtml({ firstName, carName }: { firstName: string; carName: string }) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f5f5;padding:32px 16px;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
      <div style="background:#154B59;padding:28px 24px;text-align:center;">
        <img src="https://qvactycnufaowwsiqdrz.supabase.co/functions/v1/logo-mark" alt="WopeCar" width="180" style="display:inline-block;height:auto;max-width:180px;" />
      </div>
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="width:56px;height:56px;border-radius:28px;background:#EEF9F9;display:inline-block;text-align:center;font-size:28px;line-height:56px;">&#11088;</div>
          <h1 style="font-size:20px;color:#154B59;margin:16px 0 4px;">How was your trip?</h1>
          <p style="font-size:14px;color:#666666;margin:0;">Hi ${escapeHtml(firstName)}, your trip with ${escapeHtml(carName)} is complete. Your review helps other renters choose with confidence.</p>
        </div>
        <div style="text-align:center;margin-top:8px;">
          <span style="display:inline-block;background:#154B59;color:#ffffff;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:10px;">Rate your trip in the app</span>
        </div>
        <p style="font-size:12px;color:#999999;text-align:center;margin-top:16px;">Find this trip under Bookings &rarr; Completed to leave your review.</p>
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

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: getUserError } = await callerClient.auth.getUser();
    if (getUserError || !user) {
      return jsonResponse({ error: 'Invalid or expired session.' }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerProfile } = await adminClient.from('users').select('role').eq('id', user.id).maybeSingle();
    if (callerProfile?.role !== 'admin') {
      return jsonResponse({ error: 'Not authorized.' }, 403);
    }

    const { data: booking, error: bookingError } = await adminClient
      .from('bookings')
      .select('renter_id, cars(name)')
      .eq('id', bookingId)
      .maybeSingle();
    if (bookingError || !booking) {
      return jsonResponse({ error: 'Booking not found.' }, 404);
    }

    const { data: renterUser } = await adminClient.from('users').select('email, full_name').eq('id', booking.renter_id).maybeSingle();
    if (!renterUser?.email) {
      return jsonResponse({ error: 'Renter has no email on file.' }, 404);
    }

    if (!resendApiKey) {
      return jsonResponse({ error: 'RESEND_API_KEY is not configured for this project.' }, 500);
    }

    const firstName = (renterUser.full_name || '').trim().split(/\s+/)[0] || 'there';
    const html = buildEmailHtml({ firstName, carName: booking.cars?.name ?? 'your car' });

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'WopeCar <bookings@wopecar.com>',
        to: [renterUser.email],
        subject: `How was your trip with ${booking.cars?.name ?? 'your car'}?`,
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
