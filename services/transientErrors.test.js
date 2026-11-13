// Nov 13 2026: on full LTE, Submit Inspection showed "You appear to be offline" and "Too many connections issued to the database".
const { isNetworkError, isTransientServerError, withRetry, describeSubmitError } = require('./transientErrors');

const noSleep = () => Promise.resolve();

describe('error classification', () => {
  test('Storage pool exhaustion (HTTP 544) is a busy server, not offline', () => {
    const e = Object.assign(new Error('Too many connections issued to the database'), { name: 'StorageApiError', status: 544 });
    expect(isNetworkError(e)).toBe(false);
    expect(isTransientServerError(e)).toBe(true);
    expect(describeSubmitError(e).title).toBe('Server busy');
  });

  test('PostgREST connection errors are transient', () => {
    expect(isTransientServerError({ code: 'PGRST003', message: 'Timed out acquiring connection from connection pool.' })).toBe(true);
    expect(isTransientServerError({ code: '53300', message: 'sorry, too many clients already' })).toBe(true);
  });

  test('a failed fetch is offline', () => {
    const e = new TypeError('Network request failed');
    expect(isNetworkError(e)).toBe(true);
    expect(describeSubmitError(e).title).toBe('You appear to be offline');
    const wrapped = Object.assign(new Error('Network request failed'), { name: 'StorageUnknownError', originalError: e });
    expect(isNetworkError(wrapped)).toBe(true);
  });

  test('validation and permission errors are neither, and keep their own message', () => {
    const e = new Error('All 15 photos are required before submitting.');
    expect(isNetworkError(e)).toBe(false);
    expect(isTransientServerError(e)).toBe(false);
    expect(describeSubmitError(e)).toEqual({ title: 'Could not submit inspection', message: e.message });
    expect(isTransientServerError({ code: '42501', message: 'new row violates row-level security policy' })).toBe(false);
  });
});

describe('withRetry', () => {
  test('retries a busy server until it succeeds', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error('Too many connections issued to the database'), { status: 544 });
      return 'ok';
    }, { sleepFn: noSleep });
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  test('does not retry a permanent error', async () => {
    let calls = 0;
    await expect(withRetry(async () => {
      calls += 1;
      throw new Error('Both signatures are required before submitting.');
    }, { sleepFn: noSleep })).rejects.toThrow('Both signatures');
    expect(calls).toBe(1);
  });

  test('gives up after the last attempt with the real error', async () => {
    let calls = 0;
    await expect(withRetry(async () => {
      calls += 1;
      throw new TypeError('Network request failed');
    }, { attempts: 3, sleepFn: noSleep })).rejects.toThrow('Network request failed');
    expect(calls).toBe(3);
  });
});
