jest.mock('./officerApi', () => ({ advanceTrip: jest.fn(), sendQuickReply: jest.fn() }));
jest.mock('expo-secure-store', () => {
  const store = {};
  return {
    getItemAsync: jest.fn(async (k) => store[k] ?? null),
    setItemAsync: jest.fn(async (k, v) => { store[k] = v; }),
  };
});

const { advanceTrip, sendQuickReply } = require('./officerApi');
const { runTripAction, flushQueue, isConnectionError } = require('./officerActionQueue');

const offline = () => Object.assign(new Error('TypeError: Network request failed'), { code: '' });
const refused = () => Object.assign(new Error('A trip that is cancelled cannot move to arrived.'), { code: 'P0001' });

beforeEach(() => {
  jest.useFakeTimers();
  advanceTrip.mockReset();
  sendQuickReply.mockReset();
});
afterEach(() => jest.useRealTimers());

test('tells a lost connection apart from the server saying no', () => {
  expect(isConnectionError(offline())).toBe(true);
  expect(isConnectionError(refused())).toBe(false);
});

test('sends straight away when online', async () => {
  advanceTrip.mockResolvedValue();
  await expect(runTripAction({ type: 'advance', taskId: 't1', status: 'en_route' })).resolves.toEqual({ queued: false });
  expect(advanceTrip).toHaveBeenCalledWith('t1', 'en_route');
});

test('a refused step is thrown, not queued', async () => {
  advanceTrip.mockRejectedValue(refused());
  await expect(runTripAction({ type: 'advance', taskId: 't1', status: 'arrived' })).rejects.toMatchObject({ code: 'P0001' });
});

test('offline steps are kept and sent later in the order they were tapped', async () => {
  advanceTrip.mockRejectedValue(offline());
  sendQuickReply.mockRejectedValue(offline());
  await expect(runTripAction({ type: 'advance', taskId: 't1', status: 'en_route' })).resolves.toEqual({ queued: true });
  await expect(runTripAction({ type: 'quick_reply', taskId: 't1', kind: 'on_my_way' })).resolves.toEqual({ queued: true });
  await expect(runTripAction({ type: 'advance', taskId: 't1', status: 'arrived' })).resolves.toEqual({ queued: true });

  const calls = [];
  advanceTrip.mockReset().mockImplementation(async (id, status) => { calls.push(`advance:${status}`); });
  sendQuickReply.mockReset().mockImplementation(async (id, kind) => { calls.push(`reply:${kind}`); });
  await flushQueue();
  expect(calls).toEqual(['advance:en_route', 'reply:on_my_way', 'advance:arrived']);

  // Nothing is left to send again.
  calls.length = 0;
  await flushQueue();
  expect(calls).toEqual([]);
});

test('a queued step the server refuses later is dropped and the rest still go', async () => {
  advanceTrip.mockRejectedValue(offline());
  await runTripAction({ type: 'advance', taskId: 't2', status: 'arrived' });
  await runTripAction({ type: 'advance', taskId: 't2', status: 'completed' });
  advanceTrip.mockReset()
    .mockRejectedValueOnce(refused())
    .mockResolvedValueOnce();
  await flushQueue();
  expect(advanceTrip).toHaveBeenCalledTimes(2);
  await flushQueue();
  expect(advanceTrip).toHaveBeenCalledTimes(2);
});
