// Classifies Supabase errors so a busy server is not reported to the user as "you are offline", and retries the ones that clear on their own.
//
// Nov 13 2026: agents on LTE submitting an inspection saw "You appear to be offline" (any failure while looking up the inspection was treated
// as offline) and "Too many connections issued to the database" (Supabase Storage's HTTP 544 DatabaseTimeout: its pool could not get a
// database connection in time). Both are momentary server-side conditions: a short wait and a retry usually succeeds.

const TRANSIENT_MESSAGE = /too many connections|remaining connection slots|connection (?:pool|timeout|terminated|refused)|timeout acquiring|timed? ?out|statement timeout|canceling statement|database.*(?:busy|unavailable)|service unavailable|bad gateway|gateway time-?out|upstream|ECONNRESET|socket hang up/i;
const NETWORK_MESSAGE = /network request failed|failed to fetch|fetch failed|network ?error|internet connection appears to be offline|load failed|aborted/i;

function statusOf(error) {
  const raw = error?.status ?? error?.statusCode ?? error?.context?.status;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// No response reached the app at all (no signal, DNS failure, request aborted) - the only case where "you appear to be offline" is true.
export function isNetworkError(error) {
  if (!error) return false;
  if (error.name === 'TypeError' && NETWORK_MESSAGE.test(error.message ?? '')) return true;
  // supabase-js wraps a failed fetch: StorageUnknownError / FunctionsFetchError keep the original TypeError.
  const inner = error.originalError ?? error.cause ?? error.context;
  if (inner && inner !== error && inner.name === 'TypeError' && NETWORK_MESSAGE.test(inner.message ?? '')) return true;
  return NETWORK_MESSAGE.test(error.message ?? '') && statusOf(error) == null;
}

// The server answered, but with a condition that clears on its own (connection pool exhausted, timeout, 5xx, rate limit).
export function isTransientServerError(error) {
  if (!error) return false;
  const status = statusOf(error);
  if (status === 408 || status === 429 || (status != null && status >= 500)) return true;
  // PostgREST: PGRST000-003 = could not connect / connection pool timeout. Postgres: 53300 too_many_connections, 57014 query_canceled.
  if (['PGRST000', 'PGRST001', 'PGRST002', 'PGRST003', '53300', '57P03', '57014'].includes(String(error.code ?? ''))) return true;
  return TRANSIENT_MESSAGE.test(`${error.message ?? ''} ${error.error ?? ''} ${error.details ?? ''}`);
}

export function isRetryableError(error) {
  return isNetworkError(error) || isTransientServerError(error);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs fn, retrying only transient/network failures with backoff (default 4 tries over ~7s, jittered so many phones retrying at once do not
 * hit the database in lock-step). Anything else (RLS refusal, "photos required", a submitted-inspection lock) is thrown straight away.
 */
export async function withRetry(fn, { attempts = 4, baseDelayMs = 800, maxDelayMs = 4000, sleepFn = sleep } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isRetryableError(error)) throw error;
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      await sleepFn(delay / 2 + Math.random() * (delay / 2));
    }
  }
  throw lastError;
}

// What to show when a submit still fails after the retries, so the person knows whether to check their signal or just wait a moment.
export function describeSubmitError(error, { failTitle = 'Could not submit inspection', action = 'Submit' } = {}) {
  if (isNetworkError(error)) {
    return {
      title: 'You appear to be offline',
      message: `Your signatures are saved on this device - reconnect and try ${action} again.`,
    };
  }
  if (isTransientServerError(error)) {
    return {
      title: 'Server busy',
      message: `WopeCar is busy right now. Your signatures are saved on this device - wait a minute and tap ${action} again.`,
    };
  }
  return {
    title: failTitle,
    message: error?.message || 'Please check your connection and try again.',
  };
}
