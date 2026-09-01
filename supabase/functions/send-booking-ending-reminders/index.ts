// Supabase Edge Function - scans confirmed bookings whose return date+time
// falls in the next 23-25 hours and sends a one-time "your rental ends
// soon" reminder (push + in-app notification + email) to the renter, with a
// CTA into the EXISTING Modify Booking flow (modify-booking Edge Function,
// app/booking/[id].js's "Modify Trip Details" section) so they can extend
// their return date and pay the difference exactly the way modifying a
// booking already works. Deliberately not a new/separate "extend booking"
// feature - just a nudge toward the one that already exists.
//
// Mirrors send-document-expiry-reminders' and send-vetting-appointment-
// reminders' pattern: cron-triggered (see migration
// 0093_add_booking_ending_reminders_cron.sql), no caller session, direct
// service-role notification insert, a guard column
// (bookings.extend_reminder_sent_at) so the same booking is never reminded
// twice. Hourly cadence (not daily) because end_date+return_time is a
// precise point in time, not a date-only window.
//
// end_date is a bare DATE column and return_time is a free-text 12-hour
// slot string (e.g. "9:00 AM", same shape checkout's TimeSlotPicker
// produces - see constants/pricing.js's combineDateAndTime, ported here in
// miniature). Combining them into a real timestamp needs to happen in JS,
// not SQL, so this queries every confirmed booking ending today or
// tomorrow (a cheap date-only prefilter) and does the precise 23-25h check
// per row after parsing return_time.
//
// Deploy with: supabase functions deploy send-booking-ending-reminders --no-verify-jwt
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

function formatDate(dateOnly: string) {
  return new Date(`${dateOnly}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

// Combines a 'YYYY-MM-DD' date with a "9:00 AM"-style time slot into a real
// Date, evaluated in the server's own local time - safe here specifically
// because this project's renters are all in Ghana (UTC+0, no DST), which
// numerically matches this function's UTC runtime clock. Falls back to
// midnight if return_time is missing/unparseable, same as
// constants/pricing.js's combineDateAndTime.
function combineDateAndTime(dateOnly: string, time: string | null) {
  const [y, m, d] = dateOnly.split('-').map(Number);
  const base = new Date(y, m - 1, d);
  const match = time ? /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time.trim()) : null;
  if (!match) return base;
  let hour = parseInt(match[1], 10) % 12;
  if (match[3].toUpperCase() === 'PM') hour += 12;
  base.setHours(hour, parseInt(match[2], 10), 0, 0);
  return base;
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

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    const toISODate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    // Cheap date-only prefilter (today through the day after tomorrow - the
    // 3-day span, not just today/tomorrow, is deliberate: a run late at
    // night can have a valid 23-25h-out candidate whose end_date is 2
    // calendar days away if its return_time is just after midnight). The
    // precise 23-25h check happens per row below, in JS, once return_time
    // is parsed - this prefilter only needs to not exclude anything real.
    const { data, error } = await adminClient
      .from('bookings')
      .select('id, booking_ref, renter_id, end_date, return_time, cars(name), renter:renter_id(full_name, email)')
      .eq('status', 'confirmed')
      .is('extend_reminder_sent_at', null)
      .gte('end_date', toISODate(today))
      .lte('end_date', toISODate(dayAfterTomorrow));
    if (error) throw error;

    let notified = 0;
    for (const booking of data ?? []) {
      const endsAt = combineDateAndTime(booking.end_date, booking.return_time);
      const hoursUntilEnd = (endsAt.getTime() - now.getTime()) / (60 * 60 * 1000);
      if (hoursUntilEnd < 23 || hoursUntilEnd > 25) continue;

      const car = booking.cars;
      const renter = booking.renter;
      const carName = car?.name ?? 'your car';
      const dateLabel = formatDate(booking.end_date);
      const timeLabel = booking.return_time || 'the scheduled time';
      const bookingUrl = `wopecar://booking/${booking.id}`;

      const reminderBody = `${carName} is due back ${timeLabel} on ${dateLabel}. Want more time? You can extend it right in the app.`;

      if (booking.renter_id) {
        try {
          await adminClient.from('notifications').insert({
            user_id: booking.renter_id,
            type: 'booking_ending_reminder',
            title: 'Your rental ends tomorrow',
            body: reminderBody,
            booking_id: booking.id,
          });
        } catch {
          // Best-effort, same as every other reminder cron - one failed
          // insert must not stop the rest of this batch.
        }

        // send-push-notification now accepts this service-role-authenticated
        // call as a trusted internal caller (fixed alongside this feature -
        // it previously only accepted a real logged-in admin session, so
        // every server-side push call, including this one, would have
        // 401'd). data.url is the deep-link contract
        // services/pushNotifications.js's tap handler already reads.
        await adminClient.functions
          .invoke('send-push-notification', {
            body: {
              notifications: [
                {
                  userId: booking.renter_id,
                  title: 'Your rental ends tomorrow',
                  body: reminderBody,
                  data: { url: `/booking/${booking.id}` },
                },
              ],
            },
          })
          .catch(() => {});
      }

      if (renter?.email && resendApiKey) {
        await sendResendEmail(resendApiKey, {
          from: 'WopeCar <bookings@wopecar.com>',
          to: [renter.email],
          subject: `Your ${carName} rental ends tomorrow`,
          html: buildEmailHtml({
            heading: 'Your rental ends tomorrow',
            intro: `Not ready to give up ${carName} yet? Extend your trip right from your booking - update your return date and pay the difference, same as modifying any other detail.`,
            rows: [
              ['Booking', booking.booking_ref],
              ['Car', carName],
              ['Currently due back', `${dateLabel} · ${timeLabel}`],
            ],
            ctaHref: bookingUrl,
            ctaLabel: 'Modify Booking',
          }),
        }).catch(() => {});
      }

      await adminClient.from('bookings').update({ extend_reminder_sent_at: new Date().toISOString() }).eq('id', booking.id);
      notified++;
    }

    return jsonResponse({ success: true, checked: (data ?? []).length, notified });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
