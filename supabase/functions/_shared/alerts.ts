// Admin alerts for payment problems that need a person to look at them.
//
// Same table, throttle and inbox as wopecar-admin's _shared/qbAlerts.ts: a row in
// `integration_alerts` every time, but at most one email per `kind` every 6 hours, so a problem is
// noticed within minutes without flooding the inbox while it stays broken. Kept as its own file
// because qbAlerts.ts lives in the wopecar-admin repo (both repos deploy functions to the same
// Supabase project and already keep their own copy of _shared/cronAuth.ts) and because the wording
// here is about payments rather than QuickBooks.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const THROTTLE_MS = 6 * 60 * 60 * 1000;

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/**
 * Records an alert and emails the support/admin address unless the same `kind` was already emailed
 * in the last 6 hours. Never throws - an alert must not be able to break the payment work that
 * triggered it.
 */
export async function raisePaymentAlert(
  supabase: SupabaseClient,
  kind: string,
  subject: string,
  message: string,
  detail?: string
): Promise<void> {
  try {
    const since = new Date(Date.now() - THROTTLE_MS).toISOString();
    const { data: recent } = await supabase
      .from('integration_alerts')
      .select('id')
      .eq('kind', kind)
      .not('notified_at', 'is', null)
      .gte('notified_at', since)
      .limit(1);
    const alreadyNotified = !!recent && recent.length > 0;

    const { data: inserted } = await supabase
      .from('integration_alerts')
      .insert({ kind, message: message.slice(0, 500), detail: detail?.slice(0, 2000) ?? null })
      .select('id')
      .single();

    if (alreadyNotified) return;

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) return;
    const { data: supportSetting } = await supabase.from('app_settings').select('value').eq('key', 'support_email').maybeSingle();
    const to = typeof supportSetting?.value === 'string' && supportSetting.value ? supportSetting.value : 'support@wopecar.com';

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'WopeCar Alerts <bookings@wopecar.com>',
        to: [to],
        subject: `Action needed: ${subject}`,
        html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#16232A">
          <h2 style="color:#154B59;margin:0 0 12px">${escapeHtml(subject)}</h2>
          <p style="font-size:15px;line-height:1.6">${escapeHtml(message)}</p>
          ${detail ? `<p style="font-size:13px;line-height:1.6;color:#5C6B71;white-space:pre-wrap">${escapeHtml(detail)}</p>` : ''}
          <p style="font-size:14px;line-height:1.6"><strong>Where to look:</strong> the Paystack dashboard &rarr; Transactions for the reference above, and <a href="https://admin.wopecar.com/bookings">admin.wopecar.com &rarr; Bookings</a> for the booking.</p>
          <p style="font-size:12px;color:#999">You will get at most one of these emails every 6 hours for the same kind of problem. Every occurrence is recorded regardless.</p>
        </div>`,
      }),
    });
    if (res.ok && inserted?.id) {
      await supabase.from('integration_alerts').update({ notified_at: new Date().toISOString() }).eq('id', inserted.id);
    } else if (!res.ok) {
      console.error('Could not send payment alert email:', res.status, await res.text());
    }
  } catch (e) {
    console.error('raisePaymentAlert failed:', e instanceof Error ? e.message : e);
  }
}
