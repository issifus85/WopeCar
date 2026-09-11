// Supabase Edge Function - emails WopeCar support when a renter reports a
// car listing (car detail screen's "Report this listing" link, migration-
// free per Apple's 1.2.0 User Generated Content rejection: there's no
// listing_reports table, this is a straight notification, same posture as
// send-inquiry-notification).
//
// Requires a signed-in caller (unlike send-inquiry-notification's anon
// posture) - a report needs a real, verified reporter identity, not one
// taken from the request body. reason/details come from the client since
// they're not something to look up server-side, but the reporter's own
// id/email always come from their JWT (callerClient.auth.getUser()),
// never from the body, so a forged request can't spoof who's reporting.
// carId is trusted only enough to look the car up for context in the
// email - a bogus id just means the email says "Unknown listing".
//
// Deploy with: supabase functions deploy report-listing
// Reuses the same RESEND_API_KEY secret as every other email function here.

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
function buildEmailHtml({ car, reason, reporter }: { car: any; reason: string; reporter: { id: string; email: string } }) {
  const body = `
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:20px;">
          <h1 style="font-size:18px;color:#154B59;margin:0 0 4px;">Listing Reported</h1>
          <p style="font-size:13px;color:#666666;margin:0;">A renter flagged a listing from the app for review.</p>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
          <tr><td style="padding:6px 0;color:#5b6b6c;">Listing</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(car?.name ?? 'Unknown listing')}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Car ID</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(car?.id)}</td></tr>
          ${car?.vendor?.business_name ? `<tr><td style="padding:6px 0;color:#5b6b6c;">Host</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(car.vendor.business_name)}</td></tr>` : ''}
          <tr><td style="padding:6px 0;color:#5b6b6c;">Reason</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(reason)}</td></tr>
        </table>

        <div style="border-top:1px solid #e5e5e5;padding-top:12px;">
          <div style="font-size:13px;font-weight:bold;color:#154B59;margin-bottom:6px;">Reported by</div>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:4px 0;color:#5b6b6c;">User ID</td><td style="padding:4px 0;text-align:right;color:#154B59;">${escapeHtml(reporter.id)}</td></tr>
            <tr><td style="padding:4px 0;color:#5b6b6c;">Email</td><td style="padding:4px 0;text-align:right;color:#154B59;">${escapeHtml(reporter.email)}</td></tr>
          </table>
        </div>
      </div>`;
  return emailShell(body);
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

    const { carId, reason } = await req.json();
    if (!carId || !reason) {
      return jsonResponse({ error: 'carId and reason are required.' }, 400);
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

    if (!resendApiKey) {
      return jsonResponse({ error: 'RESEND_API_KEY is not configured for this project.' }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: car } = await adminClient.from('cars').select('id, name, vendor:vendors(business_name)').eq('id', carId).maybeSingle();

    const { data: supportSetting } = await adminClient.from('app_settings').select('value').eq('key', 'support_email').maybeSingle();
    const supportEmail = typeof supportSetting?.value === 'string' && supportSetting.value ? supportSetting.value : 'support@wopecar.com';

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'WopeCar <bookings@wopecar.com>',
        to: [supportEmail],
        subject: `Listing Reported - ${car?.name ?? carId}`,
        html: buildEmailHtml({ car: car ? { ...car, id: carId } : { id: carId }, reason, reporter: { id: user.id, email: user.email ?? 'Unknown' } }),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return jsonResponse({ error: `Resend error: ${errText}` }, 502);
    }

    return jsonResponse({ success: true });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
