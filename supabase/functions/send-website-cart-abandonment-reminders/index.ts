// Supabase Edge Function - one-shot "you left something in your cart"
// email for the wopecar-website checkout flow. The real website cart
// (contexts/BookingCartContext.tsx over there) is device-local
// localStorage with no server row and no known email address until the
// very last step of checkout - so a plain "added to cart, closed the tab"
// visitor is not reachable by email at all. The one population that IS
// reachable is a renter (signed-in or guest) who used "Save & Pay Later"
// at checkout: that flow creates a real pending_invoices row with a real
// renter_id/email and a timestamp (see lib/data/pendingInvoices.ts on the
// website repo), even though its own 24h hold (`expires_at`) has usually
// already lapsed by day 3-5 - `resolution` stays null until the renter
// pays or explicitly discards it (voiding only happens lazily, client-
// side, when they revisit their saved-bookings list), so an unresolved
// row really does mean "still sitting there, unresolved" days later.
//
// Fires once per saved cart (grouped by cart_group_id where present, since
// "Save & Pay Later" can save several cars in one group - see migration
// 0095_pending_invoices_promo_and_cart_group.sql), 3-5 days after it was
// created, guarded by abandonment_reminder_sent_at (a plain IS NULL check,
// not a lookback - this is a one-time nudge, not a recurring one like the
// app's cart/national-id reminders).
//
// Email only - no in-app/push surface exists for a website checkout draft.
//
// Deploy with: supabase functions deploy send-website-cart-abandonment-reminders --no-verify-jwt
// Reuses the same RESEND_API_KEY secret as every other email function.
// CTA links to the interim wopecar-website.vercel.app domain, same reason
// as every other website link from a backend email right now: wopecar.com
// DNS still points at the old Laravel site (see [[email_universal_link_todo]]).

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

function buildEmailHtml({
  heading,
  intro,
  rows,
  ctaHref,
  ctaLabel,
}: {
  heading: string;
  intro: string;
  rows: [string, string][];
  ctaHref: string;
  ctaLabel: string;
}) {
  const body = `
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:20px;">
          <h1 style="font-size:18px;color:#154B59;margin:0 0 4px;">${escapeHtml(heading)}</h1>
          <p style="font-size:13px;color:#666666;margin:0;">${escapeHtml(intro)}</p>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
          ${rows
            .map(
              ([label, value]) =>
                `<tr><td style="padding:6px 0;color:#5b6b6c;">${escapeHtml(label)}</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(value)}</td></tr>`
            )
            .join('')}
        </table>
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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    const { data: rows, error } = await adminClient
      .from('pending_invoices')
      .select('id, booking_ref, car_id, cart_group_id, created_at, cars(name), renter:renter_id(email, full_name)')
      .is('resolution', null)
      .is('abandonment_reminder_sent_at', null)
      .gte('created_at', fiveDaysAgo)
      .lte('created_at', threeDaysAgo);
    if (error) throw error;

    // Group by cart_group_id (falling back to the row's own id when a
    // saved cart has no group, e.g. a single-car save) so a multi-car
    // "Save & Pay Later" cart gets one email listing every car, not one
    // email per line item.
    const groups = new Map<string, typeof rows>();
    for (const row of rows ?? []) {
      const key = row.cart_group_id ?? row.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    let notified = 0;
    for (const groupRows of groups.values()) {
      const first = groupRows[0];
      const renter = first.renter as { email?: string; full_name?: string } | null;
      const carNames = groupRows.map((r) => (r.cars as { name?: string } | null)?.name ?? 'a car');

      if (renter?.email && resendApiKey) {
        await sendResendEmail(resendApiKey, {
          from: 'WopeCar <bookings@wopecar.com>',
          to: [renter.email],
          subject: carNames.length > 1 ? 'Your saved cars are still waiting' : `${carNames[0]} is still waiting for you`,
          html: buildEmailHtml({
            heading: 'Finish your booking',
            intro: `You saved ${carNames.length > 1 ? 'these cars' : carNames[0]} for later on WopeCar but haven't completed payment yet.`,
            rows: carNames.map((name, i): [string, string] => [`Car ${i + 1}`, name]),
            ctaHref: 'https://wopecar-website.vercel.app/cart',
            ctaLabel: 'Complete Booking',
          }),
        }).catch(() => {});
      }

      for (const row of groupRows) {
        await adminClient
          .from('pending_invoices')
          .update({ abandonment_reminder_sent_at: new Date().toISOString() })
          .eq('id', row.id);
      }
      notified++;
    }

    return jsonResponse({ success: true, checked: (rows ?? []).length, groups: groups.size, notified });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
