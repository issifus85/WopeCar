// Supabase Edge Function - notifies a vendor by email when admin records a
// payout to them (services/adminVendorsApi.js's recordVendorPayout() is the
// only real call site). No real money movement happens here or in that
// function - this is a manual record-keeping flow (a vendor_payouts row +
// this email), not a Paystack Transfers integration. Caller must be an
// admin - identified from their own JWT, then role verified via
// service_role before anything is sent.
//
// Deploy with: supabase functions deploy send-vendor-payout
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

function formatCurrency(amount: number | null | undefined) {
  return `GHS ${Number(amount ?? 0).toFixed(2)}`;
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function buildEmailHtml({ firstName, amount, note, whenText, supportEmail }: {
  firstName: string; amount: number; note: string | null; whenText: string; supportEmail: string | null;
}) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f5f5;padding:32px 16px;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
      <div style="background:#154B59;padding:28px 24px;text-align:center;">
        <img src="https://qvactycnufaowwsiqdrz.supabase.co/functions/v1/logo-mark" alt="WopeCar" width="180" style="display:inline-block;height:auto;max-width:180px;" />
      </div>
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="width:56px;height:56px;border-radius:28px;background:#EEF9F9;display:inline-block;text-align:center;font-size:28px;line-height:56px;">&#128176;</div>
          <h1 style="font-size:20px;color:#154B59;margin:16px 0 4px;">Payout Sent</h1>
          <p style="font-size:14px;color:#666666;margin:0;">Hi ${escapeHtml(firstName)}, a payout has been recorded on your WopeCar account.</p>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:6px 0;color:#5b6b6c;">Amount</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#154B59;font-size:16px;">${formatCurrency(amount)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Date</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(whenText)}</td></tr>
        </table>
        ${note ? `<div style="background:#f5f5f5;border-radius:12px;padding:14px 16px;font-size:13px;color:#5b6b6c;margin-top:12px;">${escapeHtml(note)}</div>` : ''}
      </div>
      <div style="background:#f5f5f5;padding:16px 24px;text-align:center;">
        <p style="font-size:12px;color:#999999;margin:0;">Questions about this payout? Contact us${supportEmail ? ` at <a href="mailto:${escapeHtml(supportEmail)}" style="color:#3EB6BA;">${escapeHtml(supportEmail)}</a>` : ''}.</p>
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

    const { vendorUserId, amount, note } = await req.json();
    if (!vendorUserId || typeof amount !== 'number' || amount <= 0) {
      return jsonResponse({ error: 'vendorUserId and a positive amount are required.' }, 400);
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

    const [{ data: vendorUser }, { data: supportSetting }] = await Promise.all([
      adminClient.from('users').select('email, full_name').eq('id', vendorUserId).maybeSingle(),
      adminClient.from('app_settings').select('value').eq('key', 'support_email').maybeSingle(),
    ]);
    if (!vendorUser?.email) {
      return jsonResponse({ error: 'Vendor has no email on file.' }, 404);
    }

    if (!resendApiKey) {
      return jsonResponse({ error: 'RESEND_API_KEY is not configured for this project.' }, 500);
    }

    const firstName = (vendorUser.full_name || '').trim().split(/\s+/)[0] || 'there';
    const supportEmail = typeof supportSetting?.value === 'string' ? supportSetting.value : null;
    const html = buildEmailHtml({ firstName, amount, note: note || null, whenText: formatDate(new Date()), supportEmail });

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'WopeCar <bookings@wopecar.com>',
        to: [vendorUser.email],
        subject: 'A payout has been sent to you',
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
