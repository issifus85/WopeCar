// Supabase Edge Function - weekly nudge for any renter whose paid,
// confirmed/completed booking is missing a required identity document,
// repeating every week until they're fully on file. Supersedes
// send-national-id-reminders (unscheduled by migration
// 0187_missing_documents_reminders_cron.sql - still deployed, just dormant),
// whose scope this is a strict superset of.
//
// Root cause this closes the loop on: checkout's "required documents" check
// only verifies a file was PICKED in browser/app state, never that it
// actually reached the server. The real upload (uploadCheckoutDocuments on
// the website, uploadBookingDocument/linkExistingBookingDocument on the app)
// is best-effort and silently swallows failures - on the website this is
// further raced against a 60s timeout before a full-page redirect to
// Paystack kills anything still in flight. users.license_verification_status
// / national_id_status both default to 'pending' and are never written by
// client code, so they look identical whether a document was never uploaded
// or is just awaiting review - only the `documents` table tells the truth.
// Real incident: bookings WC-2026-7731 and WC-2026-0058 (same renter)
// completed as paid Chauffeur trips with zero identity documents on file.
//
// Reads public.bookings_missing_documents (migration
// 0186_missing_documents_view.sql) as the single source of truth for which
// document types are actually required per booking (license_front/
// license_back/proof_of_address always; national_id only when
// booking_source = 'website' - the app never asks for it at checkout).
//
// Grouped per RENTER, not per booking - a renter with two flagged bookings
// gets exactly one email and one in-app notification, listing the union of
// whatever's missing across their bookings (documents are renter-level, not
// booking-level - one upload satisfies every booking of theirs).
//
// missing_documents_reminder_sent_at is a lookback-based guard (same idiom
// as national_id_reminder_sent_at), checked with a 6-day lookback so a
// weekly cron can't double-send within the same week but fires again the
// next.
//
// Email + in-app only, no push - matches send-national-id-reminders'
// (in-app only) and send-document-expiry-reminders' (email + in-app)
// precedents; this is deliberately not going further than either.
//
// Deploy with: supabase functions deploy send-missing-document-reminders --no-verify-jwt
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

// Matches every other email function in this project (send-document-expiry-reminders,
// modify-booking, ...) - the logo is a publicly-fetchable image, fine to load
// from either project regardless of which one sends the email.
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

function buildEmailHtml({ heading, intro, items, ctaHref, ctaLabel }: { heading: string; intro: string; items: string[]; ctaHref: string; ctaLabel: string }) {
  const body = `
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:20px;">
          <h1 style="font-size:18px;color:#154B59;margin:0 0 4px;">${escapeHtml(heading)}</h1>
          <p style="font-size:13px;color:#666666;margin:0;">${escapeHtml(intro)}</p>
        </div>
        <ul style="margin:0 0 20px;padding:0 0 0 20px;font-size:14px;color:#154B59;line-height:1.8;">
          ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
        <div style="text-align:center;">
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

const DOC_LABELS: Record<string, string> = {
  license_front: "Driver's license (front)",
  license_back: "Driver's license (back)",
  proof_of_address: 'Proof of address',
  national_id: 'Ghana Card / National ID',
};

type MissingDocRow = { renter_id: string; renter_name: string | null; renter_email: string; missing_document_types: string[] };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Internal-only (cron): reject anyone without the shared secret.
  if (!(await isTrustedInternalCaller(req))) return unauthorizedResponse();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return jsonResponse({ error: 'RESEND_API_KEY is not configured for this project.' }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Service-role client bypasses the view's is_admin() guard entirely (no auth.uid() session at all), same as every
    // other admin-client read in this codebase - the guard exists for PostgREST callers (the admin dashboard), not this.
    const { data: rows, error: viewError } = await adminClient
      .from('bookings_missing_documents')
      .select('renter_id, renter_name, renter_email, missing_document_types');
    if (viewError) throw viewError;

    // Group per renter: a renter with 2+ flagged bookings gets exactly one email/notification, the union of what's missing.
    const perRenter = new Map<string, { email: string; name: string | null; types: Set<string> }>();
    for (const row of (rows ?? []) as MissingDocRow[]) {
      const entry = perRenter.get(row.renter_id) ?? { email: row.renter_email, name: row.renter_name, types: new Set<string>() };
      (row.missing_document_types ?? []).forEach((t) => entry.types.add(t));
      perRenter.set(row.renter_id, entry);
    }

    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
    // Scoped to just the flagged renters (never the whole `users` table, which PostgREST would
    // otherwise silently cap at 1000 rows and could drop exactly the renters this run needs).
    const flaggedIds = [...perRenter.keys()];
    const eligibleIds = new Set<string>();
    if (flaggedIds.length > 0) {
      const { data: eligible, error: eligibleError } = await adminClient
        .from('users')
        .select('id')
        .in('id', flaggedIds)
        .or(`missing_documents_reminder_sent_at.is.null,missing_documents_reminder_sent_at.lt.${sixDaysAgo}`);
      if (eligibleError) throw eligibleError;
      (eligible ?? []).forEach((u) => eligibleIds.add(u.id));
    }

    let notified = 0;
    for (const [renterId, info] of perRenter) {
      if (!eligibleIds.has(renterId)) continue;
      const labels = [...info.types].map((t) => DOC_LABELS[t] ?? t);
      if (labels.length === 0) continue;

      if (info.email) {
        await sendResendEmail(resendApiKey, {
          from: 'WopeCar <bookings@wopecar.com>',
          to: [info.email],
          subject: 'Action needed: finish your WopeCar verification',
          html: buildEmailHtml({
            heading: 'Your verification is incomplete',
            intro: "We can't fully confirm your identity for your booking yet. Please upload:",
            items: labels,
            ctaHref: 'https://wopecar.com/account?tab=documents',
            ctaLabel: 'Upload Documents',
          }),
        }).catch(() => {});
      }

      try {
        await adminClient.from('notifications').insert({
          user_id: renterId,
          type: 'missing_documents_reminder',
          title: 'Finish your verification',
          body: `Upload ${labels.join(', ')} to avoid delays on your booking.`,
        });
      } catch {
        // Best-effort, same as every other reminder cron - one failed insert must not stop the rest of this batch.
      }

      await adminClient.from('users').update({ missing_documents_reminder_sent_at: new Date().toISOString() }).eq('id', renterId);
      notified++;
    }

    return jsonResponse({ success: true, flaggedRenters: perRenter.size, notified });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
