// Supabase Edge Function - starts a Paystack transaction server-side,
// replacing the old Laravel /payments/paystack/initialize endpoint
// (services/paystackApi.js). That endpoint required a Laravel Sanctum
// bearer token - nothing has written that token since auth moved to
// Supabase (see services/tokenStorage.js's own header comment), so real
// bookings could not be paid for at all: app/checkout/payment.js ->
// services/paystackCheckout.js's payWithPaystack() -> this call, always
// 401'd. Same security property as the Laravel version: the Paystack
// secret key never reaches the client, only the hosted checkout URL does.
//
// Requires the PAYSTACK_SECRET_KEY secret:
//   supabase secrets set PAYSTACK_SECRET_KEY=<key> --project-ref qvactycnufaowwsiqdrz
//
// Deploy with: supabase functions deploy paystack-initialize

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY');

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: getUserError } = await callerClient.auth.getUser();
    if (getUserError || !user) {
      return jsonResponse({ error: 'Invalid or expired session.' }, 401);
    }

    if (!paystackSecretKey) {
      return jsonResponse({ error: 'PAYSTACK_SECRET_KEY is not configured for this project.' }, 500);
    }

    const { amount, callbackUrl, bookingIds, purpose, modification, driverBookingId } = await req.json();
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      return jsonResponse({ error: 'A positive amount is required.' }, 400);
    }
    if (!callbackUrl || typeof callbackUrl !== 'string') {
      return jsonResponse({ error: 'callbackUrl is required.' }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Optional: the reserved bookings this charge is for. Stamped into the
    // Paystack transaction's metadata so confirm-booking-payment and
    // paystack-webhook can later check the payment against exactly these
    // bookings, and so the webhook can finish them if the client never does.
    // Older app builds don't send it and simply get no metadata.
    let metadata: { booking_ids?: string[]; user_id: string; purpose?: string; driver_booking_id?: string } | undefined;
    if (purpose === 'wopedriver') {
      // Paying for a WopeDriver request (driver_bookings, migrations 0171/0172): the charge must be exactly what is still due on it.
      // confirm-driver-booking-payment / paystack-webhook only accept transactions stamped this way.
      if (!driverBookingId || typeof driverBookingId !== 'string') return jsonResponse({ error: 'This payment needs the driver booking id.' }, 400);
      const { data: db } = await adminClient.from('driver_bookings').select('id, user_id, status, total_cost, amount_paid').eq('id', driverBookingId).maybeSingle();
      if (!db || db.user_id !== user.id) return jsonResponse({ error: 'This driver booking does not belong to this account.' }, 403);
      if (!['requested', 'confirmed'].includes(db.status)) return jsonResponse({ error: 'This driver booking can no longer be paid for.' }, 409);
      const due = Math.round((Number(db.total_cost) - Number(db.amount_paid ?? 0)) * 100) / 100;
      if (due <= 0) return jsonResponse({ error: 'Nothing is due on this driver booking.' }, 409);
      if (Math.abs(due - numericAmount) > 0.5) return jsonResponse({ error: `The amount due is GHS ${due.toFixed(2)}.` }, 400);
      metadata = { purpose: 'wopedriver', driver_booking_id: db.id, user_id: user.id };
    } else if (Array.isArray(bookingIds) && bookingIds.length > 0) {
      const ids = Array.from(new Set(bookingIds.filter((id: unknown) => typeof id === 'string'))) as string[];
      const { data: owned } = await adminClient.from('bookings').select('id').in('id', ids).eq('renter_id', user.id);
      if (!owned || owned.length !== ids.length) {
        return jsonResponse({ error: 'These bookings do not belong to this account.' }, 403);
      }
      metadata = { booking_ids: ids, user_id: user.id };

      // Paying the BALANCE on a paid booking whose total staff raised (bookings.balance_due): exactly one booking, and the charge must be
      // the balance itself - confirm-balance-payment later only accepts transactions stamped this way.
      if (purpose === 'balance') {
        if (ids.length !== 1) return jsonResponse({ error: 'A balance payment is for one booking.' }, 400);
        const { data: bal } = await adminClient.from('bookings').select('balance_due').eq('id', ids[0]).maybeSingle();
        const balance = Number(bal?.balance_due ?? 0);
        if (balance <= 0) return jsonResponse({ error: 'This booking has no balance due.' }, 409);
        if (Math.abs(balance - numericAmount) > 0.5) {
          return jsonResponse({ error: `The balance due is GHS ${balance.toFixed(2)}.` }, 400);
        }
        metadata.purpose = 'balance';
      }

      // Paying the price difference for a change to the booking (website Modify Booking). The requested change is saved on the
      // server below, against this transaction's reference, so it is applied even if the renter never comes back from Paystack
      // (modify-booking applies it from the website callback or from paystack-webhook, whichever is first). modify-booking still
      // re-prices and re-verifies everything when it applies it.
      if (purpose === 'modify') {
        if (ids.length !== 1) return jsonResponse({ error: 'A booking change is for one booking.' }, 400);
        if (!modification || typeof modification !== 'object' || Array.isArray(modification)) {
          return jsonResponse({ error: 'The requested change is missing.' }, 400);
        }
        if (modification.bookingId && modification.bookingId !== ids[0]) {
          return jsonResponse({ error: 'The requested change is for a different booking.' }, 400);
        }
        if (Math.abs(Number(modification.amountCharged ?? numericAmount) - numericAmount) > 0.5) {
          return jsonResponse({ error: 'The amount does not match the requested change.' }, 400);
        }
        metadata.purpose = 'modify';
      }
    } else if (purpose === 'balance' || purpose === 'modify') {
      return jsonResponse({ error: 'This payment needs the booking id.' }, 400);
    }

    const { data: profile } = await adminClient.from('users').select('email').eq('id', user.id).maybeSingle();
    const email = profile?.email || user.email;
    if (!email) {
      return jsonResponse({ error: 'No email on file for this account.' }, 400);
    }

    // Paystack wants the smallest currency unit (pesewas for GHS) - the
    // client always sends plain GHS cedis (e.g. draft.totalCost), matching
    // what the Laravel backend previously accepted from the same call site.
    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: Math.round(numericAmount * 100),
        callback_url: callbackUrl,
        ...(metadata ? { metadata } : {}),
      }),
    });
    const paystackJson = await paystackRes.json();

    if (!paystackRes.ok || !paystackJson.status) {
      return jsonResponse({ error: paystackJson.message || 'Could not initialize payment with Paystack.' }, 502);
    }

    if (metadata?.purpose === 'modify') {
      // Saved before the renter is sent to pay; if it can't be saved, they aren't sent (nothing has been charged yet).
      // Strip fields the server decides itself (reference/amount come from the transaction, never from the client).
      const { paystackReference: _ref, amountCharged: _amt, pendingReference: _p, actAsUserId: _a, ...payload } = modification as Record<string, unknown>;
      const { error: pendingError } = await adminClient.from('pending_booking_modifications').insert({
        reference: paystackJson.data.reference,
        booking_id: metadata.booking_ids![0],
        renter_id: user.id,
        payload: { ...payload, bookingId: metadata.booking_ids![0] },
        amount: numericAmount,
      });
      if (pendingError) {
        return jsonResponse({ error: 'Could not start this payment. Please try again.' }, 500);
      }
    }

    return jsonResponse({
      authorization_url: paystackJson.data.authorization_url,
      reference: paystackJson.data.reference,
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
