// The platform-wide cancellation policy sentence shown on a car's page, worded exactly like the website's car page.
// Kept free of imports so it is trivially testable; services/cancellationPolicy.js feeds it the live admin settings.
export function buildCancellationPolicyText({ fullHours = 48, partialHours = 24, partialPercentage = 0.5 } = {}) {
  const full = Number(fullHours) || 48;
  const partial = Number(partialHours) || 24;
  const pct = Math.round((Number.isFinite(Number(partialPercentage)) ? Number(partialPercentage) : 0.5) * 100);
  return `Full refund if cancelled at least ${full} hours before pickup. ${pct}% refund if cancelled between ${partial} and ${full} hours before. No refund of the rental charges inside ${partial} hours of pickup. The refundable security deposit is always returned in full when a booking is cancelled before the trip. Once the trip has started, cancellations, early returns and changes that shorten the trip are non-refundable, and unused days are not credited.`;
}
