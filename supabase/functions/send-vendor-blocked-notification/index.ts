// Supabase Edge Function - notifies WopeCar support by email whenever a
// renter blocks a vendor/host (Apple 1.2.0 User Generated Content: blocking
// an abusive user must notify the developer, not just quietly hide content
// client-side). Fired by a Postgres trigger on INSERT into
// public.blocked_vendors (see migration
// add_blocked_vendors_and_terms_acceptance.sql), not called from client
// code - same "pg_net posting from inside Postgres" posture as
// send-signup-notification, so the notification fires unconditionally on
// every block regardless of which client path wrote the row.
//
// Deployed --no-verify-jwt and authenticated by the trigger embedding the
// project's anon key as a bearer token (public, RLS-gated key - safe to
// embed, same convention as send-signup-notification).
//
// Deploy with: supabase functions deploy send-vendor-blocked-notification --no-verify-jwt
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
function buildEmailHtml({ vendor, blocker, reason }: { vendor: any; blocker: any; reason: string | null }) {
  const body = `
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:20px;">
          <h1 style="font-size:18px;color:#154B59;margin:0 0 4px;">Vendor Blocked</h1>
          <p style="font-size:13px;color:#666666;margin:0;">A renter blocked a host - please review within 24 hours per our Terms.</p>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
          <tr><td style="padding:6px 0;color:#5b6b6c;">Vendor</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(vendor?.business_name ?? 'Unknown vendor')}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Vendor ID</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(vendor?.id)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Reason</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(reason || 'Not provided')}</td></tr>
        </table>

        <div style="border-top:1px solid #e5e5e5;padding-top:12px;">
          <div style="font-size:13px;font-weight:bold;color:#154B59;margin-bottom:6px;">Blocked by</div>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:4px 0;color:#5b6b6c;">Name</td><td style="padding:4px 0;text-align:right;color:#154B59;">${escapeHtml(blocker?.full_name || 'Not provided')}</td></tr>
            <tr><td style="padding:4px 0;color:#5b6b6c;">Email</td><td style="padding:4px 0;text-align:right;color:#154B59;">${escapeHtml(blocker?.email)}</td></tr>
          </table>
        </div>

        <div style="text-align:center;margin-top:20px;">
          <a href="https://admin.wopecar.com/vendors" style="display:inline-block;background:#154B59;color:#ffffff;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:10px;text-decoration:none;">Review in Admin Dashboard</a>
        </div>
      </div>`;
  return emailShell(body);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { blockerId, vendorId, reason } = await req.json();
    if (!blockerId || !vendorId) {
      return jsonResponse({ error: 'blockerId and vendorId are required.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      return jsonResponse({ error: 'RESEND_API_KEY is not configured for this project.' }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const [{ data: vendor }, { data: blocker }, { data: supportSetting }] = await Promise.all([
      adminClient.from('vendors').select('id, business_name').eq('id', vendorId).maybeSingle(),
      adminClient.from('users').select('full_name, email').eq('id', blockerId).maybeSingle(),
      adminClient.from('app_settings').select('value').eq('key', 'support_email').maybeSingle(),
    ]);
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
        subject: `Vendor Blocked - ${vendor?.business_name ?? vendorId}`,
        html: buildEmailHtml({ vendor: vendor ? { ...vendor, id: vendorId } : { id: vendorId }, blocker, reason: reason ?? null }),
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
