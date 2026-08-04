// Supabase Edge Function - notifies a vendor by email when admin verifies
// or rejects one of their uploaded documents (Ghana Card or business
// registration). Caller must be an admin (services/adminVendorsApi.js's
// setVendorDocumentStatus() is the only real call site) - identified from
// their own JWT, then role verified via service_role before anything is
// sent.
//
// Deploy with: supabase functions deploy send-vendor-document-status
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

function buildEmailHtml({ firstName, docLabel, verified, reason, supportEmail }: {
  firstName: string; docLabel: string; verified: boolean; reason: string | null; supportEmail: string | null;
}) {
  const icon = verified ? '&#9989;' : '&#9888;&#65039;';
  const iconBg = verified ? '#EEF9F9' : '#FDECEC';
  const title = verified ? 'Document Verified' : 'Document Needs Attention';
  const message = verified
    ? `Your ${escapeHtml(docLabel)} has been verified.`
    : `Your ${escapeHtml(docLabel)} was not approved and needs to be re-uploaded.`;

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f5f5;padding:32px 16px;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
      <div style="background:#154B59;padding:28px 24px;text-align:center;">
        <img src="https://qvactycnufaowwsiqdrz.supabase.co/functions/v1/logo-mark" alt="WopeCar" width="180" style="display:inline-block;height:auto;max-width:180px;" />
      </div>
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="width:56px;height:56px;border-radius:28px;background:${iconBg};display:inline-block;text-align:center;font-size:28px;line-height:56px;">${icon}</div>
          <h1 style="font-size:20px;color:#154B59;margin:16px 0 4px;">${title}</h1>
          <p style="font-size:14px;color:#666666;margin:0;">Hi ${escapeHtml(firstName)}, ${message}</p>
        </div>
        ${reason ? `<div style="background:#f5f5f5;border-radius:12px;padding:14px 16px;font-size:13px;color:#5b6b6c;"><strong style="color:#154B59;">Reason:</strong> ${escapeHtml(reason)}</div>` : ''}
        ${!verified ? `
        <div style="text-align:center;margin-top:24px;">
          <span style="display:inline-block;background:#154B59;color:#ffffff;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:10px;">Re-upload in the app</span>
        </div>` : ''}
      </div>
      <div style="background:#f5f5f5;padding:16px 24px;text-align:center;">
        <p style="font-size:12px;color:#999999;margin:0;">Questions? Contact us${supportEmail ? ` at <a href="mailto:${escapeHtml(supportEmail)}" style="color:#3EB6BA;">${escapeHtml(supportEmail)}</a>` : ''}.</p>
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

    const { vendorUserId, docLabel, verified, reason } = await req.json();
    if (!vendorUserId || typeof verified !== 'boolean' || !docLabel) {
      return jsonResponse({ error: 'vendorUserId, docLabel, and verified are required.' }, 400);
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
    const html = buildEmailHtml({ firstName, docLabel, verified, reason: verified ? null : (reason || null), supportEmail });

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'WopeCar <bookings@wopecar.com>',
        to: [vendorUser.email],
        subject: verified ? 'A document was verified' : 'A document needs attention',
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
