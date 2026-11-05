// Supabase Edge Function - WopeDriver notifications (driver_bookings, migration 0171).
//
// Body: { driverBookingId: string, event: 'created' | 'status' | 'modified' | 'cancelled' | 'paid', paymentId? }
//
//   created - called by the app / website right after create_driver_booking(). Emails WopeCar support (with the
//             day-by-day plan) and sends the customer a "request received" email + in-app notification.
//             Only the customer who owns the request (or an admin) may trigger it. Idempotent via notified_at.
//   status  - called by wopecar-admin after changing a request's status (confirmed / declined / cancelled /
//             completed). Tells the customer by email, in-app notification and push. Admin-only. Idempotent via
//             status_notified: the customer hears about each status once.
//   modified  - the customer changed the request (modify_driver_booking). Emails support (with the new plan and what is due or
//             to refund) and the customer. Owner or admin. Idempotent via modification_notified.
//   cancelled - the customer cancelled (cancel_driver_booking). Emails support (with any refund owed) and the customer.
//             Owner or admin. Idempotent via status_notified.
//   paid      - a payment was recorded (_shared/driverPayment.ts, called with the service role). Receipt to the customer,
//             heads-up to support. Idempotent via driver_booking_payments.notified_at.
//
// Everything that ends up in an email is re-read from the database with the service role, never taken from
// the request body.
//
// Deploy with: supabase functions deploy send-driver-booking-notification
// Uses the RESEND_API_KEY secret like every other email function here.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

const money = (n: unknown) => `GH₵${Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

function dateLabel(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function timeLabel(hours: number) {
  const h = Math.floor(hours) % 24;
  const m = Math.round((hours - Math.floor(hours)) * 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function startHours(time: string) {
  const [h, m] = String(time).split(':').map(Number);
  return h + (m || 0) / 60;
}

function emailShell(bodyHtml: string) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f5f5;padding:32px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
      <div style="background:#154B59;padding:28px 24px;text-align:center;">
        <img src="https://qvactycnufaowwsiqdrz.supabase.co/functions/v1/logo-mark" alt="WopeCar" width="180" style="display:inline-block;height:auto;max-width:180px;" />
      </div>
      ${bodyHtml}
    </div>
  </div>`;
}

// deno-lint-ignore no-explicit-any
function bookingTable(b: any, days: any[]) {
  const rows = days.map((d) => {
    const start = startHours(d.start_time);
    return `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #eee;color:#154B59;">${escapeHtml(dateLabel(d.service_date))}<br/>
        <span style="font-size:12px;color:#5b6b6c;">${timeLabel(start)} – ${timeLabel(start + Number(d.hours))} · ${escapeHtml(d.zone_label ?? '')}</span></td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;color:#154B59;">${money(d.total)}</td></tr>`;
  }).join('');
  return `
    <div style="background:#f5f5f5;border-radius:12px;padding:14px 16px;margin-bottom:16px;font-size:14px;color:#154B59;">
      <div style="font-weight:bold;">${escapeHtml(b.booking_ref)} · ${b.service_type === 'rental_addon' ? 'Driver for a WopeCar rental' : 'Driver for own car'}</div>
      <div style="margin-top:4px;color:#5b6b6c;">${escapeHtml(b.car_description ?? '')}${b.car_transmission ? ` · ${escapeHtml(b.car_transmission)}` : ''}${b.car_plate ? ` · ${escapeHtml(b.car_plate)}` : ''}</div>
      <div style="margin-top:4px;color:#5b6b6c;">Meeting point: ${escapeHtml(b.meeting_point)}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px;">${rows}
      <tr><td style="padding:10px 0;font-weight:bold;color:#154B59;">Estimated total</td><td style="padding:10px 0;text-align:right;font-weight:bold;color:#154B59;">${money(b.total_cost)}</td></tr>
    </table>`;
}

async function sendResendEmail(resendApiKey: string, payload: Record<string, unknown>) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Resend error: ${await res.text()}`);
}

// deno-lint-ignore no-explicit-any
const STATUS_COPY: Record<string, { title: string; body: (b: any) => string }> = {
  confirmed: {
    title: 'Your WopeDriver is confirmed',
    body: (b) => b.assigned_driver_name
      ? `${b.assigned_driver_name}${b.assigned_driver_phone ? ` (${b.assigned_driver_phone})` : ''} will be your driver for ${b.booking_ref}.`
      : `Your driver request ${b.booking_ref} is confirmed. We'll share your driver's details before the first day.`,
  },
  declined: {
    title: 'We could not confirm your driver request',
    body: (b) => `Sorry, we don't have a driver available for ${b.booking_ref}. ${Number(b.amount_paid ?? 0) > 0 ? `We'll refund the ${money(b.amount_paid)} you paid in full.` : 'Nothing has been charged.'}`,
  },
  cancelled: {
    title: 'Driver request cancelled',
    body: (b) => `Your driver request ${b.booking_ref} has been cancelled.${b.cancel_reason ? ` Reason: ${b.cancel_reason}.` : ''}${Number(b.amount_paid ?? 0) > 0 ? ` We'll refund the ${money(b.amount_paid)} you paid.` : ''}`,
  },
  completed: {
    title: 'Thanks for riding with WopeDriver',
    body: (b) => `Your driver booking ${b.booking_ref} is complete. We hope you enjoyed the trip.`,
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const reqBody = await req.json();
    const { driverBookingId, event } = reqBody;
    if (!driverBookingId || !['created', 'status', 'modified', 'cancelled', 'paid'].includes(event)) {
      return jsonResponse({ error: 'driverBookingId and event (created | status | modified | cancelled | paid) are required.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const authHeader = req.headers.get('Authorization') ?? '';

    const admin = createClient(supabaseUrl, serviceRoleKey);
    // Server-side callers (the payment functions) use the service role key; everyone else is a signed-in user.
    const isServer = authHeader === `Bearer ${serviceRoleKey}`;
    let callerId: string | null = null;
    let callerIsAdmin = isServer;
    if (!isServer) {
      const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user: caller } } = await callerClient.auth.getUser();
      if (!caller) return jsonResponse({ error: 'Unauthorized.' }, 401);
      callerId = caller.id;
      const { data: callerProfile } = await admin.from('users').select('role').eq('id', caller.id).maybeSingle();
      callerIsAdmin = callerProfile?.role === 'admin';
    }

    const { data: booking } = await admin.from('driver_bookings').select('*').eq('id', driverBookingId).maybeSingle();
    if (!booking) return jsonResponse({ error: 'Driver booking not found.' }, 404);
    const isOwner = !!callerId && booking.user_id === callerId;
    if (['created', 'modified', 'cancelled'].includes(event) && !isOwner && !callerIsAdmin) return jsonResponse({ error: 'Unauthorized.' }, 403);
    if (event === 'status' && !callerIsAdmin) return jsonResponse({ error: 'Only an admin can send status updates.' }, 403);
    if (event === 'paid' && !isServer) return jsonResponse({ error: 'Unauthorized.' }, 403);

    const { data: days } = await admin.from('driver_booking_days').select('*').eq('driver_booking_id', booking.id).order('service_date');
    const errors: string[] = [];

    const { data: supportSetting } = await admin.from('app_settings').select('value').eq('key', 'support_email').maybeSingle();
    const supportEmail = typeof supportSetting?.value === 'string' ? supportSetting.value : null;
    const adminLink = `<div style="text-align:center;margin-top:18px;"><a href="https://admin.wopecar.com/wopedriver?id=${booking.id}" style="display:inline-block;background:#154B59;color:#fff;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:10px;text-decoration:none;">Open in Admin</a></div>`;
    const paid = Number(booking.amount_paid ?? 0);
    const total = Number(booking.total_cost ?? 0);
    const due = Math.max(0, Math.round((total - paid) * 100) / 100);
    const refundOwed = Math.max(0, Math.round((paid - total) * 100) / 100);
    const paymentLine = paid <= 0
      ? `Nothing paid yet. ${money(total)} due.`
      : due > 0 ? `Paid ${money(paid)}. ${money(due)} still due.`
      : refundOwed > 0 ? `Paid ${money(paid)}. ${money(refundOwed)} to refund.`
      : `Paid in full (${money(paid)}).`;

    // Email support + customer (best-effort; failures are reported in errors[]).
    const sendPair = async (opts: { supportSubject: string; supportHtml: string; customerSubject: string; customerHtml: string }) => {
      if (!resendApiKey) { errors.push('RESEND_API_KEY is not configured.'); return; }
      if (supportEmail) {
        try {
          await sendResendEmail(resendApiKey, { from: 'WopeCar <bookings@wopecar.com>', to: [supportEmail], reply_to: booking.contact_email || undefined, subject: opts.supportSubject, html: emailShell(opts.supportHtml) });
        } catch (e) { errors.push(e instanceof Error ? e.message : 'support email failed'); }
      } else {
        errors.push('No support_email configured in app_settings.');
      }
      if (booking.contact_email) {
        try {
          await sendResendEmail(resendApiKey, { from: 'WopeCar <bookings@wopecar.com>', to: [booking.contact_email], subject: opts.customerSubject, html: emailShell(opts.customerHtml) });
        } catch (e) { errors.push(e instanceof Error ? e.message : 'customer email failed'); }
      }
    };
    const block = (title: string, intro: string, extra = '') => `<div style="padding:24px;">
      <h1 style="font-size:18px;color:#154B59;margin:0 0 6px;">${escapeHtml(title)}</h1>
      <p style="font-size:14px;color:#444;margin:0 0 16px;">${intro}</p>
      ${bookingTable(booking, days ?? [])}
      <p style="font-size:14px;color:#154B59;margin:8px 0 0;"><b>Payment:</b> ${escapeHtml(paymentLine)}</p>
      ${extra}
    </div>`;
    const who = `${escapeHtml(booking.contact_name ?? '')} · ${escapeHtml(booking.contact_phone)} · ${escapeHtml(booking.contact_email ?? '')}`;
    const inApp = async (title: string, body: string) => {
      if (!booking.user_id) return;
      await admin.from('notifications').insert({ user_id: booking.user_id, type: 'wopedriver', title, body })
        .then(({ error }) => error && errors.push(error.message));
    };

    if (event === 'modified') {
      const count = Number(booking.modification_count ?? 0);
      if (Number(booking.modification_notified ?? 0) >= count) return jsonResponse({ success: true, alreadyNotified: true });
      await admin.from('driver_bookings').update({ modification_notified: count }).eq('id', booking.id);
      await inApp('Driver request updated', `We've got the changes to ${booking.booking_ref}. WopeCar will re-confirm your driver within 24 hours.`);
      await sendPair({
        supportSubject: `WopeDriver request changed ${booking.booking_ref} - please re-confirm`,
        supportHtml: block('WopeDriver request changed', `${who}<br/>The customer changed this request, so it is back to Requested. Please re-check driver availability and confirm.${refundOwed > 0 ? ` <b>Refund ${money(refundOwed)}</b>.` : ''}`, adminLink),
        customerSubject: `Your WopeDriver request ${booking.booking_ref} was updated`,
        customerHtml: block('Driver request updated', `We've saved your changes. WopeCar re-confirms your driver within 24 hours.${due > 0 && paid > 0 ? ` The new total is higher: please pay the ${money(due)} difference in the app.` : ''}${refundOwed > 0 ? ` The new total is lower: we'll refund ${money(refundOwed)}.` : ''}`),
      });
      return jsonResponse({ success: true, errors });
    }

    if (event === 'cancelled') {
      if (booking.status !== 'cancelled') return jsonResponse({ success: true, skipped: 'Not cancelled.' });
      if (booking.status_notified === 'cancelled') return jsonResponse({ success: true, alreadyNotified: true });
      await admin.from('driver_bookings').update({ status_notified: 'cancelled' }).eq('id', booking.id);
      await inApp('Driver request cancelled', `Your driver request ${booking.booking_ref} has been cancelled.${paid > 0 ? ` We'll refund ${money(paid)}.` : ''}`);
      await sendPair({
        supportSubject: `WopeDriver request cancelled by customer ${booking.booking_ref}${paid > 0 ? ` - refund ${money(paid)}` : ''}`,
        supportHtml: block('Customer cancelled a WopeDriver request', `${who}${booking.cancel_reason ? `<br/>Reason: ${escapeHtml(booking.cancel_reason)}` : ''}${paid > 0 ? `<br/><b>Refund ${money(paid)} through Paystack and mark it Refunded in the admin.</b>` : ''}`, adminLink),
        customerSubject: `Your WopeDriver request ${booking.booking_ref} is cancelled`,
        customerHtml: block('Driver request cancelled', `Your driver request has been cancelled.${paid > 0 ? ` We'll refund the ${money(paid)} you paid within 5 to 10 working days.` : ' Nothing was charged.'}`),
      });
      return jsonResponse({ success: true, errors });
    }

    if (event === 'paid') {
      const { paymentId } = reqBody;
      if (!paymentId) return jsonResponse({ error: 'paymentId is required.' }, 400);
      const { data: claimed } = await admin.from('driver_booking_payments').update({ notified_at: new Date().toISOString() })
        .eq('id', paymentId).eq('driver_booking_id', booking.id).is('notified_at', null).select('amount, reference');
      if (!claimed?.length) return jsonResponse({ success: true, alreadyNotified: true });
      const amount = Number(claimed[0].amount);
      await inApp('Payment received', `We received ${money(amount)} for ${booking.booking_ref}.`);
      await sendPair({
        supportSubject: `WopeDriver payment ${money(amount)} - ${booking.booking_ref}`,
        supportHtml: block('WopeDriver payment received', `${who}<br/>Paystack reference: ${escapeHtml(claimed[0].reference ?? '')}`, adminLink),
        customerSubject: `Payment received for ${booking.booking_ref}`,
        customerHtml: block('Payment received', `Thanks. We received ${money(amount)} for your WopeDriver booking${claimed[0].reference ? ` (reference ${escapeHtml(claimed[0].reference)})` : ''}. If WopeCar can't confirm a driver, you get a full refund.`),
      });
      return jsonResponse({ success: true, errors });
    }

    if (event === 'created') {
      if (booking.notified_at) return jsonResponse({ success: true, alreadyNotified: true });
      // Claim first so a double call can't email twice.
      const { data: claimed } = await admin.from('driver_bookings').update({ notified_at: new Date().toISOString() })
        .eq('id', booking.id).is('notified_at', null).select('id');
      if (!claimed?.length) return jsonResponse({ success: true, alreadyNotified: true });

      await admin.from('notifications').insert({
        user_id: booking.user_id,
        type: 'wopedriver',
        title: 'Driver request received',
        body: `We've got your WopeDriver request ${booking.booking_ref}. WopeCar confirms within 24 hours.`,
      }).then(({ error }) => error && errors.push(error.message));

      if (resendApiKey) {
        if (supportEmail) {
          try {
            await sendResendEmail(resendApiKey, {
              from: 'WopeCar <bookings@wopecar.com>',
              to: [supportEmail],
              reply_to: booking.contact_email || undefined,
              subject: `New WopeDriver request ${booking.booking_ref} - ${dateLabel(booking.first_service_date)}`,
              html: emailShell(`<div style="padding:24px;">
                <h1 style="font-size:18px;color:#154B59;margin:0 0 6px;">New WopeDriver request</h1>
                <p style="font-size:13px;color:#666;margin:0 0 16px;">${escapeHtml(booking.contact_name ?? '')} · ${escapeHtml(booking.contact_phone)} · ${escapeHtml(booking.contact_email ?? '')}</p>
                ${bookingTable(booking, days ?? [])}
                ${booking.notes ? `<p style="font-size:14px;color:#333;white-space:pre-wrap;"><b>Notes:</b> ${escapeHtml(booking.notes)}</p>` : ''}
                <div style="text-align:center;margin-top:18px;"><a href="https://admin.wopecar.com/wopedriver?id=${booking.id}" style="display:inline-block;background:#154B59;color:#fff;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:10px;text-decoration:none;">Open in Admin</a></div>
              </div>`),
            });
          } catch (e) { errors.push(e instanceof Error ? e.message : 'support email failed'); }
        } else {
          errors.push('No support_email configured in app_settings.');
        }
        if (booking.contact_email) {
          try {
            await sendResendEmail(resendApiKey, {
              from: 'WopeCar <bookings@wopecar.com>',
              to: [booking.contact_email],
              subject: `We've received your WopeDriver request ${booking.booking_ref}`,
              html: emailShell(`<div style="padding:24px;">
                <h1 style="font-size:18px;color:#154B59;margin:0 0 6px;">Driver request received</h1>
                <p style="font-size:14px;color:#444;margin:0 0 16px;">Thanks${booking.contact_name ? `, ${escapeHtml(String(booking.contact_name).split(' ')[0])}` : ''}. WopeCar confirms every request within 24 hours, subject to driver availability. We'll send your driver's details by email and in the app.</p>
                ${bookingTable(booking, days ?? [])}
              </div>`),
            });
          } catch (e) { errors.push(e instanceof Error ? e.message : 'customer email failed'); }
        }
      } else {
        errors.push('RESEND_API_KEY is not configured.');
      }
      return jsonResponse({ success: true, errors });
    }

    // event === 'status'
    const copy = STATUS_COPY[booking.status];
    if (!copy) return jsonResponse({ success: true, skipped: `No customer message for status ${booking.status}.` });
    if (booking.status_notified === booking.status) return jsonResponse({ success: true, alreadyNotified: true });
    await admin.from('driver_bookings').update({ status_notified: booking.status }).eq('id', booking.id);

    const title = copy.title;
    const body = copy.body(booking);
    if (booking.user_id) {
      await admin.from('notifications').insert({ user_id: booking.user_id, type: 'wopedriver', title, body })
        .then(({ error }) => error && errors.push(error.message));
      await admin.functions.invoke('send-push-notification', {
        body: { notifications: [{ userId: booking.user_id, title, body, data: { type: 'wopedriver', driverBookingId: booking.id } }] },
      }).catch(() => {});
    }
    if (resendApiKey && booking.contact_email) {
      try {
        await sendResendEmail(resendApiKey, {
          from: 'WopeCar <bookings@wopecar.com>',
          to: [booking.contact_email],
          subject: `${title} - ${booking.booking_ref}`,
          html: emailShell(`<div style="padding:24px;">
            <h1 style="font-size:18px;color:#154B59;margin:0 0 6px;">${escapeHtml(title)}</h1>
            <p style="font-size:14px;color:#444;margin:0 0 16px;">${escapeHtml(body)}</p>
            ${bookingTable(booking, days ?? [])}
          </div>`),
        });
      } catch (e) { errors.push(e instanceof Error ? e.message : 'customer email failed'); }
    }
    return jsonResponse({ success: true, errors });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
