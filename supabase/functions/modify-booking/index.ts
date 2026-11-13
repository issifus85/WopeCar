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

import { computeModifyPricing } from '../_shared/modifyPricing.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { combineDateAndTime } from '../_shared/time.ts';
import { isTrustedInternalCaller } from '../_shared/cronAuth.ts';

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
  const oldDest = (mod.old_addon_names ?? []).join(', ');
  const newDest = (mod.new_addon_names ?? []).join(', ');
  if (Array.isArray(mod.new_addon_names) && oldDest !== newDest) {
    rows += row('Travel destinations', oldDest || 'None', newDest || 'None');
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
  if (Number(mod.old_addons_cost ?? 0) !== Number(mod.new_addons_cost ?? 0)) {
    rows += row('Travel add-ons', mod.old_addons_cost ?? 0, mod.new_addons_cost ?? 0);
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

function promoLineHtml(promo: { code: string; discount: number } | null | undefined) {
  if (!promo) return '';
  return `<div style="background:#EAF7F0;border-radius:12px;padding:14px 16px;font-size:13px;color:#1F7A4D;margin-bottom:16px;">Promo code <strong>${escapeHtml(promo.code)}</strong> was applied with this change: <strong>-${formatCurrency(promo.discount)}</strong> (already included in the new total).</div>`;
}

// deno-lint-ignore no-explicit-any
function buildClientEmailHtml({ booking, car, mod, balanceDue, payUrl, held, promo }: any) {
  const amountLine = mod.amount_charged > 0
    ? `<div style="background:#EAF7F0;border-radius:12px;padding:14px 16px;font-size:13px;color:#1F7A4D;margin-bottom:16px;"><strong>${formatCurrency(mod.amount_charged)}</strong> was charged to cover this change.</div>`
    : mod.amount_charged < 0
      ? `<div style="background:#FDF3E7;border-radius:12px;padding:14px 16px;font-size:13px;color:#975125;margin-bottom:16px;">This change lowers your total by <strong>${formatCurrency(Math.abs(mod.amount_charged))}</strong> - our team will follow up about a refund for the difference.</div>`
      : '';
  const heldBlock = held
    ? `<div style="background:#FDF3E7;border-radius:12px;padding:14px 16px;font-size:13px;color:#975125;margin-bottom:16px;"><strong>No refund for unused days.</strong> Your trip had already started, so shortening it does not change what you paid. Unused rental days are not refunded or credited, as set out in our Terms of Service (section 5.2). Your security deposit is returned after the vehicle has been inspected.</div>`
    : '';
  const balanceBlock = balanceDue > 0
    ? `<div style="background:#FDF3E7;border-radius:12px;padding:16px;margin-bottom:16px;text-align:center;">
        <div style="font-size:13px;color:#975125;">Balance due</div>
        <div style="font-size:26px;font-weight:bold;color:#154B59;margin:4px 0 8px;">${formatCurrency(balanceDue)}</div>
        <div style="font-size:13px;color:#5b6b6c;margin-bottom:14px;">Your booking total went up with this change, and this amount has not been paid yet. Please pay it to keep your booking in good standing.</div>
        <a href="${escapeHtml(payUrl)}" style="display:inline-block;background:#154B59;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:10px;">Pay ${formatCurrency(balanceDue)} now</a>
        <div style="font-size:12px;color:#999999;margin-top:12px;">The button lets you choose: pay on the website, or open the WopeCar app on your phone. In the app, open the booking and tap Pay balance.</div>
      </div>`
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
        ${promoLineHtml(promo)}
        ${amountLine}
        ${heldBlock}
        ${balanceBlock}
      </div>
      <div style="background:#f5f5f5;padding:16px 24px;text-align:center;">
        <p style="font-size:12px;color:#999999;margin:0;">Questions about this change? Reply to this email or message support in the app.</p>
      </div>`;
  return emailShell(body);
}

// deno-lint-ignore no-explicit-any
function buildAdminEmailHtml({ booking, car, renter, mod, modifiedBy, balanceDue, promo }: any) {
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
        ${promoLineHtml(promo)}
        <table style="width:100%;border-collapse:collapse;font-size:14px;border-top:1px solid #e5e5e5;padding-top:8px;">
          <tr><td style="padding:6px 0;color:#5b6b6c;">Amount ${mod.amount_charged >= 0 ? 'charged' : 'credited'}</td><td style="padding:6px 0;text-align:right;color:#154B59;">${formatCurrency(Math.abs(mod.amount_charged))}</td></tr>
          ${balanceDue > 0 ? `<tr><td style="padding:6px 0;color:#975125;"><strong>Balance due from the client</strong></td><td style="padding:6px 0;text-align:right;color:#975125;"><strong>${formatCurrency(balanceDue)}</strong> (they were emailed and notified to pay it)</td></tr>` : ''}
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

// deno-lint-ignore no-explicit-any
type ModifyBody = Record<string, any>;

async function handleModify(req: Request, body: ModifyBody, internalActAs: string | null): Promise<Response> {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader && !internalActAs) {
      return jsonResponse({ error: 'Missing Authorization header.' }, 401);
    }

    const {
      bookingId, startDate, endDate, pickupTime, returnTime, pickupLocation, returnLocation,
      rentalCost, addonsCost, deliveryFee, securityDeposit, totalCost, billableDays,
      wopecareTotalCost, withDriverTotalCost, withDriver, withDriverDays, paystackReference, amountCharged, promoCode, addons,
    } = body;

    if (!bookingId || !startDate || !endDate || totalCost == null) {
      return jsonResponse({ error: 'bookingId, startDate, endDate, and totalCost are required.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY');
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    // paystack-webhook applies a paid change on the renter's behalf (they paid but never came back to the site): it proves itself
    // with the internal secret and names the renter, who then goes through exactly the same checks as if they had called.
    let caller: { id: string };
    if (internalActAs) {
      caller = { id: internalActAs };
    } else {
      const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader! } } });
      const { data: { user }, error: getUserError } = await callerClient.auth.getUser();
      if (getUserError || !user) {
        return jsonResponse({ error: 'Invalid or expired session.' }, 401);
      }
      caller = user;
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile } = await adminClient.from('users').select('role, is_support').eq('id', caller.id).maybeSingle();
    const isAdmin = callerProfile?.role === 'admin' || !!callerProfile?.is_support;

    const { data: booking, error: bookingError } = await adminClient
      .from('bookings')
      .select('*, cars(name, drive_type), renter:renter_id(id, full_name, email)')
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

    let verifiedPaidAmount = 0; // what Paystack independently confirmed for this change (0 when nothing was charged)
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
      verifiedPaidAmount = verifiedAmount;
      const claimedAmount = Number(amountCharged ?? 0);
      if (Math.abs(verifiedAmount - claimedAmount) > 0.5) {
        return jsonResponse({ error: 'The verified payment amount does not match this change.' }, 402);
      }
    }

    const newBillableDays = Number(billableDays ?? 0);

    // A booking made with a promo code that has a minimum length can't be shortened below it afterwards
    // (otherwise the discount could be kept while cutting the days). Staff can still override.
    // A promo code added with this change (the booking had none). One code per booking: a booking that already used one keeps it.
    // Checked with the same validate_promo_code the checkout uses (active, not expired, under its use limit, minimum days, trip
    // window) against the NEW dates; it is only used up (redeem_promo_code) right before the change is saved.
    const requestedPromo = typeof promoCode === 'string' && promoCode.trim() ? promoCode.trim() : null;
    let newPromo: { code: string; discountType: string | null; discountValue: number } | null = null;
    if (requestedPromo && !(booking.promo_code && booking.promo_code.toUpperCase() === requestedPromo.toUpperCase())) {
      if (booking.promo_code) {
        return jsonResponse({ error: `This booking already uses promo code ${booking.promo_code}. Only one promo code can be used per booking.` }, 400);
      }
      const { data: promoRows, error: promoError } = await adminClient.rpc('validate_promo_code', {
        p_code: requestedPromo, p_days: Math.round(newBillableDays), p_start: startDate, p_end: endDate,
      });
      const promoRow = promoRows?.[0];
      if (promoError || !promoRow) {
        return jsonResponse({ error: promoError?.message || 'Invalid or expired promo code.' }, 400);
      }
      newPromo = { code: promoRow.code, discountType: promoRow.discount_type, discountValue: Number(promoRow.discount_value) };
    }

    if (booking.promo_code && !isAdmin) {
      const { data: promoRow } = await adminClient.from('promo_codes').select('min_days, valid_from, valid_to').ilike('code', booking.promo_code).maybeSingle();
      // A code limited to a trip window (e.g. DETTY10: December only) stops applying if the booking is moved outside it.
      if (promoRow && ((promoRow.valid_from && startDate < promoRow.valid_from) || (promoRow.valid_to && endDate > promoRow.valid_to))) {
        return jsonResponse({ error: `This booking used promo code ${booking.promo_code}, which only applies to trips between ${promoRow.valid_from ?? 'the start'} and ${promoRow.valid_to ?? 'the end'}. Please keep the dates inside that period (or contact support).` }, 400);
      }
      if (promoRow?.min_days && newBillableDays < promoRow.min_days) {
        return jsonResponse({ error: `This booking used promo code ${booking.promo_code}, which needs at least ${promoRow.min_days} days. Please keep it at ${promoRow.min_days} days or more.` }, 400);
      }
    }

    // Adding or removing the WopeCar driver on a self-drive booking. Only runs when the caller states a choice (`withDriver`
    // true/false) - older app builds don't, and keep the previous behaviour. The price is worked out here, not trusted from the
    // client: a driver the renter already has keeps their quoted daily rate, a newly added one gets today's admin rate, and either
    // way it is rate x the new number of billable days.
    //
    // A self-drive car booked WITH a driver follows the chauffeur rules (12-hour billing, flat deposit, no delivery - the booking is stored
    // with drive_type 'Chauffeur'), so adding or removing the driver switches the whole booking between the two rule sets:
    //   bookingType        what the booking is stored as now (the type it was MADE with - a car re-labelled later changes nothing)
    //   baseSelfDrive      it started as a self-drive booking (self-drive, or chauffeur-rules because a driver was added): the driver is optional
    //   legacyDriverBooking a self-drive booking with a driver from BEFORE this change keeps its self-drive rules while the driver stays
    const bookingType: string | null = booking.drive_type ?? booking.cars?.drive_type ?? null;
    const hadDriverBefore = !!booking.with_driver || Number(booking.with_driver_total_cost ?? 0) > 0;
    const baseSelfDrive = bookingType === 'Self-drive' || (bookingType === 'Chauffeur' && hadDriverBefore);
    const legacyDriverBooking = bookingType === 'Self-drive' && hadDriverBefore;
    let newDriveType: string | null = bookingType;
    if (baseSelfDrive && typeof withDriver === 'boolean') {
      newDriveType = !withDriver ? 'Self-drive' : legacyDriverBooking ? 'Self-drive' : 'Chauffeur';
    }
    let driverPatch: { with_driver: boolean; with_driver_daily_rate: number; with_driver_total_cost: number; with_driver_days: number | null } | null = null;
    if (typeof withDriver === 'boolean' && baseSelfDrive) {
      const hadDriver = hadDriverBefore;
      const today = new Date().toISOString().slice(0, 10);
      if (withDriver !== hadDriver && !isAdmin && booking.start_date < today) {
        return jsonResponse({ error: 'The driver option can no longer be changed because the trip has already started.' }, 400);
      }
      let rate = 0;
      if (withDriver) {
        if (hadDriver && Number(booking.with_driver_daily_rate) > 0) {
          rate = Number(booking.with_driver_daily_rate);
        } else {
          const { data: feeRow } = await adminClient.from('app_settings').select('value').eq('key', 'with_driver_fee_per_day').maybeSingle();
          rate = typeof feeRow?.value === 'number' && feeRow.value >= 0 ? feeRow.value : 200;
        }
      }
      // How many days the driver is needed for: the caller's choice (1..trip days); a caller that doesn't say (older app builds)
      // keeps what the booking already had - its stored days if it was a partial-driver booking, otherwise every trip day.
      const tripDays = Math.max(Math.round(newBillableDays), 1);
      let driverDays = 0;
      if (withDriver) {
        // Chauffeur rules: the driver covers the whole trip. Only a legacy driver booking may keep (or choose) partial days.
        const storedPartial = booking.with_driver_days != null && Number(booking.with_driver_days) < Number(booking.billable_days ?? tripDays) ? Number(booking.with_driver_days) : null;
        const requested = newDriveType === 'Chauffeur' ? tripDays : withDriverDays != null ? Number(withDriverDays) : (storedPartial ?? tripDays);
        driverDays = Math.min(Math.max(Math.round(Number.isFinite(requested) ? requested : tripDays), 1), tripDays);
      }
      const cost = withDriver ? Math.round(rate * driverDays * 100) / 100 : 0;
      if (withDriverTotalCost != null && Math.abs(Number(withDriverTotalCost) - cost) > 0.5) {
        return jsonResponse({ error: 'The driver price has changed since you opened this page. Please reload and try again.' }, 409);
      }
      // null = the driver covers every billed day (so it follows the trip if it is extended later); a number only for a legacy partial booking.
      driverPatch = { with_driver: withDriver, with_driver_daily_rate: withDriver ? rate : 0, with_driver_total_cost: cost, with_driver_days: withDriver && driverDays < tripDays ? driverDays : null };
    }
    // --- Server-side pricing ----------------------------------------------------------------------------------------------------
    // The client's totals are not trusted on their own. Add-on days, delivery, the security deposit, the promo and the driver cost follow
    // simple shared rules, so they are worked out here from what the server knows; the total is rebuilt from the parts. The rental cost
    // (seasonal prices, discounts) and the WopeCare cost still come from the client but the rental is range-checked below.
    const car = booking.cars as { name: string; drive_type: string | null } | null;
    // The drive type the booking was MADE with wins over the car's current one: a car later re-labelled Chauffeur must not flip an existing
    // self-drive booking onto the chauffeur flat deposit and free delivery (three real bookings are in exactly that state).
    const driveType = newDriveType ?? car?.drive_type ?? null;
    const { data: carRow } = await adminClient.from('cars').select('price_per_day, regional_addons').eq('id', booking.car_id).maybeSingle();
    const { data: settingRows } = await adminClient
      .from('app_settings')
      .select('key, value')
      .in('key', ['self_drive_delivery_fee', 'chauffeur_security_deposit', 'security_deposit_threshold', 'security_deposit_flat', 'security_deposit_percentage']);
    const settingsMap = Object.fromEntries((settingRows ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));

    // Travel add-ons (trips to other cities/regions). Only changed when the caller sends `addons` ([{ name, days }]); older app builds
    // don't, and keep the booking's stored add-ons as before. Each name must be one the car offers today; a destination the booking
    // already has stays allowed even if the car no longer lists it. Days are capped to the billed days by computeModifyPricing.
    const addonDefsNow = (carRow?.regional_addons as { name: string; type: string; price: number }[] | null) ?? [];
    const storedAddonNames: string[] = booking.addon_names ?? [];
    let requestedAddons: { names: string[]; days: number[] } | null = null;
    if (Array.isArray(addons)) {
      const names: string[] = [];
      const days: number[] = [];
      for (const a of addons as { name?: unknown; days?: unknown }[]) {
        const name = typeof a?.name === 'string' ? a.name.trim() : '';
        if (!name || names.includes(name)) continue;
        if (!addonDefsNow.some((d) => d.name === name) && !storedAddonNames.includes(name)) {
          return jsonResponse({ error: `${name} is no longer offered as a travel add-on for this car. Please reload and choose again.` }, 400);
        }
        names.push(name);
        const n = Number(a?.days);
        days.push(Number.isFinite(n) && n >= 1 ? Math.round(n) : Math.max(1, Math.round(newBillableDays)));
      }
      requestedAddons = { names, days };
    }
    const addonsChanged = !!requestedAddons && (
      requestedAddons.names.length !== storedAddonNames.length
      || requestedAddons.names.some((n, idx) => {
        const stored = storedAddonNames.indexOf(n);
        return stored === -1 || Number(booking.addon_days?.[stored] ?? -1) !== requestedAddons!.days[idx];
      })
    );
    let promoInfo: { discountType: string | null; discountValue: number } | null = null;
    if (newPromo) {
      promoInfo = { discountType: newPromo.discountType, discountValue: newPromo.discountValue };
    } else if (booking.promo_code) {
      const { data: promoRow } = await adminClient.from('promo_codes').select('discount_type, discount_value').ilike('code', booking.promo_code).maybeSingle();
      if (promoRow) promoInfo = { discountType: promoRow.discount_type, discountValue: Number(promoRow.discount_value) };
      // The code was deleted after the booking used it: keep the discount the booking already has (flat, capped at the subtotal) rather
      // than silently dropping it on a modification.
      else if (Number(booking.promo_discount_amount ?? 0) > 0) promoInfo = { discountType: 'flat', discountValue: Number(booking.promo_discount_amount) };
    }

    // The driver after this change. An explicit choice (driverPatch) wins; otherwise a driver the booking already has follows the new trip
    // length (a driver for every day costs rate x the NEW days - it used to stay at the old amount when a trip was extended).
    let driverPatchFinal = driverPatch;
    if (!driverPatchFinal && (driveType !== 'Chauffeur' || hadDriverBefore)) {
      const hadDriver = hadDriverBefore;
      const rate = Number(booking.with_driver_daily_rate ?? 0);
      if (hadDriver && rate > 0) {
        const tripDays = Math.max(Math.round(newBillableDays), 1);
        // A driver for every day (stored null, or a day count equal to the old trip) follows the NEW trip length; only a genuinely partial legacy
        // booking keeps its day count.
        const partial = booking.with_driver_days != null && Number(booking.with_driver_days) < Number(booking.billable_days ?? tripDays);
        const days = partial ? Math.min(Math.max(Math.round(Number(booking.with_driver_days)), 1), tripDays) : tripDays;
        driverPatchFinal = {
          with_driver: true,
          with_driver_daily_rate: rate,
          with_driver_total_cost: Math.round(rate * days * 100) / 100,
          with_driver_days: partial && days < tripDays ? days : null,
        };
      }
    }
    const driverNow = driverPatchFinal
      ? { active: driverPatchFinal.with_driver, cost: driverPatchFinal.with_driver_total_cost, days: driverPatchFinal.with_driver_days }
      : { active: false, cost: driveType === 'Chauffeur' && !hadDriverBefore ? 0 : Math.max(0, Number(withDriverTotalCost ?? booking.with_driver_total_cost ?? 0)), days: null as number | null };

    const newRentalCost = Number(rentalCost ?? booking.rental_cost);
    if (!isAdmin && carRow?.price_per_day != null) {
      // Floor on the rental: seasonal prices and discounts can lower it, but never below ~30% of the cheapest daily price for the days billed.
      const { data: dateRows } = await adminClient.from('car_date_prices').select('price').eq('car_id', booking.car_id).gte('date', startDate).lte('date', endDate);
      const cheapest = Math.min(Number(carRow.price_per_day), ...((dateRows ?? []).map((r: { price: number }) => Number(r.price))));
      if (newRentalCost < 0.3 * cheapest * Math.max(newBillableDays, 1)) {
        return jsonResponse({ error: 'This price is below the minimum allowed for this vehicle. Please reload and try again.' }, 400);
      }
    }

    const pricedRaw = computeModifyPricing({
      driveType,
      billableDays: newBillableDays,
      rentalCost: newRentalCost,
      wopecareTotalCost: Number(wopecareTotalCost ?? booking.wopecare_total_cost ?? 0),
      driver: driverNow,
      addonNames: requestedAddons ? requestedAddons.names : (booking.addon_names ?? null),
      addonDays: requestedAddons ? requestedAddons.days : (booking.addon_days ?? null),
      addonDefs: addonDefsNow,
      currentAddonsCost: Number(booking.addons_cost ?? 0),
      currentDeliveryFee: Number(booking.delivery_fee ?? 0),
      promo: promoInfo,
      settings: settingsMap,
    });
    // Terms of Service 5.2: once a trip has STARTED (the scheduled pickup time has passed) nothing is refunded and unused days are not credited. So
    // when a renter shortens a trip that is already under way, the dates change but the CHARGES stay exactly as they were paid: no lower total, no
    // credit, nothing for anyone to refund. (Raising the total, e.g. extending, is unaffected; staff can still adjust a booking on purpose.)
    const tripStarted = combineDateAndTime(booking.start_date, booking.pickup_time, '10:00').getTime() <= Date.now();
    const held = tripStarted && !isAdmin && pricedRaw.totalCost < Number(booking.total_cost) - 0.005;
    const priced = held
      ? {
        ...pricedRaw,
        totalCost: Number(booking.total_cost),
        addonsCost: Number(booking.addons_cost ?? 0),
        deliveryFee: Number(booking.delivery_fee ?? 0),
        securityDeposit: Number(booking.security_deposit ?? 0),
        promoDiscount: Number(booking.promo_discount_amount ?? 0),
        addonDays: null,
      }
      : pricedRaw;
    // A new promo code can't lower the price of a trip that has already started (same rule as above: nothing is refunded once it
    // has started). Refuse rather than quietly use the code up for no discount.
    if (held && newPromo) {
      return jsonResponse({ error: 'Your trip has already started, so a promo code can no longer lower its price. Please remove the code to save this change.' }, 400);
    }
    // Same rule for destinations: unused days of a trip that has started can't pay for a new destination. Removing one is fine (the
    // charges simply stay as paid); adding one while the total still ends up lower than what was paid is refused.
    if (held && requestedAddons && requestedAddons.names.some((n) => !storedAddonNames.includes(n))) {
      return jsonResponse({ error: 'Your trip has already started, so unused days can\'t be put towards a new destination. Please keep your dates and add the destination on its own, or contact support.' }, 400);
    }
    const effRentalCost = held ? Number(booking.rental_cost) : newRentalCost;
    const effBillableDays = held ? Number(booking.billable_days ?? newBillableDays) : newBillableDays;
    const newTotalCost = priced.totalCost;
    const clientTotal = Number(totalCost);
    const oldTotal = Number(booking.total_cost);

    // A paid booking can only go UP in price if Paystack really confirmed that increase.
    if (!isAdmin && booking.payment_status === 'paid' && newTotalCost - oldTotal > 0.5 && verifiedPaidAmount < newTotalCost - oldTotal - 0.5) {
      await adminClient.rpc('log_booking_price_audit', {
        p_booking_id: booking.id, p_ref: booking.booking_ref, p_renter: caller.id, p_flags: ['modify_underpaid'],
        p_rental: newRentalCost, p_total: clientTotal, p_expected: newTotalCost,
      });
      return jsonResponse({ error: 'The price for this change has been updated. Please reload the booking and try again.' }, 409);
    }
    if (!held && Math.abs(clientTotal - newTotalCost) > 0.5) {
      // The client and the server disagree (an old app build, or a tampered request). The server's number is the one saved.
      await adminClient.rpc('log_booking_price_audit', {
        p_booking_id: booking.id, p_ref: booking.booking_ref, p_renter: caller.id, p_flags: ['modify_total_mismatch'],
        p_rental: newRentalCost, p_total: clientTotal, p_expected: newTotalCost,
      });
    }

    // The payout rate lives in the admin-only car_payouts table (not on cars, which is publicly readable).
    const { data: payoutRow } = await adminClient.from('car_payouts').select('payout_per_day').eq('car_id', booking.car_id).maybeSingle();
    const payoutPerDay = Number(payoutRow?.payout_per_day ?? 0);
    const vendorPayoutTotal = Math.round(payoutPerDay * Math.max(effBillableDays, 0) * 100) / 100;
    const wopecarMargin = Math.round((newTotalCost - vendorPayoutTotal) * 100) / 100;

    // Balance due on a PAID booking: what the new total adds beyond what was collected with this change. Staff changes collect nothing
    // (amountCharged 0), so a raise becomes a balance the renter is asked to pay; a later reduction (or a payment) takes it back down. A
    // renter's own raise is paid on Paystack first (see the 409 above), so for them the difference is already covered and nothing is added.
    const collectedNow = Math.max(0, Number(amountCharged ?? (newTotalCost - oldTotal)));
    const previousBalance = Number(booking.balance_due ?? 0);
    const balanceDue = booking.payment_status === 'paid'
      ? Math.max(0, Math.round((previousBalance + (newTotalCost - oldTotal) - collectedNow) * 100) / 100)
      : 0;

    const updatePatch: Record<string, unknown> = {
      start_date: startDate,
      end_date: endDate,
      pickup_time: pickupTime ?? null,
      return_time: returnTime ?? null,
      pickup_location: pickupLocation ?? null,
      return_location: returnLocation ?? null,
      rental_cost: effRentalCost,
      addons_cost: priced.addonsCost,
      delivery_fee: priced.deliveryFee,
      security_deposit: priced.securityDeposit,
      promo_discount_amount: priced.promoDiscount,
      total_cost: newTotalCost,
      billable_days: effBillableDays,
      ...(!held && newDriveType && newDriveType !== booking.drive_type ? { drive_type: newDriveType } : {}),
      vendor_payout_per_day: payoutPerDay,
      vendor_payout_total: vendorPayoutTotal,
      wopecar_margin: wopecarMargin,
      ...(booking.payment_status === 'paid' && balanceDue !== previousBalance ? { balance_due: balanceDue } : {}),
    };
    if (requestedAddons && (addonsChanged || !held)) {
      // The destinations chosen on this change (also what the rental agreement lists). On a held change only a removal gets here.
      updatePatch.addon_names = requestedAddons.names;
      updatePatch.addon_days = pricedRaw.addonDays ?? [];
    } else if (priced.addonDays) {
      updatePatch.addon_days = priced.addonDays;
    }
    if (!held && wopecareTotalCost != null) {
      updatePatch.wopecare_total_cost = Number(wopecareTotalCost);
    }
    if (!held && driverPatchFinal) {
      Object.assign(updatePatch, driverPatchFinal);
    }
    if (newPromo) {
      // Use one of the code's uses now (it re-checks the limit under a row lock, so two renters can't both take the last use).
      const { data: redeemed, error: redeemError } = await adminClient.rpc('redeem_promo_code', {
        p_code: newPromo.code, p_days: Math.round(newBillableDays), p_start: startDate, p_end: endDate,
      });
      if (redeemError || !redeemed?.[0]) {
        return jsonResponse({ error: redeemError?.message || 'Invalid or expired promo code.' }, 400);
      }
      updatePatch.promo_code = newPromo.code;
    }

    const { error: updateError } = await adminClient.from('bookings').update(updatePatch).eq('id', bookingId);
    if (updateError) {
      if (newPromo) {
        // Give the use back: the change wasn't saved, so the code wasn't used.
        const { data: pc } = await adminClient.from('promo_codes').select('id, uses_count').ilike('code', newPromo.code).maybeSingle();
        if (pc && Number(pc.uses_count) > 0) await adminClient.from('promo_codes').update({ uses_count: Number(pc.uses_count) - 1 }).eq('id', pc.id);
      }
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
      new_rental_cost: effRentalCost,
      new_addons_cost: priced.addonsCost,
      new_delivery_fee: priced.deliveryFee,
      new_security_deposit: priced.securityDeposit,
      new_wopecare_total_cost: !held && wopecareTotalCost != null ? Number(wopecareTotalCost) : (booking.wopecare_total_cost ?? 0),
      new_with_driver_total_cost: !held && driverPatchFinal ? driverPatchFinal.with_driver_total_cost : (booking.with_driver_total_cost ?? 0),
      new_total_cost: newTotalCost,
      amount_charged: Number(amountCharged ?? (newTotalCost - oldTotal)),
      payment_ref: paystackReference ?? null,
      old_addon_names: storedAddonNames,
      new_addon_names: (updatePatch.addon_names as string[] | undefined) ?? storedAddonNames,
    };
    let { data: insertedMod, error: modError } = await adminClient
      .from('booking_modifications')
      .insert(modRow)
      .select()
      .single();
    if (modError && /addon_names/.test(modError.message ?? '')) {
      // Migration 0177 (the destination columns) not run yet on this database: keep the history row without them.
      const { old_addon_names: _o, new_addon_names: _n, ...withoutAddons } = modRow;
      ({ data: insertedMod, error: modError } = await adminClient.from('booking_modifications').insert(withoutAddons).select().single());
    }
    if (modError) {
      // The booking write already succeeded - a failure recording the audit
      // row must not be reported as the whole operation having failed.
      console.error('booking_modifications insert failed:', modError);
    }
    const mod = insertedMod ?? modRow;

    // Issue a NEW QuickBooks invoice + receipt for the changed booking and email the renter the updated receipt; finance voids the
    // old ones by hand (the function emails them exactly which). Runs in the background so the renter isn't kept waiting, and a
    // QuickBooks problem never undoes or fails the modification itself.
    const reissue = (async () => {
      try {
        const { data: secretRow } = await adminClient.from('internal_secrets').select('value').eq('name', 'cron').maybeSingle();
        const { error: reissueError } = await adminClient.functions.invoke('quickbooks-reissue-receipt', {
          body: { bookingId, modificationId: insertedMod?.id ?? null },
          headers: { 'x-cron-secret': secretRow?.value ?? '' },
        });
        if (reissueError) console.error('quickbooks-reissue-receipt failed:', reissueError.message);
      } catch (e) {
        console.error('quickbooks-reissue-receipt call failed:', e);
      }
    })();
    // deno-lint-ignore no-explicit-any
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(reissue);
    else await reissue;

    const modifiedBy = isOwner ? 'the client' : 'admin/support';
    const breakdownBody = `Booking ${booking.booking_ref}: `
      + `${formatDate(mod.old_start_date)} → ${formatDate(mod.old_end_date)} is now ${formatDate(mod.new_start_date)} → ${formatDate(mod.new_end_date)}. `
      + `Total ${formatCurrency(mod.old_total_cost)} → ${formatCurrency(mod.new_total_cost)}.`
      + (balanceDue > 0 ? ` Balance due: ${formatCurrency(balanceDue)} - open the booking to pay it.` : '')
      + (held ? ' Your trip had already started, so shortening it does not change what you paid: unused days are not refunded or credited (Terms of Service, section 5.2).' : '')
      + (addonsChanged && updatePatch.addon_names
        ? ` Travel destinations: ${(updatePatch.addon_names as string[]).length ? (updatePatch.addon_names as string[]).join(', ') : 'none'}.`
        : '')
      + (driverPatch && driverPatch.with_driver !== (!!booking.with_driver || Number(booking.with_driver_total_cost ?? 0) > 0)
        ? ` A WopeCar driver was ${driverPatch.with_driver ? 'added to' : 'removed from'} the booking.`
        : '');

    await adminClient.from('notifications').insert({
      user_id: booking.renter_id,
      type: 'booking_modified',
      title: balanceDue > 0 ? 'Booking updated - balance due' : 'Booking updated',
      body: breakdownBody,
      booking_id: booking.id,
    });

    const pushNotifications = [{ userId: booking.renter_id, title: balanceDue > 0 ? 'Booking updated - balance due' : 'Booking updated', body: breakdownBody }];

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
          html: buildClientEmailHtml({ booking, car: booking.cars, mod, balanceDue, held, promo: newPromo ? { code: newPromo.code, discount: priced.promoDiscount } : null, payUrl: `${(Deno.env.get('WEBSITE_URL') ?? 'https://wopecar.com').replace(/\/$/, '')}/pay-balance?booking=${booking.id}` }),
        }));
      }
      if (supportEmail) {
        sends.push(sendResendEmail(resendApiKey, {
          from: 'WopeCar <bookings@wopecar.com>',
          to: [supportEmail],
          subject: `Booking Modified - ${booking.booking_ref}`,
          html: buildAdminEmailHtml({ booking, car: booking.cars, renter: booking.renter, mod, modifiedBy, balanceDue, promo: newPromo ? { code: newPromo.code, discount: priced.promoDiscount } : null }),
        }));
      }
      await Promise.allSettled(sends);
    }

    return jsonResponse({ success: true, modification: mod, balanceDue, collectedNow, chargesHeld: held });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
}

// A paid change is applied at most once per Paystack reference, from whichever arrives first: the client (app / website callback)
// or paystack-webhook. A change the website started is waiting in pending_booking_modifications (see migration 0168): it is claimed
// before applying, so two callers can't apply it twice, and released with the error if it can't be applied.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let body: ModifyBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400);
  }

  const internalActAs = typeof body.actAsUserId === 'string' && (await isTrustedInternalCaller(req)) ? body.actAsUserId as string : null;
  if (body.actAsUserId && !internalActAs) return jsonResponse({ error: 'Unauthorized.' }, 401);

  const reference: string | null = typeof body.pendingReference === 'string' ? body.pendingReference
    : typeof body.paystackReference === 'string' ? body.paystackReference : null;
  if (!reference) return handleModify(req, body, internalActAs);

  const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Already applied with this payment (e.g. the webhook got there first): report success, change nothing.
  const { data: doneMod } = await adminClient.from('booking_modifications').select('id').eq('payment_ref', reference).limit(1).maybeSingle();
  if (doneMod) return jsonResponse({ success: true, alreadyApplied: true });

  const { data: pending } = await adminClient.from('pending_booking_modifications').select('*').eq('reference', reference).maybeSingle();
  if (!pending) {
    if (body.pendingReference && !body.bookingId) return jsonResponse({ error: 'We could not find this change. Please contact support with your payment reference.' }, 404);
    return handleModify(req, body, internalActAs); // app flow: no pending row, same as before
  }
  if (pending.applied_at) return jsonResponse({ success: true, alreadyApplied: true });

  // Claim it (a stale claim older than 2 minutes is treated as abandoned).
  const staleBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: claimed } = await adminClient
    .from('pending_booking_modifications')
    .update({ claimed_at: new Date().toISOString() })
    .eq('reference', reference)
    .is('applied_at', null)
    .or(`claimed_at.is.null,claimed_at.lt.${staleBefore}`)
    .select('reference')
    .maybeSingle();
  if (!claimed) return jsonResponse({ success: true, inProgress: true });

  // The saved request is the source of truth for what was paid for; the payment reference and amount come from it too.
  const merged: ModifyBody = {
    ...(pending.payload as ModifyBody),
    bookingId: pending.booking_id,
    paystackReference: reference,
    amountCharged: Number(pending.amount),
  };
  const res = await handleModify(req, merged, internalActAs);
  let resBody: ModifyBody = {};
  try {
    resBody = await res.clone().json();
  } catch {
    // keep {}
  }
  if (res.ok && resBody.success) {
    await adminClient.from('pending_booking_modifications')
      .update({ applied_at: new Date().toISOString(), modification_id: resBody.modification?.id ?? null, last_error: null })
      .eq('reference', reference);
  } else {
    await adminClient.from('pending_booking_modifications')
      .update({ claimed_at: null, last_error: `${res.status}: ${resBody.error ?? 'unknown error'}` })
      .eq('reference', reference);
  }
  return res;
});
