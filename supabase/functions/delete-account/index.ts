// Supabase Edge Function - real self-service account deletion.
//
// Why this needs to exist at all: the Supabase client SDK has no
// "delete my own account" call - deleting an auth.users row requires the
// service_role key, which must never reach client code. This function is
// the sanctioned, narrow bridge: it runs server-side (Deno), verifies the
// caller's identity and password itself, and only then uses service_role
// internally to do the actual delete.
//
// Deploy with: supabase functions deploy delete-account
// (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
// injected automatically by Supabase into every Edge Function's
// environment - no manual secret configuration needed.)

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

// Best-effort notice to WopeCar support that an account was deleted - fired
// after deleteUser() already succeeded, so a Resend hiccup here must never
// fail the deletion itself (the caller already got their {success: true}
// worth of guarantee by the time this runs). Same emailShell/support_email
// lookup convention as send-signup-notification, just inlined here rather
// than as its own trigger-fired function: deleteUser() has to be the very
// last step of THIS function for the password-then-delete ordering to mean
// anything, so there's no natural DB row/trigger to hang a separate
// notification function off of the way signup (an auth.users INSERT) has.
async function notifySupportOfDeletion(
  supabaseUrl: string,
  serviceRoleKey: string,
  resendApiKey: string | undefined,
  { email, fullName }: { email: string; fullName: string | null }
) {
  if (!resendApiKey) return;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: supportSetting } = await adminClient.from('app_settings').select('value').eq('key', 'support_email').maybeSingle();
  const supportEmail = typeof supportSetting?.value === 'string' && supportSetting.value ? supportSetting.value : 'support@wopecar.com';

  const escapeHtml = (value: unknown) =>
    String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f5f5;padding:32px 16px;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
      <div style="background:#154B59;padding:28px 24px;text-align:center;">
        <img src="https://qvactycnufaowwsiqdrz.supabase.co/functions/v1/logo-mark" alt="WopeCar" width="180" style="display:inline-block;height:auto;max-width:180px;" />
      </div>
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:20px;">
          <h1 style="font-size:18px;color:#154B59;margin:0 0 4px;">Account Deleted</h1>
          <p style="font-size:13px;color:#666666;margin:0;">A user just deleted their own WopeCar account from the app.</p>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:6px 0;color:#5b6b6c;">Name</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(fullName || 'Not provided')}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Email</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(email)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Deleted</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }))}</td></tr>
        </table>
      </div>
    </div>
  </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'WopeCar <bookings@wopecar.com>',
      to: [supportEmail],
      subject: `Account Deleted - ${email}`,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend error: ${await res.text()}`);
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

    const { password } = await req.json();
    if (!password) {
      return jsonResponse({ error: 'Password is required to delete your account.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Step 1: identify the caller from their OWN access token. Anon-key
    // client scoped to just this request's Authorization header - never
    // service_role for this step, so this can only ever act as whoever is
    // actually calling.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: getUserError } = await callerClient.auth.getUser();
    if (getUserError || !user) {
      return jsonResponse({ error: 'Invalid or expired session.' }, 401);
    }

    // Step 2: re-verify the password before deleting anything - same
    // "re-enter your password" requirement Laravel's DELETE /api/account
    // already enforces. A throwaway anon client, so this sign-in attempt
    // never touches the caller's real session/token.
    const verifyClient = createClient(supabaseUrl, anonKey);
    const { error: passwordError } = await verifyClient.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (passwordError) {
      return jsonResponse({ error: 'Incorrect password.' }, 401);
    }

    // Step 3: only now, with identity + password both confirmed, use
    // service_role to actually delete. Cascades to public.users (ON DELETE
    // CASCADE, see supabase/migrations/0001_initial_schema.sql) and
    // everywhere else with a users FK - same end state as Laravel revoking
    // every Sanctum token and removing the account.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Read the display name before it's gone for good - the cascade below
    // takes public.users with it, and the support notice reads better with
    // a name than just an email.
    const { data: profile } = await adminClient.from('users').select('full_name').eq('id', user.id).maybeSingle();

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteError) {
      return jsonResponse({ error: deleteError.message }, 500);
    }

    // Best-effort - the account is already gone at this point regardless of
    // whether support gets notified, so this must never turn a successful
    // deletion into an error response.
    try {
      await notifySupportOfDeletion(supabaseUrl, serviceRoleKey, Deno.env.get('RESEND_API_KEY'), {
        email: user.email!,
        fullName: profile?.full_name ?? null,
      });
    } catch (e) {
      console.error('notifySupportOfDeletion failed:', e);
    }

    return jsonResponse({ success: true });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
