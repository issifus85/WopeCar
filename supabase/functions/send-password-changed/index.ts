// Supabase Edge Function - sends a real "your password was changed" email
// via Resend, right after a successful password update (both the Settings
// screen's re-verified change and the forgot-password recovery flow route
// through this - see services/supabaseAuthApi.js's changePassword() and
// setPasswordAfterRecovery()). This is a security notification, not a
// convenience one: it should fire every time, including the recovery path,
// so the account owner finds out if a change wasn't actually them.
//
// Self-service, like send-welcome-email - identifies the caller from their
// own JWT (works for the recovery flow's temporary session too), no other
// input needed.
//
// Deploy with: supabase functions deploy send-password-changed
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

function formatWhen(date: Date) {
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function buildEmailHtml({ firstName, whenText, supportEmail }: { firstName: string; whenText: string; supportEmail: string | null }) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f5f5;padding:32px 16px;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
      <div style="background:#154B59;padding:28px 24px;text-align:center;">
        <img src="https://qvactycnufaowwsiqdrz.supabase.co/functions/v1/logo-mark" alt="WopeCar" width="180" style="display:inline-block;height:auto;max-width:180px;" />
      </div>
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="width:56px;height:56px;border-radius:28px;background:#EEF9F9;display:inline-block;text-align:center;font-size:28px;line-height:56px;">&#128274;</div>
          <h1 style="font-size:20px;color:#154B59;margin:16px 0 4px;">Your password was changed</h1>
          <p style="font-size:14px;color:#666666;margin:0;">Hi ${escapeHtml(firstName)}, this confirms your WopeCar password was changed on ${escapeHtml(whenText)}.</p>
        </div>
        <div style="background:#FDECEC;border-radius:12px;padding:16px;">
          <p style="font-size:13px;color:#8a4a4a;margin:0;">If this wasn't you, contact us immediately${supportEmail ? ` at <a href="mailto:${escapeHtml(supportEmail)}" style="color:#154B59;font-weight:bold;">${escapeHtml(supportEmail)}</a>` : ''} so we can secure your account.</p>
        </div>
      </div>
      <div style="background:#f5f5f5;padding:16px 24px;text-align:center;">
        <p style="font-size:12px;color:#999999;margin:0;">This is a security notification - you'll always get one when your password changes.</p>
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
    const [{ data: profile }, { data: supportSetting }] = await Promise.all([
      adminClient.from('users').select('full_name').eq('id', user.id).maybeSingle(),
      adminClient.from('app_settings').select('value').eq('key', 'support_email').maybeSingle(),
    ]);

    const firstName = (profile?.full_name || user.email || 'there').trim().split(/\s+/)[0];
    const supportEmail = typeof supportSetting?.value === 'string' ? supportSetting.value : null;
    const html = buildEmailHtml({ firstName, whenText: formatWhen(new Date()), supportEmail });

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'WopeCar <bookings@wopecar.com>',
        to: [user.email],
        subject: 'Your WopeCar password was changed',
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
