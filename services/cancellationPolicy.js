import { useEffect, useState } from 'react';
import supabase from './supabase';

// The platform-wide cancellation policy shown on a car's page, built from the SAME admin-editable app_settings the cancel-booking function
// enforces (Settings > Cancellation Policy) - and worded exactly like the website's car page, so the app and wopecar.com never disagree.
// It replaces each car's own legacy text ("Flexible", flat fees, "full refund up to 4 days"...), which did not match the real policy.
const KEYS = ['cancellation_full_refund_hours', 'cancellation_partial_refund_hours', 'cancellation_partial_refund_percentage'];

export function buildCancellationPolicyText({ fullHours = 48, partialHours = 24, partialPercentage = 0.5 } = {}) {
  const full = Number(fullHours) || 48;
  const partial = Number(partialHours) || 24;
  const pct = Math.round((Number.isFinite(Number(partialPercentage)) ? Number(partialPercentage) : 0.5) * 100);
  return `Full refund if cancelled at least ${full} hours before pickup. ${pct}% refund if cancelled between ${partial} and ${full} hours before. No refund of the rental charges inside ${partial} hours of pickup. The refundable security deposit is always returned in full when a booking is cancelled before the trip. Once the trip has started, cancellations, early returns and changes that shorten the trip are non-refundable, and unused days are not credited.`;
}

let cached = null;

/** The policy sentence; starts from the standard 48h / 24h / 50% wording so it is never blank, then updates from the live settings. */
export function useCancellationPolicyText() {
  const [text, setText] = useState(cached ?? buildCancellationPolicyText());

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('app_settings')
      .select('key, value')
      .in('key', KEYS)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const map = Object.fromEntries(data.map((row) => [row.key, row.value]));
        cached = buildCancellationPolicyText({
          fullHours: map.cancellation_full_refund_hours,
          partialHours: map.cancellation_partial_refund_hours,
          partialPercentage: map.cancellation_partial_refund_percentage,
        });
        setText(cached);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return text;
}
