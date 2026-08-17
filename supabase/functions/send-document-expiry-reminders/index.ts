// Supabase Edge Function - scans every car's roadworthy/insurance compliance
// document for two transitions (entering the 30-day expiring-soon window,
// then actually expiring) and emails BOTH the vendor and WopeCar support
// (support@wopecar.com by default, via app_settings.support_email) the
// moment each transition happens. Also drops an in-app notification for the
// vendor, matching the notifications-insert convention used everywhere else
// in this project (see setVendorDocumentStatus in wopecar-admin's
// lib/api/documents.ts).
//
// Fired daily by a pg_cron job (see migration
// 0061_add_document_expiry_reminders.sql), not by client code - a document
// can silently drift into "expiring soon" or "expired" with nobody looking
// at the admin panel that day, so this can't be a client-triggered check the
// way every other notification function in this project is.
//
// expiry_notice_stage (added in the same migration) is what keeps this from
// re-sending the same email every single day for the whole 30-day window:
// each row only gets ONE "expiring soon" email and ONE "expired" email per
// expiry date. It resets to null whenever the expiry date itself changes
// (a renewal - see wopecar-admin's updateCarDocumentExpiry) or a fresh doc
// is uploaded (a new row, so it starts null anyway), so the next expiry
// cycle notifies again.
//
// Deploy with: supabase functions deploy send-document-expiry-reminders --no-verify-jwt
// Reuses the same RESEND_API_KEY secret as every other email function here.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WARNING_WINDOW_DAYS = 30;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// null = not yet in the reminder window at all.
function computeStage(expiresAt: string): 'expiring_soon' | 'expired' | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${expiresAt}T00:00:00`);
  if (expiry < today) return 'expired';
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + WARNING_WINDOW_DAYS);
  if (expiry <= windowEnd) return 'expiring_soon';
  return null;
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
  ctaHref?: string;
  ctaLabel?: string;
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

        ${
          ctaHref
            ? `<div style="text-align:center;margin-top:20px;">
          <a href="${ctaHref}" style="display:inline-block;background:#154B59;color:#ffffff;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:10px;text-decoration:none;">${escapeHtml(ctaLabel)}</a>
        </div>`
            : ''
        }
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

type DocRow = {
  id: string;
  type: 'roadworthy' | 'insurance';
  expires_at: string;
  expiry_notice_stage: string | null;
  car_id: string;
  created_at: string;
  car: {
    name: string;
    vendor: {
      business_name: string | null;
      user_id: string | null;
      owner: { email: string | null; full_name: string | null } | null;
    } | null;
  } | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return jsonResponse({ error: 'RESEND_API_KEY is not configured for this project.' }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await adminClient
      .from('documents')
      .select(
        'id, type, expires_at, expiry_notice_stage, car_id, created_at, car:cars(name, vendor:vendors(business_name, user_id, owner:users!vendors_user_id_fkey(email, full_name)))'
      )
      .in('type', ['roadworthy', 'insurance'])
      .not('car_id', 'is', null)
      .not('expires_at', 'is', null)
      .order('created_at', { ascending: false });
    if (error) throw error;

    // "Latest wins" per (car_id, type) - same rule every other reader of
    // this table (getCarDocuments, fetchCarAvailability, etc.) already uses.
    const latest = new Map<string, DocRow>();
    for (const row of (data ?? []) as unknown as DocRow[]) {
      const key = `${row.car_id}:${row.type}`;
      if (!latest.has(key)) latest.set(key, row);
    }

    const { data: supportSetting } = await adminClient.from('app_settings').select('value').eq('key', 'support_email').maybeSingle();
    const supportEmail = typeof supportSetting?.value === 'string' && supportSetting.value ? supportSetting.value : 'support@wopecar.com';

    let notified = 0;
    for (const doc of latest.values()) {
      const stage = computeStage(doc.expires_at);
      if (!stage || stage === doc.expiry_notice_stage) continue; // no transition since last run

      const car = doc.car;
      const vendor = car?.vendor;
      const owner = vendor?.owner;
      const carName = car?.name ?? 'Unknown car';
      const docLabel = doc.type === 'roadworthy' ? 'Roadworthy Certificate' : 'Insurance Document';
      const expiredWord = stage === 'expired' ? 'expired' : 'expiring soon';

      if (owner?.email) {
        await sendResendEmail(resendApiKey, {
          from: 'WopeCar <bookings@wopecar.com>',
          to: [owner.email],
          subject: `${docLabel} ${expiredWord} - ${carName}`,
          html: buildEmailHtml({
            heading: stage === 'expired' ? 'A document has expired' : 'A document is expiring soon',
            intro: `Please send WopeCar support a renewed copy so we can update your listing.`,
            rows: [
              ['Car', carName],
              ['Document', docLabel],
              [stage === 'expired' ? 'Expired on' : 'Expires on', formatDate(doc.expires_at)],
            ],
          }),
        }).catch(() => {});

        if (vendor?.user_id) {
          await adminClient
            .from('notifications')
            .insert({
              user_id: vendor.user_id,
              type: stage === 'expired' ? 'car_document_expired' : 'car_document_expiring_soon',
              title: stage === 'expired' ? 'A document has expired' : 'A document is expiring soon',
              body: `Your ${docLabel} for ${carName} ${stage === 'expired' ? 'expired' : 'expires'} on ${formatDate(doc.expires_at)}.`,
            })
            .catch(() => {});
        }
      }

      await sendResendEmail(resendApiKey, {
        from: 'WopeCar <bookings@wopecar.com>',
        to: [supportEmail],
        subject: `Document ${expiredWord} - ${carName}`,
        html: buildEmailHtml({
          heading: stage === 'expired' ? 'Vendor document expired' : 'Vendor document expiring soon',
          intro: 'Follow up with the vendor for a renewed copy.',
          rows: [
            ['Car', carName],
            ['Vendor', vendor?.business_name || 'Unknown vendor'],
            ['Document', docLabel],
            [stage === 'expired' ? 'Expired on' : 'Expires on', formatDate(doc.expires_at)],
          ],
          ctaHref: 'https://admin.wopecar.com/fleet',
          ctaLabel: 'View Fleet',
        }),
      }).catch(() => {});

      await adminClient.from('documents').update({ expiry_notice_stage: stage }).eq('id', doc.id);
      notified++;
    }

    return jsonResponse({ success: true, checked: latest.size, notified });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
