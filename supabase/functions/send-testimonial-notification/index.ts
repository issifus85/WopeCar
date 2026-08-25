// Supabase Edge Function - notifies WopeCar support by email as soon as a
// partner submits a "Share your story" testimonial on the public website
// (components/ShareYourCarTestimonialForm.tsx). Mirrors
// send-inquiry-notification's exact pattern/reasoning:
//
// The caller is an anonymous website visitor - there is no Supabase Auth
// session on the public site, so this function can't identify "the caller
// who owns this row" from a JWT. verify_jwt is therefore off. The only
// input trusted from the client is testimonialId; every field that ends up
// in the email is re-read from the row itself via service_role, never
// taken from the request body, so a forged request body can't inject
// arbitrary email content - at most it can point at a real (or
// nonexistent) testimonial id.
//
// notified_at (migration 0090) makes this idempotent, same as
// booking_inquiries.notified_at.
//
// Deploy with: supabase functions deploy send-testimonial-notification --no-verify-jwt
// Reuses the same RESEND_API_KEY secret as every other email function.

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

// deno-lint-ignore no-explicit-any
function buildEmailHtml(testimonial: any) {
  const stars = testimonial.rating ? '★'.repeat(testimonial.rating) + '☆'.repeat(5 - testimonial.rating) : null;
  const body = `
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:20px;">
          <h1 style="font-size:18px;color:#154B59;margin:0 0 4px;">New Story Submitted</h1>
          <p style="font-size:13px;color:#666666;margin:0;">From the Share Your Car page - awaiting review before it goes live.</p>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
          <tr><td style="padding:6px 0;color:#5b6b6c;">Name</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(testimonial.author_name)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Location</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(testimonial.location || 'Not provided')}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Contact email</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(testimonial.contact_email || 'Not provided')}</td></tr>
          ${stars ? `<tr><td style="padding:6px 0;color:#5b6b6c;">Rating</td><td style="padding:6px 0;text-align:right;color:#F5A623;">${stars}</td></tr>` : ''}
        </table>

        <div style="border-top:1px solid #e5e5e5;padding-top:12px;margin-bottom:8px;">
          <div style="font-size:13px;font-weight:bold;color:#154B59;margin-bottom:6px;">Story</div>
          <p style="font-size:14px;color:#333333;white-space:pre-wrap;margin:0;">${escapeHtml(testimonial.review)}</p>
        </div>

        <div style="text-align:center;margin-top:20px;">
          <a href="https://admin.wopecar.com/content/testimonials" style="display:inline-block;background:#154B59;color:#ffffff;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:10px;text-decoration:none;">Review in Admin Dashboard</a>
        </div>
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
    const { testimonialId } = await req.json();
    if (!testimonialId) {
      return jsonResponse({ error: 'testimonialId is required.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: testimonial, error: fetchError } = await adminClient
      .from('testimonials')
      .select('*')
      .eq('id', testimonialId)
      .maybeSingle();
    if (fetchError || !testimonial) {
      return jsonResponse({ error: 'Testimonial not found.' }, 404);
    }

    if (testimonial.notified_at) {
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
          subject: `New Story Submitted - ${testimonial.author_name}`,
          html: buildEmailHtml(testimonial),
        });
      } catch (e) {
        adminEmailError = e instanceof Error ? e.message : 'Unknown error sending admin notification.';
      }
    } else {
      adminEmailError = 'No support_email configured in app_settings.';
    }

    // Mark as notified even on a best-effort failure, so a transient Resend
    // error doesn't turn into a retry loop.
    await adminClient.from('testimonials').update({ notified_at: new Date().toISOString() }).eq('id', testimonialId);

    return jsonResponse({ success: true, adminEmailError });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
