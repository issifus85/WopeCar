// Supabase Edge Function - notifies renter, vendor, and admin/support when a
// booking is cancelled. Callable by whichever of the three actually
// initiated the cancellation (renter self-cancel, admin panel cancel - a
// vendor-initiated cancel path doesn't exist yet, but is allowed for here
// too since it's a legitimate case). Same security pattern as the other
// booking emails: identify the caller from their own JWT, then use
// service_role for the read + outbound email calls.
//
// The vendor's copy deliberately excludes the client's contact info
// (email/phone) - only their first name and the booking's own details,
// matching send-booking-request-vendor's same restriction.
//
// Deploy with: supabase functions deploy send-booking-cancelled
// Reuses the same RESEND_API_KEY secret as the other booking emails.

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

function formatCurrency(amount: number | null | undefined) {
  return `GHS ${Number(amount ?? 0).toFixed(2)}`;
}

function formatDate(dateStr: string) {
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
function bookingRowsHtml(booking: any) {
  return `
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
      <tr><td style="padding:6px 0;color:#5b6b6c;">Pickup</td><td style="padding:6px 0;text-align:right;color:#154B59;">${formatDate(booking.start_date)} &middot; ${escapeHtml(booking.pickup_time)}</td></tr>
      <tr><td style="padding:6px 0;color:#5b6b6c;">Return</td><td style="padding:6px 0;text-align:right;color:#154B59;">${formatDate(booking.end_date)} &middot; ${escapeHtml(booking.return_time)}</td></tr>
      <tr><td style="padding:6px 0;color:#5b6b6c;">Booking ref</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(booking.booking_ref)}</td></tr>
    </table>`;
}

// deno-lint-ignore no-explicit-any
function buildClientEmailHtml({ booking, car, reason }: any) {
  const body = `
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="width:56px;height:56px;border-radius:28px;background:#FDECEC;display:inline-block;text-align:center;font-size:28px;line-height:56px;">&#10060;</div>
          <h1 style="font-size:20px;color:#154B59;margin:16px 0 4px;">Booking Cancelled</h1>
          <p style="font-size:14px;color:#666666;margin:0;">Your booking for ${escapeHtml(car?.name ?? 'this car')} has been cancelled.</p>
        </div>
        ${bookingRowsHtml(booking)}
        ${reason ? `<div style="background:#f5f5f5;border-radius:12px;padding:14px 16px;font-size:13px;color:#5b6b6c;margin-bottom:8px;"><strong style="color:#154B59;">Reason:</strong> ${escapeHtml(reason)}</div>` : ''}
      </div>
      <div style="background:#f5f5f5;padding:16px 24px;text-align:center;">
        <p style="font-size:12px;color:#999999;margin:0;">Any payment already made will be refunded per our cancellation policy. Questions? Reply to this email.</p>
      </div>`;
  return emailShell(body);
}

// deno-lint-ignore no-explicit-any
function buildVendorEmailHtml({ booking, car, renterFirstName, reason }: any) {
  const body = `
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="width:56px;height:56px;border-radius:28px;background:#FDECEC;display:inline-block;text-align:center;font-size:28px;line-height:56px;">&#10060;</div>
          <h1 style="font-size:20px;color:#154B59;margin:16px 0 4px;">Booking Cancelled</h1>
          <p style="font-size:14px;color:#666666;margin:0;">${escapeHtml(car?.name ?? 'This booking')}, requested by ${escapeHtml(renterFirstName || 'the renter')}, has been cancelled.</p>
        </div>
        ${bookingRowsHtml(booking)}
        ${reason ? `<div style="background:#f5f5f5;border-radius:12px;padding:14px 16px;font-size:13px;color:#5b6b6c;margin-bottom:8px;"><strong style="color:#154B59;">Reason:</strong> ${escapeHtml(reason)}</div>` : ''}
      </div>
      <div style="background:#f5f5f5;padding:16px 24px;text-align:center;">
        <p style="font-size:12px;color:#999999;margin:0;">No action needed - this car's calendar has been freed up automatically.</p>
      </div>`;
  return emailShell(body);
}

// deno-lint-ignore no-explicit-any
function buildAdminEmailHtml({ booking, car, vendor, renter, vendorUser, reason, cancelledBy }: any) {
  const body = `
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:20px;">
          <h1 style="font-size:18px;color:#154B59;margin:0 0 4px;">Booking Cancelled</h1>
          <p style="font-size:13px;color:#666666;margin:0;">Booking ${escapeHtml(booking.booking_ref)} &middot; cancelled by ${escapeHtml(cancelledBy)}</p>
        </div>

        <div style="background:#f5f5f5;border-radius:12px;padding:16px;margin-bottom:16px;">
          <div style="font-size:16px;font-weight:bold;color:#154B59;margin-bottom:2px;">${escapeHtml(car?.name ?? 'Car')}</div>
          <div style="font-size:13px;color:#666666;">${escapeHtml(booking.drive_type)} &middot; ${escapeHtml(booking.pickup_location)} &rarr; ${escapeHtml(booking.return_location)}</div>
        </div>

        ${bookingRowsHtml(booking)}
        ${reason ? `<div style="background:#f5f5f5;border-radius:12px;padding:14px 16px;font-size:13px;color:#5b6b6c;margin-bottom:16px;"><strong style="color:#154B59;">Reason:</strong> ${escapeHtml(reason)}</div>` : ''}

        <div style="border-top:1px solid #e5e5e5;padding-top:12px;margin-bottom:16px;">
          <div style="font-size:13px;font-weight:bold;color:#154B59;margin-bottom:6px;">Client</div>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:4px 0;color:#5b6b6c;">Name</td><td style="padding:4px 0;text-align:right;color:#154B59;">${escapeHtml(renter?.full_name || 'N/A')}</td></tr>
            <tr><td style="padding:4px 0;color:#5b6b6c;">Email</td><td style="padding:4px 0;text-align:right;color:#154B59;">${escapeHtml(renter?.email || 'N/A')}</td></tr>
            <tr><td style="padding:4px 0;color:#5b6b6c;">Phone</td><td style="padding:4px 0;text-align:right;color:#154B59;">${escapeHtml(renter?.phone || 'N/A')}</td></tr>
          </table>
        </div>

        <div style="border-top:1px solid #e5e5e5;padding-top:12px;margin-bottom:16px;">
          <div style="font-size:13px;font-weight:bold;color:#154B59;margin-bottom:6px;">Vendor</div>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:4px 0;color:#5b6b6c;">Business</td><td style="padding:4px 0;text-align:right;color:#154B59;">${escapeHtml(vendor?.business_name || 'N/A')}</td></tr>
            <tr><td style="padding:4px 0;color:#5b6b6c;">Email</td><td style="padding:4px 0;text-align:right;color:#154B59;">${escapeHtml(vendorUser?.email || 'N/A')}</td></tr>
          </table>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:14px;border-top:1px solid #e5e5e5;padding-top:8px;">
          <tr><td style="padding:6px 0;color:#5b6b6c;">Total</td><td style="padding:6px 0;text-align:right;color:#154B59;">${formatCurrency(booking.total_cost)}</td></tr>
          <tr><td style="padding:6px 0;color:#5b6b6c;">Payment status</td><td style="padding:6px 0;text-align:right;color:#154B59;">${escapeHtml(booking.payment_status)}</td></tr>
        </table>
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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header.' }, 401);
    }

    const { bookingId, reason } = await req.json();
    if (!bookingId) {
      return jsonResponse({ error: 'bookingId is required.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    // Step 1: identify the caller from their own token.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: getUserError } = await callerClient.auth.getUser();
    if (getUserError || !user) {
      return jsonResponse({ error: 'Invalid or expired session.' }, 401);
    }

    // Step 2: service_role fetch - not scoped by renter_id up front (unlike
    // the other booking emails) since a legitimate caller here might be the
    // vendor or an admin instead of the renter. Ownership is checked below.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: booking, error: bookingError } = await adminClient
      .from('bookings')
      .select('*, cars(name), vendors(business_name, user_id), renter:renter_id(id, full_name, email, phone)')
      .eq('id', bookingId)
      .single();
    if (bookingError || !booking) {
      return jsonResponse({ error: 'Booking not found.' }, 404);
    }

    const { data: callerProfile } = await adminClient.from('users').select('role').eq('id', user.id).maybeSingle();

    const isRenter = booking.renter_id === user.id;
    const isVendor = booking.vendors?.user_id === user.id;
    const isAdmin = callerProfile?.role === 'admin';
    if (!isRenter && !isVendor && !isAdmin) {
      return jsonResponse({ error: 'Not authorized to notify for this booking.' }, 403);
    }

    if (!resendApiKey) {
      return jsonResponse({ error: 'RESEND_API_KEY is not configured for this project.' }, 500);
    }

    const [{ data: supportSetting }, { data: vendorUser }] = await Promise.all([
      adminClient.from('app_settings').select('value').eq('key', 'support_email').maybeSingle(),
      booking.vendors?.user_id
        ? adminClient.from('users').select('email').eq('id', booking.vendors.user_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const supportEmail = typeof supportSetting?.value === 'string' ? supportSetting.value : null;
    const renterFirstName = (booking.renter?.full_name || '').trim().split(/\s+/)[0] || null;
    const cancelledBy = isRenter ? 'the client' : isVendor ? 'the vendor' : 'admin/support';

    const sends: Promise<void>[] = [];

    if (booking.renter?.email) {
      sends.push(sendResendEmail(resendApiKey, {
        from: 'WopeCar <bookings@wopecar.com>',
        to: [booking.renter.email],
        subject: `Booking Cancelled - ${booking.cars?.name ?? 'Your Car'}`,
        html: buildClientEmailHtml({ booking, car: booking.cars, reason }),
      }));
    }

    if (vendorUser?.email) {
      sends.push(sendResendEmail(resendApiKey, {
        from: 'WopeCar <bookings@wopecar.com>',
        to: [vendorUser.email],
        subject: `Booking Cancelled - ${booking.cars?.name ?? 'Your Car'}`,
        html: buildVendorEmailHtml({ booking, car: booking.cars, renterFirstName, reason }),
      }));
    }

    if (supportEmail) {
      sends.push(sendResendEmail(resendApiKey, {
        from: 'WopeCar <bookings@wopecar.com>',
        to: [supportEmail],
        subject: `Booking Cancelled - ${booking.booking_ref}`,
        html: buildAdminEmailHtml({
          booking,
          car: booking.cars,
          vendor: booking.vendors,
          renter: booking.renter,
          vendorUser,
          reason,
          cancelledBy,
        }),
      }));
    }

    const results = await Promise.allSettled(sends);
    const failures = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    if (failures.length === results.length && results.length > 0) {
      // Every recipient failed - that's a real error worth surfacing.
      return jsonResponse({ error: failures.map((f) => String(f.reason)).join('; ') }, 502);
    }

    return jsonResponse({
      success: true,
      partialFailures: failures.length ? failures.map((f) => String(f.reason)) : null,
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
