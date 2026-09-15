// Supabase Edge Function - notifies WopeCar support AND confirms to the
// requester by email as soon as an airport_pickup_requests row is created.
// Called by the public website's /airport-pickup form (AirportPickupForm.tsx)
// right after its own anon insert.
//
// Same trust model as send-inquiry-notification: the caller is an
// anonymous website visitor with no Supabase Auth session, so verify_jwt
// is off. The only client input trusted is requestId - every field that
// ends up in either email is re-read from the row itself via service_role.
//
// Two emails, not one - this is the real difference from send-inquiry-
// notification. The mockup this page was built from faked a client-side
// "success" screen with a random reference number and claimed "you'll be
// matched with a driver... expect confirmation by email" - this function
// is what actually keeps that promise: the requester gets a real
// confirmation with their real (server-persisted) booking reference, and
// support gets notified to actually assign a driver. Either email failing
// is independent and best-effort - a requester-email failure shouldn't
// stop support from being notified, and vice versa.
//
// notified_at (see migration 0098) makes this idempotent, same as
// booking_inquiries' notified_at.
//
// Deploy with: supabase functions deploy send-airport-pickup-notification --no-verify-jwt
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

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function formatDate(dateOnly: string) {
  return new Date(`${dateOnly}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
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
function buildEmailHtml({ request, heading, intro, rows, ctaHref, ctaLabel }: any) {
  const body = `
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:20px;">
          <h1 style="font-size:18px;color:#154B59;margin:0 0 4px;">${escapeHtml(heading)}</h1>
          <p style="font-size:13px;color:#666666;margin:0;">${escapeHtml(intro)}</p>
        </div>

        <div style="background:#f5f5f5;border-radius:12px;padding:16px;margin-bottom:16px;text-align:center;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:#5b6b6c;">Booking reference</div>
          <div style="font-size:20px;font-weight:bold;color:#154B59;letter-spacing:0.02em;">${escapeHtml(request.booking_ref)}</div>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
          ${rows.map(([label, value]: [string, string]) => `<tr><td style="padding:6px 0;color:#5b6b6c;">${escapeHtml(label)}</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(value)}</td></tr>`).join('')}
        </table>

        ${request.notes ? `
        <div style="border-top:1px solid #e5e5e5;padding-top:12px;margin-bottom:8px;">
          <div style="font-size:13px;font-weight:bold;color:#154B59;margin-bottom:6px;">Special requests</div>
          <p style="font-size:14px;color:#333333;white-space:pre-wrap;margin:0;">${escapeHtml(request.notes)}</p>
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
    const { requestId } = await req.json();
    if (!requestId) {
      return jsonResponse({ error: 'requestId is required.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: request, error: requestError } = await adminClient
      .from('airport_pickup_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();
    if (requestError || !request) {
      return jsonResponse({ error: 'Request not found.' }, 404);
    }

    if (request.notified_at) {
      return jsonResponse({ success: true, alreadyNotified: true });
    }

    if (!resendApiKey) {
      return jsonResponse({ error: 'RESEND_API_KEY is not configured for this project.' }, 500);
    }

    const rows: [string, string][] = [
      ['Airport', request.airport_name],
      ['Flight', request.flight_number.toUpperCase()],
      ['Arrival', `${formatDate(request.arrival_date)} · ${request.arrival_time}`],
      ['Passengers', String(request.passengers)],
      ['Drop-off', request.dropoff_destination],
    ];

    let requesterEmailError: string | null = null;
    let adminEmailError: string | null = null;

    try {
      await sendResendEmail(resendApiKey, {
        from: 'WopeCar <bookings@wopecar.com>',
        to: [request.email],
        subject: `Airport pickup request received - ${request.booking_ref}`,
        html: buildEmailHtml({
          request,
          heading: 'Pickup request received!',
          intro: "We're matching you with a driver now - expect a confirmation email once a driver is assigned.",
          rows,
          ctaHref: 'https://wopecar.com/support',
          ctaLabel: 'Need to change something? Contact us',
        }),
      });
    } catch (e) {
      requesterEmailError = e instanceof Error ? e.message : 'Unknown error sending requester confirmation.';
    }

    const { data: supportSetting } = await adminClient.from('app_settings').select('value').eq('key', 'support_email').maybeSingle();
    const supportEmail = typeof supportSetting?.value === 'string' ? supportSetting.value : null;

    if (supportEmail) {
      try {
        await sendResendEmail(resendApiKey, {
          from: 'WopeCar <bookings@wopecar.com>',
          to: [supportEmail],
          subject: `New airport pickup request - ${request.booking_ref}`,
          html: buildEmailHtml({
            request,
            heading: 'New Airport Pickup Request',
            intro: `Submitted from the website by ${request.full_name} (${request.email}, ${request.phone}).`,
            rows,
            ctaHref: 'https://admin.wopecar.com/bookings/airport-pickups',
            ctaLabel: 'View in Admin Dashboard',
          }),
        });
      } catch (e) {
        adminEmailError = e instanceof Error ? e.message : 'Unknown error sending admin notification.';
      }
    } else {
      adminEmailError = 'No support_email configured in app_settings.';
    }

    // Mark as notified even on a best-effort failure, same reasoning as
    // send-inquiry-notification - a transient Resend error must not turn
    // into a retry loop that double-emails the requester.
    await adminClient.from('airport_pickup_requests').update({ notified_at: new Date().toISOString() }).eq('id', requestId);

    return jsonResponse({ success: true, requesterEmailError, adminEmailError });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
