import { useEffect, useState } from 'react';
import supabase from './supabase';
import { buildCancellationPolicyText } from '../constants/cancellationPolicyText';

// The platform-wide cancellation policy shown on a car's page, built from the SAME admin-editable app_settings the cancel-booking function
// enforces (Settings > Cancellation Policy) - and worded exactly like the website's car page, so the app and wopecar.com never disagree.
// It replaces each car's own legacy text ("Flexible", flat fees, "full refund up to 4 days"...), which did not match the real policy.
const KEYS = ['cancellation_full_refund_hours', 'cancellation_partial_refund_hours', 'cancellation_partial_refund_percentage'];

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
