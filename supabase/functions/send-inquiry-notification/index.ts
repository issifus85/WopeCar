// Supabase Edge Function - notifies WopeCar support by email as soon as a
// booking_inquiries row is created. Called by both the public website's
// car-detail Inquiry form (CarBookingCard.tsx) and its general contact
// form (SupportForm.tsx) right after their own anon insert.
//
// Support-only by design: vendors have no read policy on booking_inquiries
// and no in-app inbox for these, and inquiries are routed through WopeCar
// support rather than directly to the car's vendor.
//
// Unlike every other notification function in this project, the caller
// here is an anonymous website visitor - there is no Supabase Auth session
// on the public site, so this function can't identify "the caller who owns
// this row" from a JWT the way send-booking-confirmation etc. do. verify_jwt
// is therefore off for this function. The only input trusted from the
// client is the inquiryId; every field that ends up in the email is
// re-read from the row itself via service_role, never taken from the
// request body, so a forged request body can't inject arbitrary email
// content - at most it can point at a real (or nonexistent) inquiry id.
//
// The notified_at column (see migration 0048) makes this idempotent: a
// retried or duplicated call for the same id is a no-op, which also caps
// the blast radius of someone replaying a known id to spam the support
// inbox - they get at most the one real email that already fired.
//
// Deploy with: supabase functions deploy send-inquiry-notification --no-verify-jwt
// Reuses the same RESEND_API_KEY secret as every other email function here.

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

function formatDate(dateStr: string | null) {
  if (!dateStr) return 'Not specified';
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

// deno-lint-ignore no-explicit-any
function buildEmailHtml({ inquiry, car, heading, intro, ctaHref, ctaLabel }: any) {
  const body = `
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:20px;">
          <h1 style="font-size:18px;color:#154B59;margin:0 0 4px;">${escapeHtml(heading)}</h1>
          <p style="font-size:13px;color:#666666;margin:0;">${escapeHtml(intro)}</p>
        </div>

        ${car ? `
        <div style="background:#f5f5f5;border-radius:12px;padding:16px;margin-bottom:16px;">
          <div style="font-size:16px;font-weight:bold;color:#154B59;">${escapeHtml(car.name)}</div>
        </div>` : ''}

        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
          <tr><td style="padding:6px 0;color:#5b6b6c;">Name</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(inquiry.full_name)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Email</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(inquiry.email)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Phone</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(inquiry.phone || 'Not provided')}</td></tr>
          ${car ? `
          <tr><td style="padding:6px 0;color:#5b6b6c;">Trip start</td><td style="padding:6px 0;text-align:right;color:#154B59;">${formatDate(inquiry.start_date)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Trip end</td><td style="padding:6px 0;text-align:right;color:#154B59;">${formatDate(inquiry.end_date)}</td></tr>` : ''}
        </table>

        ${inquiry.message ? `
        <div style="border-top:1px solid #e5e5e5;padding-top:12px;margin-bottom:8px;">
          <div style="font-size:13px;font-weight:bold;color:#154B59;margin-bottom:6px;">Message</div>
          <p style="font-size:14px;color:#333333;white-space:pre-wrap;margin:0;">${escapeHtml(inquiry.message)}</p>
        </div>` : ''}

        ${ctaHref ? `
        <div style="text-align:center;margin-top:20px;">
          <a href="${ctaHref}" style="display:inline-block;background:#154B59;color:#ffffff;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:10px;text-decoration:none;">${escapeHtml(ctaLabel)}</a>
        </div>` : ''}
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { inquiryId } = await req.json();
    if (!inquiryId) {
      return jsonResponse({ error: 'inquiryId is required.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: inquiry, error: inquiryError } = await adminClient
      .from('booking_inquiries')
      .select('*, car:cars(name)')
      .eq('id', inquiryId)
      .maybeSingle();
    if (inquiryError || !inquiry) {
      return jsonResponse({ error: 'Inquiry not found.' }, 404);
    }

    if (inquiry.notified_at) {
      return jsonResponse({ success: true, alreadyNotified: true });
    }

    if (!resendApiKey) {
      return jsonResponse({ error: 'RESEND_API_KEY is not configured for this project.' }, 500);
    }

    const { data: supportSetting } = await adminClient.from('app_settings').select('value').eq('key', 'support_email').maybeSingle();
    const supportEmail = typeof supportSetting?.value === 'string' ? supportSetting.value : null;

    let adminEmailError: string | null = null;

    if (supportEmail) {
      try {
        await sendResendEmail(resendApiKey, {
          from: 'WopeCar <bookings@wopecar.com>',
          to: [supportEmail],
          subject: `New Inquiry - ${inquiry.car?.name ?? 'General'}`,
          html: buildEmailHtml({
            inquiry,
            car: inquiry.car,
            heading: 'New Booking Inquiry',
            intro: inquiry.car ? `Submitted from the ${inquiry.car.name} listing page.` : 'Submitted from the website contact form.',
            ctaHref: 'https://admin.wopecar.com/bookings/inquiries',
            ctaLabel: 'View in Admin Dashboard',
          }),
        });
      } catch (e) {
        adminEmailError = e instanceof Error ? e.message : 'Unknown error sending admin notification.';
      }
    } else {
      adminEmailError = 'No support_email configured in app_settings.';
    }

    // Mark as notified even on a best-effort failure, so a transient
    // Resend error doesn't turn into a retry loop. The error is still
    // returned to the caller for visibility.
    await adminClient.from('booking_inquiries').update({ notified_at: new Date().toISOString() }).eq('id', inquiryId);

    return jsonResponse({ success: true, adminEmailError });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
