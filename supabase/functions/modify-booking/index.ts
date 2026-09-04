// Supabase Edge Function - the single, authoritative "extend/modify an
// existing booking" write path (mirrors cancel-booking's shape and
// reasoning). Before this existed, app/booking/[id].js's modify flow only
// ever patched local device storage (BookingsContext.updateBooking) - a
// real Paystack charge for the date-extension difference would succeed,
// but the bookings row itself was never touched, so the change silently
// reverted on the very next refreshBookings() (Supabase rows are treated
// as authoritative there) and never appeared in the renter's own history,
// the web admin panel, or the in-app admin surface, all three of which
// read the same live bookings row directly.
//
// Renters may only modify their OWN booking, and only while it's still
// 'pending' or 'confirmed' (not 'cancelled'/'completed') - same status
// gate cancel-booking uses. Admin/support may modify any booking.
//
// Money flow: the client has already run a REAL, server-verified Paystack
// charge (services/paystackCheckout.js's payWithPaystack, which itself
// calls paystack-verify) for the price difference before ever calling this
// function - so by the time we get here, `paystackReference` is a genuine
// successful transaction. This function independently re-verifies that
// reference against Paystack directly (never trusts a client-supplied
// amount on its own) before writing anything, closing the gap where a
// tampered client could otherwise claim an arbitrary amountCharged.
//
// A durable booking_modifications row is written alongside the bookings
// update itself (old vs new dates/locations/cost, amount charged, the
// modification's own payment reference) - this is what feeds both the
// renter's "Trip Changes" history section and this email's breakdown.
// bookings.payment_ref is left untouched (it's the ORIGINAL checkout
// transaction); the modification's own reference only lives on the
// booking_modifications row.
//
// vendor_payout_per_day/vendor_payout_total/wopecar_margin are normally
// stamped by the compute_booking_vendor_payout trigger, but that trigger
// only fires BEFORE INSERT, not BEFORE UPDATE - so this function
// recomputes them itself using the exact same formula, otherwise an
// extended booking would keep stale payout/margin figures forever.
//
// Deploy with: supabase functions deploy modify-booking
// Reuses PAYSTACK_SECRET_KEY and RESEND_API_KEY, same as the other
// payment/email functions.

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
function changeRowsHtml(mod: any) {
  const dateChanged = mod.old_start_date !== mod.new_start_date || mod.old_end_date !== mod.new_end_date
    || mod.old_pickup_time !== mod.new_pickup_time || mod.old_return_time !== mod.new_return_time;
  const locationChanged = mod.old_pickup_location !== mod.new_pickup_location || mod.old_return_location !== mod.new_return_location;

  const row = (label: string, oldVal: string, newVal: string) => `
    <tr>
      <td style="padding:6px 0;color:#5b6b6c;">${escapeHtml(label)}</td>
      <td style="padding:6px 0;text-align:right;">
        <div style="color:#999999;text-decoration:line-through;font-size:12px;">${escapeHtml(oldVal)}</div>
        <div style="color:#154B59;font-weight:bold;">${escapeHtml(newVal)}</div>
      </td>
    </tr>`;

  let rows = '';
  if (dateChanged) {
    rows += row('Pickup', `${formatDate(mod.old_start_date)} · ${mod.old_pickup_time || ''}`, `${formatDate(mod.new_start_date)} · ${mod.new_pickup_time || ''}`);
    rows += row('Return', `${formatDate(mod.old_end_date)} · ${mod.old_return_time || ''}`, `${formatDate(mod.new_end_date)} · ${mod.new_return_time || ''}`);
  }
  if (locationChanged) {
    rows += row('Delivery location', mod.old_pickup_location || '—', mod.new_pickup_location || '—');
    rows += row('Pickup location', mod.old_return_location || '—', mod.new_return_location || '—');
  }

  return `<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">${rows}</table>`;
}

// Line-item breakdown of what actually makes up the new total (and, by
// difference, the amount charged/credited) - a lump "Total: X -> Y" alone
// doesn't explain WHY, since a date extension moves more than one cost
// component at once: rental cost and WopeCare cost both scale with day
// count, and security deposit can jump to a different tier once the
// subtotal crosses its threshold, while delivery fee is normally flat.
// Each line only renders if it actually changed, so an unaffected
// component (e.g. delivery fee on a same-location extension) doesn't
// clutter the email with a redundant "same -> same" row.
// deno-lint-ignore no-explicit-any
function costBreakdownHtml(mod: any) {
  const row = (label: string, oldVal: number, newVal: number) => `
    <tr>
      <td style="padding:6px 0;color:#5b6b6c;">${escapeHtml(label)}</td>
      <td style="padding:6px 0;text-align:right;">
        <div style="color:#999999;text-decoration:line-through;font-size:12px;">${formatCurrency(oldVal)}</div>
        <div style="color:#154B59;font-weight:bold;">${formatCurrency(newVal)}</div>
      </td>
    </tr>`;

  let rows = '';
  if (Number(mod.old_rental_cost) !== Number(mod.new_rental_cost)) {
    rows += row('Rental', mod.old_rental_cost, mod.new_rental_cost);
  }
  if (Number(mod.old_wopecare_total_cost) !== Number(mod.new_wopecare_total_cost) && (Number(mod.old_wopecare_total_cost) > 0 || Number(mod.new_wopecare_total_cost) > 0)) {
    rows += row('WopeCare', mod.old_wopecare_total_cost, mod.new_wopecare_total_cost);
  }
  if (Number(mod.old_with_driver_total_cost) !== Number(mod.new_with_driver_total_cost) && (Number(mod.old_with_driver_total_cost) > 0 || Number(mod.new_with_driver_total_cost) > 0)) {
    rows += row('With Driver', mod.old_with_driver_total_cost, mod.new_with_driver_total_cost);
  }
  if (Number(mod.old_delivery_fee) !== Number(mod.new_delivery_fee)) {
    rows += row('Delivery fee', mod.old_delivery_fee, mod.new_delivery_fee);
  }
  if (Number(mod.old_security_deposit) !== Number(mod.new_security_deposit)) {
    rows += row('Security deposit', mod.old_security_deposit, mod.new_security_deposit);
  }
  rows += `
    <tr>
      <td style="padding:10px 0 0;font-weight:bold;color:#154B59;border-top:1px solid #e5e5e5;">Total cost</td>
      <td style="padding:10px 0 0;text-align:right;font-weight:bold;color:#154B59;border-top:1px solid #e5e5e5;">
        <div style="color:#999999;text-decoration:line-through;font-weight:400;font-size:12px;">${formatCurrency(mod.old_total_cost)}</div>
        ${formatCurrency(mod.new_total_cost)}
      </td>
    </tr>`;

  return `<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">${rows}</table>`;
}

// deno-lint-ignore no-explicit-any
function buildClientEmailHtml({ booking, car, mod }: any) {
  const amountLine = mod.amount_charged > 0
    ? `<div style="background:#EAF7F0;border-radius:12px;padding:14px 16px;font-size:13px;color:#1F7A4D;margin-bottom:16px;"><strong>${formatCurrency(mod.amount_charged)}</strong> was charged to cover this change.</div>`
    : mod.amount_charged < 0
      ? `<div style="background:#FDF3E7;border-radius:12px;padding:14px 16px;font-size:13px;color:#975125;margin-bottom:16px;">This change lowers your total by <strong>${formatCurrency(Math.abs(mod.amount_charged))}</strong> - our team will follow up about a refund for the difference.</div>`
      : '';
  const body = `
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="width:56px;height:56px;border-radius:28px;background:#E1F5F5;display:inline-block;text-align:center;font-size:28px;line-height:56px;">&#128260;</div>
          <h1 style="font-size:20px;color:#154B59;margin:16px 0 4px;">Booking Updated</h1>
          <p style="font-size:14px;color:#666666;margin:0;">Your booking for ${escapeHtml(car?.name ?? 'this car')} (${escapeHtml(booking.booking_ref)}) has been updated.</p>
        </div>
        ${changeRowsHtml(mod)}
        <div style="font-size:13px;font-weight:bold;color:#154B59;margin-bottom:6px;">Cost breakdown</div>
        ${costBreakdownHtml(mod)}
        ${amountLine}
      </div>
      <div style="background:#f5f5f5;padding:16px 24px;text-align:center;">
        <p style="font-size:12px;color:#999999;margin:0;">Questions about this change? Reply to this email or message support in the app.</p>
      </div>`;
  return emailShell(body);
}

// deno-lint-ignore no-explicit-any
function buildAdminEmailHtml({ booking, car, renter, mod, modifiedBy }: any) {
  const body = `
      <div style="padding:28px 24px;">
        <div style="text-align:center;margin-bottom:20px;">
          <h1 style="font-size:18px;color:#154B59;margin:0 0 4px;">Booking Modified</h1>
          <p style="font-size:13px;color:#666666;margin:0;">Booking ${escapeHtml(booking.booking_ref)} &middot; modified by ${escapeHtml(modifiedBy)}</p>
        </div>
        <div style="background:#f5f5f5;border-radius:12px;padding:16px;margin-bottom:16px;">
          <div style="font-size:16px;font-weight:bold;color:#154B59;margin-bottom:2px;">${escapeHtml(car?.name ?? 'Car')}</div>
          <div style="font-size:13px;color:#666666;">${escapeHtml(renter?.full_name || 'N/A')} &middot; ${escapeHtml(renter?.email || 'N/A')}</div>
        </div>
        ${changeRowsHtml(mod)}
        <div style="font-size:13px;font-weight:bold;color:#154B59;margin-bottom:6px;">Cost breakdown</div>
        ${costBreakdownHtml(mod)}
        <table style="width:100%;border-collapse:collapse;font-size:14px;border-top:1px solid #e5e5e5;padding-top:8px;">
          <tr><td style="padding:6px 0;color:#5b6b6c;">Amount ${mod.amount_charged >= 0 ? 'charged' : 'credited'}</td><td style="padding:6px 0;text-align:right;color:#154B59;">${formatCurrency(Math.abs(mod.amount_charged))}</td></tr>
        </table>
      </div>`;
  return emailShell(body);
}

async function sendResendEmail(resendApiKey: string, payload: Record<string, unknown>) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
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

    const {
      bookingId, startDate, endDate, pickupTime, returnTime, pickupLocation, returnLocation,
      rentalCost, addonsCost, deliveryFee, securityDeposit, totalCost, billableDays,
      wopecareTotalCost, withDriverTotalCost, paystackReference, amountCharged,
    } = await req.json();

    if (!bookingId || !startDate || !endDate || totalCost == null) {
      return jsonResponse({ error: 'bookingId, startDate, endDate, and totalCost are required.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY');
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller }, error: getUserError } = await callerClient.auth.getUser();
    if (getUserError || !caller) {
      return jsonResponse({ error: 'Invalid or expired session.' }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile } = await adminClient.from('users').select('role, is_support').eq('id', caller.id).maybeSingle();
    const isAdmin = callerProfile?.role === 'admin' || !!callerProfile?.is_support;

    const { data: booking, error: bookingError } = await adminClient
      .from('bookings')
      .select('*, cars(name, payout_per_day), renter:renter_id(id, full_name, email)')
      .eq('id', bookingId)
      .single();
    if (bookingError || !booking) {
      return jsonResponse({ error: 'Booking not found.' }, 404);
    }

    const isOwner = booking.renter_id === caller.id;
    if (!isAdmin && !isOwner) {
      return jsonResponse({ error: 'Not authorized to modify this booking.' }, 403);
    }
    if (booking.status === 'cancelled' || booking.status === 'completed') {
      return jsonResponse({ error: `This booking is already ${booking.status} and can no longer be modified.` }, 400);
    }

    // A real amount was already charged client-side (payWithPaystack already
    // verified it once) - re-verify independently here so this function
    // never trusts a client-supplied amountCharged on its own before
    // writing anything.
    if (paystackReference) {
      if (!paystackSecretKey) {
        return jsonResponse({ error: 'Payments are not configured for this project.' }, 500);
      }
      const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(paystackReference)}`, {
        headers: { Authorization: `Bearer ${paystackSecretKey}` },
      });
      const paystackJson = await paystackRes.json();
      if (!paystackRes.ok || !paystackJson.status || paystackJson.data?.status !== 'success') {
        return jsonResponse({ error: 'Could not verify this payment with Paystack.' }, 402);
      }
      const verifiedAmount = Number(paystackJson.data.amount) / 100;
      const claimedAmount = Number(amountCharged ?? 0);
      if (Math.abs(verifiedAmount - claimedAmount) > 0.5) {
        return jsonResponse({ error: 'The verified payment amount does not match this change.' }, 402);
      }
    }

    const newBillableDays = Number(billableDays ?? 0);
    const payoutPerDay = Number(booking.cars?.payout_per_day ?? 0);
    const vendorPayoutTotal = Math.round(payoutPerDay * Math.max(newBillableDays, 0) * 100) / 100;
    const newTotalCost = Number(totalCost);
    const wopecarMargin = Math.round((newTotalCost - vendorPayoutTotal) * 100) / 100;

    const updatePatch: Record<string, unknown> = {
      start_date: startDate,
      end_date: endDate,
      pickup_time: pickupTime ?? null,
      return_time: returnTime ?? null,
      pickup_location: pickupLocation ?? null,
      return_location: returnLocation ?? null,
      rental_cost: Number(rentalCost ?? booking.rental_cost),
      addons_cost: Number(addonsCost ?? booking.addons_cost),
      delivery_fee: Number(deliveryFee ?? booking.delivery_fee),
      security_deposit: Number(securityDeposit ?? booking.security_deposit),
      total_cost: newTotalCost,
      billable_days: newBillableDays,
      vendor_payout_per_day: payoutPerDay,
      vendor_payout_total: vendorPayoutTotal,
      wopecar_margin: wopecarMargin,
    };
    if (wopecareTotalCost != null) {
      updatePatch.wopecare_total_cost = Number(wopecareTotalCost);
    }
    if (withDriverTotalCost != null) {
      updatePatch.with_driver_total_cost = Number(withDriverTotalCost);
    }

    const { error: updateError } = await adminClient.from('bookings').update(updatePatch).eq('id', bookingId);
    if (updateError) {
      return jsonResponse({ error: updateError.message }, 500);
    }

    const modRow = {
      booking_id: bookingId,
      modified_by: caller.id,
      old_start_date: booking.start_date,
      old_end_date: booking.end_date,
      old_pickup_time: booking.pickup_time,
      old_return_time: booking.return_time,
      old_pickup_location: booking.pickup_location,
      old_return_location: booking.return_location,
      old_rental_cost: booking.rental_cost,
      old_addons_cost: booking.addons_cost,
      old_delivery_fee: booking.delivery_fee,
      old_security_deposit: booking.security_deposit,
      old_wopecare_total_cost: booking.wopecare_total_cost ?? 0,
      old_with_driver_total_cost: booking.with_driver_total_cost ?? 0,
      old_total_cost: booking.total_cost,
      new_start_date: startDate,
      new_end_date: endDate,
      new_pickup_time: pickupTime ?? null,
      new_return_time: returnTime ?? null,
      new_pickup_location: pickupLocation ?? null,
      new_return_location: returnLocation ?? null,
      new_rental_cost: Number(rentalCost ?? booking.rental_cost),
      new_addons_cost: Number(addonsCost ?? booking.addons_cost),
      new_delivery_fee: Number(deliveryFee ?? booking.delivery_fee),
      new_security_deposit: Number(securityDeposit ?? booking.security_deposit),
      new_wopecare_total_cost: wopecareTotalCost != null ? Number(wopecareTotalCost) : (booking.wopecare_total_cost ?? 0),
      new_with_driver_total_cost: withDriverTotalCost != null ? Number(withDriverTotalCost) : (booking.with_driver_total_cost ?? 0),
      new_total_cost: newTotalCost,
      amount_charged: Number(amountCharged ?? (newTotalCost - Number(booking.total_cost))),
      payment_ref: paystackReference ?? null,
    };
    const { data: insertedMod, error: modError } = await adminClient
      .from('booking_modifications')
      .insert(modRow)
      .select()
      .single();
    if (modError) {
      // The booking write already succeeded - a failure recording the audit
      // row must not be reported as the whole operation having failed.
      console.error('booking_modifications insert failed:', modError);
    }
    const mod = insertedMod ?? modRow;

    const modifiedBy = isOwner ? 'the client' : 'admin/support';
    const breakdownBody = `Booking ${booking.booking_ref}: `
      + `${formatDate(mod.old_start_date)} → ${formatDate(mod.old_end_date)} is now ${formatDate(mod.new_start_date)} → ${formatDate(mod.new_end_date)}. `
      + `Total ${formatCurrency(mod.old_total_cost)} → ${formatCurrency(mod.new_total_cost)}.`;

    await adminClient.from('notifications').insert({
      user_id: booking.renter_id,
      type: 'booking_modified',
      title: 'Booking updated',
      body: breakdownBody,
      booking_id: booking.id,
    });

    const pushNotifications = [{ userId: booking.renter_id, title: 'Booking updated', body: breakdownBody }];

    if (pushNotifications.length) {
      await adminClient.functions.invoke('send-push-notification', { body: { notifications: pushNotifications } }).catch(() => {});
    }

    if (resendApiKey) {
      const [{ data: supportSetting }] = await Promise.all([
        adminClient.from('app_settings').select('value').eq('key', 'support_email').maybeSingle(),
      ]);
      const supportEmail = typeof supportSetting?.value === 'string' ? supportSetting.value : null;

      const sends: Promise<void>[] = [];
      if (booking.renter?.email) {
        sends.push(sendResendEmail(resendApiKey, {
          from: 'WopeCar <bookings@wopecar.com>',
          to: [booking.renter.email],
          subject: `Booking Updated - ${booking.cars?.name ?? 'Your Car'}`,
          html: buildClientEmailHtml({ booking, car: booking.cars, mod }),
        }));
      }
      if (supportEmail) {
        sends.push(sendResendEmail(resendApiKey, {
          from: 'WopeCar <bookings@wopecar.com>',
          to: [supportEmail],
          subject: `Booking Modified - ${booking.booking_ref}`,
          html: buildAdminEmailHtml({ booking, car: booking.cars, renter: booking.renter, mod, modifiedBy }),
        }));
      }
      await Promise.allSettled(sends);
    }

    return jsonResponse({ success: true, modification: mod });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
