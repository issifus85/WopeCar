// Supabase Edge Function - sends one branded notice email to a list of users (by user id). INTERNAL ONLY: it needs the shared
// x-cron-secret (the same one the cron jobs use), so it can be run from SQL / another server function but never from a browser.
//
// Body: { userIds: string[], subject: string, heading?: string, message: string, buttonLabel?: string, buttonUrl?: string }
// Used for one-off notices that push can't reach (e.g. "a new Android version is ready" while Android push has no FCM key).
// Each user gets their own email (no CC/BCC between customers), addressed by first name.
//
// Deploy with: supabase functions deploy send-user-email --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isTrustedInternalCaller, unauthorizedResponse } from '../_shared/cronAuth.ts';

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  if (!(await isTrustedInternalCaller(req))) return unauthorizedResponse();

  try {
    const { userIds, subject, heading, message, buttonLabel, buttonUrl } = await req.json();
    if (!Array.isArray(userIds) || userIds.length === 0 || userIds.length > 200) return Response.json({ error: 'userIds (1-200) is required.' }, { status: 400 });
    if (!subject || !message) return Response.json({ error: 'subject and message are required.' }, { status: 400 });
    if (buttonUrl && !/^https:\/\//i.test(buttonUrl)) return Response.json({ error: 'buttonUrl must be https.' }, { status: 400 });

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) return Response.json({ error: 'RESEND_API_KEY is not configured.' }, { status: 500 });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: users } = await admin.from('users').select('id, email, full_name').in('id', userIds);

    const results: { email: string; ok: boolean; error?: string }[] = [];
    for (const u of users ?? []) {
      if (!u.email) continue;
      const first = String(u.full_name ?? '').trim().split(/\s+/)[0] || 'there';
      const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f5f5;padding:32px 16px;">
        <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
          <div style="background:#154B59;padding:28px 24px;text-align:center;">
            <img src="${Deno.env.get('SUPABASE_URL')}/functions/v1/logo-mark" alt="WopeCar" width="180" style="display:inline-block;height:auto;max-width:180px;" />
          </div>
          <div style="padding:28px 24px;">
            <p style="font-size:14px;color:#666666;margin:0 0 12px;">Hi ${escapeHtml(first)},</p>
            ${heading ? `<h1 style="font-size:18px;color:#154B59;margin:0 0 12px;">${escapeHtml(heading)}</h1>` : ''}
            <p style="font-size:14px;color:#333333;line-height:1.6;margin:0 0 20px;">${escapeHtml(message)}</p>
            ${buttonUrl && buttonLabel ? `<div style="text-align:center;"><a href="${escapeHtml(buttonUrl)}" style="display:inline-block;background:#154B59;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:10px;">${escapeHtml(buttonLabel)}</a></div>` : ''}
          </div>
          <div style="background:#f5f5f5;padding:16px 24px;text-align:center;">
            <p style="font-size:12px;color:#999999;margin:0;">Questions? Reply to this email or message support in the WopeCar app.</p>
          </div>
        </div>
      </div>`;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'WopeCar <bookings@wopecar.com>', to: [u.email], subject, html }),
      });
      results.push({ email: u.email, ok: res.ok, ...(res.ok ? {} : { error: (await res.text()).slice(0, 200) }) });
    }
    return Response.json({ sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Unexpected error.' }, { status: 500 });
  }
});
