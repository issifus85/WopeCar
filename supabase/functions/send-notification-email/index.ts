// Supabase Edge Function - generic self-service transactional email, real
// Resend delivery replacing services/emailService.js's old console.info
// stub. Backs contexts/InboxContext.js's notifyBookingEvent() for the
// notification types that don't already have their own dedicated, richer
// email (booking_modified, reminder, booking_confirmed, payment) - it's
// deliberately NOT called for booking_created/booking_cancelled, which
// already get a full templated email from send-booking-confirmation /
// send-booking-cancelled at their real write sites; wiring this generically
// for every type would double-email the user for those two.
//
// Self-service like send-welcome-email/send-password-changed - identifies
// the caller from their own JWT and always sends to their own email, no
// other-user targeting possible. Takes plain {subject, body} text (already
// computed client-side by buildNotificationContent()) rather than a richer
// payload, since this is intentionally the plain/generic fallback, not
// another bespoke template.
//
// Deploy with: supabase functions deploy send-notification-email
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

function buildEmailHtml({ firstName, subject, body }: { firstName: string; subject: string; body: string }) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f5f5;padding:32px 16px;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
      <div style="background:#154B59;padding:28px 24px;text-align:center;">
        <img src="https://qvactycnufaowwsiqdrz.supabase.co/functions/v1/logo-mark" alt="WopeCar" width="180" style="display:inline-block;height:auto;max-width:180px;" />
      </div>
      <div style="padding:28px 24px;">
        <p style="font-size:14px;color:#666666;margin:0 0 12px;">Hi ${escapeHtml(firstName)},</p>
        <h1 style="font-size:18px;color:#154B59;margin:0 0 12px;">${escapeHtml(subject)}</h1>
        <p style="font-size:14px;color:#333333;line-height:1.6;margin:0;">${escapeHtml(body)}</p>
      </div>
      <div style="background:#f5f5f5;padding:16px 24px;text-align:center;">
        <p style="font-size:12px;color:#999999;margin:0;">You're receiving this because notifications are enabled in your WopeCar app settings.</p>
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

    const { subject, body } = await req.json();
    if (!subject || !body) {
      return jsonResponse({ error: 'subject and body are required.' }, 400);
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
    const { data: profile } = await adminClient.from('users').select('full_name').eq('id', user.id).maybeSingle();

    const firstName = (profile?.full_name || user.email || 'there').trim().split(/\s+/)[0];
    const html = buildEmailHtml({ firstName, subject, body });

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'WopeCar <bookings@wopecar.com>',
        to: [user.email],
        subject,
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
