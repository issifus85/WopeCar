// Supabase Edge Function - sends a real welcome email via Resend the first
// time a user's signup is confirmed. Same security pattern as every other
// email function here: identify the caller from their own JWT, then use
// service_role only for the actual privileged work (idempotency check +
// write, outbound email call).
//
// Deploy with: supabase functions deploy send-welcome-email
// Reuses the same RESEND_API_KEY secret as send-booking-confirmation.
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected
// automatically.

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

function buildEmailHtml({ firstName }: { firstName: string }) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f5f5;padding:32px 16px;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
      <div style="background:#154B59;padding:28px 24px;text-align:center;">
        <img src="https://qvactycnufaowwsiqdrz.supabase.co/functions/v1/logo-mark" alt="WopeCar" width="180" style="display:inline-block;height:auto;max-width:180px;" />
      </div>
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="width:56px;height:56px;border-radius:28px;background:#EEF9F9;display:inline-block;text-align:center;font-size:28px;line-height:56px;">&#128075;</div>
          <h1 style="font-size:20px;color:#154B59;margin:16px 0 4px;">Welcome to WopeCar, ${escapeHtml(firstName)}!</h1>
          <p style="font-size:14px;color:#666666;margin:0;">Your account is verified and ready to go.</p>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px;">
          <tr>
            <td style="padding:10px 0;color:#154B59;vertical-align:top;width:32px;">&#128663;</td>
            <td style="padding:10px 0;color:#333333;">Browse and book cars from vetted local vendors, self-drive or with a chauffeur.</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#154B59;vertical-align:top;width:32px;">&#128179;</td>
            <td style="padding:10px 0;color:#333333;">Pay securely in-app and track every booking from request to return.</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#154B59;vertical-align:top;width:32px;">&#128172;</td>
            <td style="padding:10px 0;color:#333333;">Message your vendor directly and get support anytime from the Inbox.</td>
          </tr>
        </table>

        <div style="text-align:center;margin-top:24px;">
          <a href="wopecar://" style="display:inline-block;background:#154B59;color:#ffffff;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:10px;text-decoration:none;">Start browsing in the app</a>
        </div>
      </div>
      <div style="background:#f5f5f5;padding:16px 24px;text-align:center;">
        <p style="font-size:12px;color:#999999;margin:0;">Questions? Just reply to this email - we're happy to help.</p>
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

    // Step 1: identify the caller from their own token.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: getUserError } = await callerClient.auth.getUser();
    if (getUserError || !user) {
      return jsonResponse({ error: 'Invalid or expired session.' }, 401);
    }

    // Step 2: idempotency check + the actual privileged work, service_role.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile, error: profileError } = await adminClient
      .from('users')
      .select('full_name, welcome_email_sent_at')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) {
      return jsonResponse({ error: profileError.message }, 500);
    }

    // Already sent - not an error, just nothing to do. Keeps this endpoint
    // safe to call every time the confirmation screen mounts.
    if (profile?.welcome_email_sent_at) {
      return jsonResponse({ success: true, skipped: true });
    }

    if (!resendApiKey) {
      return jsonResponse({ error: 'RESEND_API_KEY is not configured for this project.' }, 500);
    }

    const firstName = (profile?.full_name || user.email || 'there').trim().split(/\s+/)[0];
    const html = buildEmailHtml({ firstName });

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'WopeCar <bookings@wopecar.com>',
        to: [user.email],
        subject: 'Welcome to WopeCar',
        html,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      return jsonResponse({ error: `Resend error: ${errText}` }, 502);
    }

    // Mark sent only after a confirmed successful send - a failed attempt
    // above returns before this, so it's safe to retry on the next mount.
    await adminClient.from('users').update({ welcome_email_sent_at: new Date().toISOString() }).eq('id', user.id);

    return jsonResponse({ success: true });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
