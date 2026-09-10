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
    // service_role to actually delete.
    //
    // This used to be a plain hard delete (adminClient.auth.admin.
    // deleteUser(user.id)), which cascades to public.users (ON DELETE
    // CASCADE) and from there hits every OTHER table with a users FK. Most
    // of those are CASCADE too (documents, reviews, pending_invoices,
    // notifications, push_tokens, conversation_participants, vendors) -
    // but several are deliberately NOT: bookings.renter_id,
    // booking_modifications.modified_by, conversations.customer_id/
    // last_message_sender_id, conversation_messages.sender_id,
    // conversation_participants.invited_by_user_id, blog_posts.author_id
    // and quickbooks_tokens.connected_by are all `ON DELETE NO ACTION` -
    // real financial/audit/platform-integrity records that must survive a
    // renter deleting their own account (QuickBooks reporting, vendor
    // payout history, admin booking history, support chat transcripts).
    // A hard delete failed outright the moment a renter had so much as one
    // booking or chat message - confirmed live via a real 500 "Database
    // error deleting user" - which meant almost no real renter could ever
    // successfully delete their account.
    //
    // Fix: soft-delete the auth identity instead (shouldSoftDelete=true
    // below) - Supabase keeps the auth.users row but scrambles its
    // credentials and invalidates every session/refresh token, so the
    // renter can never sign in again, without physically removing the row
    // (so public.users is never cascade-removed, and every NO ACTION FK
    // into it stays valid). We then explicitly scrub public.users' own PII
    // columns (this table isn't touched by Supabase's auth-side soft
    // delete) and remove the renter's own sensitive uploads (documents -
    // driver's licence/national ID/proof-of-address photos - and
    // push_tokens, so a "deleted" account never receives a push again).
    // Reviews/pending_invoices/notifications/conversation_participants are
    // deliberately left alone even though their FK says CASCADE - deleting
    // them isn't needed for account deletion to succeed, and destroying a
    // renter's reviews would unfairly erase real vendor rating history.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Read the display name before it's scrubbed - the support notice
    // below reads better with a name than just an email.
    const { data: profile } = await adminClient.from('users').select('full_name').eq('id', user.id).maybeSingle();

    // Best-effort - a user's own uploaded ID/licence photos are sensitive
    // and should genuinely go away, but a storage hiccup here must never
    // block the rest of account deletion (the important part - identity +
    // login - still has to succeed).
    try {
      const { data: docs } = await adminClient.from('documents').select('id, file_path').eq('user_id', user.id);
      if (docs && docs.length > 0) {
        const paths = docs.map((d) => d.file_path).filter(Boolean);
        if (paths.length > 0) {
          await adminClient.storage.from('documents').remove(paths);
        }
        await adminClient.from('documents').delete().eq('user_id', user.id);
      }
    } catch (e) {
      console.error('Failed to remove documents during account deletion:', e);
    }

    // Best-effort - stop any future push notifications to a "deleted"
    // account; not required for the deletion itself to succeed.
    try {
      await adminClient.from('push_tokens').delete().eq('user_id', user.id);
    } catch (e) {
      console.error('Failed to remove push_tokens during account deletion:', e);
    }

    // Scrub PII from the retained profile row. Must succeed before we
    // touch the auth side below - if this fails, the account should stay
    // fully intact/usable rather than ending up half-deleted.
    const anonymizedEmail = `deleted-${user.id}@wopecar-deleted.invalid`;
    const { error: scrubError } = await adminClient
      .from('users')
      .update({
        full_name: 'Deleted User',
        first_name: null,
        last_name: null,
        nickname: null,
        email: anonymizedEmail,
        phone: null,
        avatar_url: null,
        birthday: null,
        address: null,
        address2: null,
        city: null,
        state: null,
        country: null,
        zip_code: null,
        driver_license_number: null,
        driver_license_expiry: null,
        driver_license_country: null,
        // NOT NULL columns - 'pending' is their own column default, i.e.
        // the same neutral state a fresh signup starts in; there's no
        // "null"/"deleted" status value in the check constraint for these.
        license_verification_status: 'pending',
        national_id_type: null,
        national_id_number: null,
        national_id_expiry: null,
        national_id_status: 'pending',
        national_id_rejection_reason: null,
        preferred_pickup_location: null,
        emergency_contact_name: null,
        emergency_contact_phone: null,
        referral_code: null,
        email_verified_at: null,
        phone_verified_at: null,
      })
      .eq('id', user.id);
    if (scrubError) {
      return jsonResponse({ error: scrubError.message }, 500);
    }

    // Soft delete: keeps the auth.users row (Supabase scrambles its own
    // credentials/identifiers and invalidates every session internally),
    // so it never cascades public.users away - see the long comment above
    // for why that matters here.
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id, true);
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
