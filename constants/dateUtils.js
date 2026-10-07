const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Turns a value into a Date WITHOUT the timezone shift `new Date('2026-10-12')`
 * has: a plain date-only string (a booking's start/end date, a discount window)
 * is a calendar date, but JS parses it as UTC midnight, so on a device west of
 * UTC (e.g. a US phone) it displays as the PREVIOUS day. Date-only strings are
 * built in local time instead; Date objects and full timestamps pass through
 * the normal parse unchanged.
 */
export function parseDateOnly(value) {
  if (typeof value === 'string' && DATE_ONLY_PATTERN.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

export function formatRelativeTime(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / (60 * 1000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
