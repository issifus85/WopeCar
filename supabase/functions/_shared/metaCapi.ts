// Meta Conversions API, server side. Today it sends exactly one event:
// the `Purchase` for a booking whose payment was confirmed on the server.
//
// Why it exists. The browser `purchase` fires from /cart/checkout/callback
// (wopecar-website, components/CheckoutCallbackContent.tsx), so it is lost
// whenever the buyer never gets back from Paystack - tab closed, redirect
// failed, phone asleep. paystack-webhook confirms the booking anyway, so the
// sale is real and simply never reaches Meta. Measured on production for
// 23-25 Nov 2026: 4 of 6 website bookings produced a Purchase, so roughly a
// third of real revenue was invisible to the ad platform.
//
// Deduplication is by `event_id` = the Paystack reference. The browser event
// carries the same value (GTM maps the Meta tag's Event ID to
// eventModel.transaction_id, which trackPurchase already sets to the
// reference), so whichever of the two arrives second is dropped by Meta
// instead of counted again. That is what makes it safe to send this
// unconditionally alongside the browser event rather than trying to work out
// whether the browser one went.
//
// Consent. This sends ONLY for a buyer who accepted cookies, and it learns
// that from the Paystack transaction's own metadata (stamped at
// paystack-initialize), NOT from a cookie - there is no request and no cookie
// here, which is the entire point. Unknown or declined sends nothing. The
// mobile app never stamps it, so app bookings stay unreported on purpose:
// the app asks nobody about tracking yet.

const GRAPH_VERSION = 'v21.0';
const REQUEST_TIMEOUT_MS = 5000;

export type MetaPurchaseInput = {
  /** Paystack reference. Also the dedup key against the browser event. */
  eventId: string;
  /** Revenue, deposit excluded - must match the browser event's `value`. */
  value: number;
  currency: string;
  /** Car UUIDs. The same ids the catalogue feed is keyed on. */
  contentIds: string[];
  contents: { id: string; quantity: number; item_price: number }[];
  email: string | null;
  phone: string | null;
  eventTimeSeconds: number;
  eventSourceUrl?: string;
};

export type MetaSendResult = { sent: boolean; reason?: string; eventsReceived?: number };

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Meta's normalisation for email: trimmed, lower-cased, then SHA-256. */
export function normalizeEmailForMeta(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim().toLowerCase();
  return value.includes('@') ? value : null;
}

/**
 * Meta wants a phone as digits only, with country code, no '+' and no trunk
 * '0'. Ghanaian numbers reach us in all of 0241234567, 233241234567,
 * +233 24 123 4567 and 241234567, so each has to land on the same string or
 * the hash won't match the one Meta holds and the identifier is wasted.
 */
export function normalizePhoneForMeta(raw: string | null | undefined): string | null {
  let digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!digits.startsWith('233')) {
    if (digits.startsWith('0')) digits = `233${digits.slice(1)}`;
    else if (digits.length === 9) digits = `233${digits}`;
  }
  // 233 + 9 national digits. Anything shorter is a bad record, and a wrong
  // hash is worse than no identifier: it can match a different person.
  return digits.length === 12 ? digits : null;
}

/**
 * Posts one Purchase. Never throws - a measurement call must not be able to
 * fail a payment confirmation, so the caller gets a result to log instead.
 *
 * META_TEST_EVENT_CODE, when set, makes the event show up in Events Manager's
 * Test Events tab instead of counting as live traffic. It is how this gets
 * verified without a real payment; it must be unset in production.
 */
export async function sendMetaPurchase(input: MetaPurchaseInput): Promise<MetaSendResult> {
  const pixelId = Deno.env.get('META_PIXEL_ID');
  const accessToken = Deno.env.get('META_CAPI_ACCESS_TOKEN');
  if (!pixelId || !accessToken) return { sent: false, reason: 'META_PIXEL_ID/META_CAPI_ACCESS_TOKEN not configured' };

  const email = normalizeEmailForMeta(input.email);
  const phone = normalizePhoneForMeta(input.phone);
  const userData: Record<string, string[]> = {};
  if (email) userData.em = [await sha256Hex(email)];
  if (phone) userData.ph = [await sha256Hex(phone)];
  // Meta rejects an event with no identifier at all, and an unattributable
  // Purchase would be worse than none: it would inflate conversion counts
  // without being matchable to the click that earned it.
  if (!userData.em && !userData.ph) return { sent: false, reason: 'no email or phone to match on' };

  const testEventCode = Deno.env.get('META_TEST_EVENT_CODE');
  const payload = {
    data: [
      {
        event_name: 'Purchase',
        event_time: input.eventTimeSeconds,
        event_id: input.eventId,
        action_source: 'website',
        ...(input.eventSourceUrl ? { event_source_url: input.eventSourceUrl } : {}),
        user_data: userData,
        custom_data: {
          currency: input.currency,
          value: input.value,
          content_type: 'product',
          content_ids: input.contentIds,
          contents: input.contents,
          order_id: input.eventId,
        },
      },
    ],
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
  };

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const message = json?.error?.message ?? `HTTP ${res.status}`;
      return { sent: false, reason: `Meta refused the event: ${message}` };
    }
    return { sent: true, eventsReceived: Number(json?.events_received ?? 0) };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : 'request failed' };
  }
}
