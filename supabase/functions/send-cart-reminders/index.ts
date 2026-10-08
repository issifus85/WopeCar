// Supabase Edge Function - recurring "you still have this in your cart"
// nudge (in-app notification + push + email) for a signed-in user whose
// cart_items row (see services/cartSync.js, mirroring the local cart from
// contexts/CartContext.js) has sat for 3+ days without being removed
// (either the user took it out, or checkout/payment.js's own
// removeFromCart call fired on a completed booking - both already delete
// the row, see cart_items table comment).
//
// cart_items has no server presence for a signed-out/guest cart by
// design - this only ever covers signed-in users, who are the only ones
// we can safely notify (real user_id, real email).
//
// reminder_sent_at is a lookback-based guard (same idiom as
// vendors.calendar_reminder_sent_at / send-vendor-calendar-reminders), so
// this fires again every 3 days rather than once ever, until the item
// leaves the cart.
//
// Deploy with: supabase functions deploy send-cart-reminders --no-verify-jwt
// Reuses the same RESEND_API_KEY secret as every other email function.

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

function buildEmailHtml({ heading, intro, ctaHref, ctaLabel }: { heading: string; intro: string; ctaHref: string; ctaLabel: string }) {
  const body = `
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:20px;">
          <h1 style="font-size:18px;color:#154B59;margin:0 0 4px;">${escapeHtml(heading)}</h1>
          <p style="font-size:13px;color:#666666;margin:0;">${escapeHtml(intro)}</p>
        </div>
        <div style="text-align:center;margin-top:20px;">
          <a href="${ctaHref}" style="display:inline-block;background:#154B59;color:#ffffff;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:10px;text-decoration:none;">${escapeHtml(ctaLabel)}</a>
        </div>
      </div>`;
  return emailShell(body);
}

async function sendResendEmail(resendApiKey: string, payload: Record<string, unknown>) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Resend error: ${await res.text()}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Internal-only (cron / DB trigger): reject anyone without the shared secret.
  if (!(await isTrustedInternalCaller(req))) return unauthorizedResponse();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    const { data: items, error } = await adminClient
      .from('cart_items')
      .select('id, user_id, car_id, cars(name), users:user_id(email, full_name)')
      .lte('created_at', threeDaysAgo)
      .or(`reminder_sent_at.is.null,reminder_sent_at.lte.${threeDaysAgo}`);
    if (error) throw error;

    let notified = 0;
    for (const item of items ?? []) {
      const car = item.cars as { name?: string } | null;
      const renter = item.users as { email?: string; full_name?: string } | null;
      const carName = car?.name ?? 'A car';
      const title = 'Still thinking it over?';
      const body = `${carName} is still in your cart. Complete your booking before someone else grabs it.`;

      try {
        await adminClient.from('notifications').insert({
          user_id: item.user_id,
          type: 'cart_reminder',
          title,
          body,
        });
      } catch {
        // Best-effort, same as every other reminder cron - one failed
        // insert must not stop the rest of this batch.
      }

      await adminClient.functions
        .invoke('send-push-notification', {
          body: { notifications: [{ userId: item.user_id, title, body, data: { url: '/(tabs)/cart' } }] },
        })
        .catch(() => {});

      if (renter?.email && resendApiKey) {
        await sendResendEmail(resendApiKey, {
          from: 'WopeCar <bookings@wopecar.com>',
          to: [renter.email],
          subject: `${carName} is waiting in your cart`,
          html: buildEmailHtml({
            heading: 'Complete your booking',
            intro: `${carName} is still sitting in your WopeCar cart. Book now before it's gone.`,
            ctaHref: 'wopecar://cart',
            ctaLabel: 'Go to Cart',
          }),
        }).catch(() => {});
      }

      await adminClient.from('cart_items').update({ reminder_sent_at: new Date().toISOString() }).eq('id', item.id);
      notified++;
    }

    return jsonResponse({ success: true, checked: (items ?? []).length, notified });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
