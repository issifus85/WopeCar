// Supabase Edge Function - notifies WopeCar support by email as soon as a
// new user account is created in auth.users. Fired by a Postgres trigger
// (see migration 0059_add_signup_admin_notification.sql) on every INSERT
// into auth.users, not called from client code - this is what makes it
// cover both the website's supabase.auth.signUp() and the mobile app's
// signup flow (plus OAuth/magic-link, if ever enabled) from one place,
// with no risk of either client forgetting to fire it or a signup
// completing while the client is offline/backgrounded.
//
// Like send-inquiry-notification, the caller here isn't a Supabase Auth
// session - it's pg_net posting from inside Postgres - so this is deployed
// --no-verify-jwt and authenticated instead by including the project's
// anon key as a bearer token in the trigger's http_post call (safe to
// embed: the anon key is a public, RLS-gated key by design, not a
// secret). The recipient is re-read from app_settings via service_role
// rather than trusted from the request body, matching that same function's
// convention, even though the request body here only ever originates from
// our own trigger (not a public form) and so is inherently trusted.
//
// The trigger fires the instant auth.users gets its row, which is before the
// app has saved anything else: Sign in with Apple, for one, only writes the
// user's name to public.users a moment after sign-in (see loginWithApple in
// services/supabaseAuthApi.js). So the email is sent in the background after
// a short wait, and reads the saved name and the sign-in method back from the
// database instead of trusting the trigger's snapshot.
//
// Deploy with: supabase functions deploy send-signup-notification --no-verify-jwt
// Reuses the same RESEND_API_KEY secret as every other email function here.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isTrustedInternalCaller, unauthorizedResponse } from '../_shared/cronAuth.ts';

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

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return 'Just now';
  return new Date(dateStr).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
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

const SEND_DELAY_MS = 20_000;

const PROVIDER_LABELS: Record<string, string> = {
  email: 'Email & password',
  apple: 'Apple',
  google: 'Google',
  facebook: 'Facebook',
};

function describeSignInMethod(provider: string | null, email: string) {
  if (!provider) return 'Unknown';
  const label = PROVIDER_LABELS[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
  if (provider === 'apple' && email.toLowerCase().endsWith('@privaterelay.appleid.com')) return `${label} (email hidden)`;
  return label;
}

function buildEmailHtml({ email, fullName, signInMethod, createdAt }: { email: string; fullName: string | null; signInMethod: string; createdAt: string | null }) {
  const body = `
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:20px;">
          <h1 style="font-size:18px;color:#154B59;margin:0 0 4px;">New User Signup</h1>
          <p style="font-size:13px;color:#666666;margin:0;">A new account was just created on WopeCar.</p>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
          <tr><td style="padding:6px 0;color:#5b6b6c;">Name</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(fullName || 'Not provided')}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Email</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(email)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Signed in with</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(signInMethod)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Signed up</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(formatDateTime(createdAt))}</td></tr>
        </table>

        <div style="text-align:center;margin-top:20px;">
          <a href="https://admin.wopecar.com/users" style="display:inline-block;background:#154B59;color:#ffffff;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:10px;text-decoration:none;">View in Admin Dashboard</a>
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

async function sendSignupEmail(
  resendApiKey: string,
  { email, fullName, createdAt }: { email: string; fullName: string | null; createdAt: string | null },
) {
  await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));

  const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Saved profile (name the app wrote after sign-in) and the auth record (how they signed in). Either lookup
  // failing just falls back to what the trigger sent - the email must still go out.
  const { data: profile } = await adminClient.from('users').select('id, full_name').eq('email', email).maybeSingle();
  let provider: string | null = null;
  if (profile?.id) {
    const { data: authUser } = await adminClient.auth.admin.getUserById(profile.id);
    provider = (authUser?.user?.app_metadata?.provider as string | undefined) ?? null;
  }
  const savedName = (profile?.full_name ?? '').trim() || (fullName ?? '').trim() || null;

  const { data: supportSetting } = await adminClient.from('app_settings').select('value').eq('key', 'support_email').maybeSingle();
  const supportEmail = typeof supportSetting?.value === 'string' && supportSetting.value ? supportSetting.value : 'support@wopecar.com';

  await sendResendEmail(resendApiKey, {
    from: 'WopeCar <bookings@wopecar.com>',
    to: [supportEmail],
    subject: `New Signup - ${email}`,
    html: buildEmailHtml({ email, fullName: savedName, signInMethod: describeSignInMethod(provider, email), createdAt }),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Internal-only (cron / DB trigger): reject anyone without the shared secret.
  if (!(await isTrustedInternalCaller(req))) return unauthorizedResponse();

  try {
    const { email, fullName, createdAt } = await req.json();
    if (!email) {
      return jsonResponse({ error: 'email is required.' }, 400);
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return jsonResponse({ error: 'RESEND_API_KEY is not configured for this project.' }, 500);
    }

    // Answer the trigger straight away (pg_net doesn't wait long) and send the email in the background.
    const job = sendSignupEmail(resendApiKey, { email, fullName: fullName ?? null, createdAt: createdAt ?? null }).catch((e) =>
      console.error('send-signup-notification failed:', e instanceof Error ? e.message : e),
    );
    // deno-lint-ignore no-explicit-any
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(job);
    else await job;

    return jsonResponse({ success: true, queued: true });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
