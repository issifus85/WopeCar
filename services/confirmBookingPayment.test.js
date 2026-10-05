jest.mock('./supabase', () => ({ __esModule: true, default: { functions: { invoke: jest.fn() }, from: jest.fn() } }));

const supabase = require('./supabase').default;
const { confirmBookingPayment } = require('./supabaseApi');

const httpError = (status, body) => ({
  data: null,
  error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    context: { status, json: async () => body },
  }),
});

beforeEach(() => supabase.functions.invoke.mockReset());

test('sends the booking id and reference, returns the server outcome', async () => {
  supabase.functions.invoke.mockResolvedValue({ data: { transaction_status: 'success', outcomes: { b1: 'confirmed' } }, error: null });
  await expect(confirmBookingPayment('b1', 'ref1')).resolves.toEqual({ outcome: 'confirmed' });
  expect(supabase.functions.invoke).toHaveBeenCalledWith('confirm-booking-payment', { body: { bookingIds: ['b1'], reference: 'ref1' } });
});

test('passes through a dates_conflict outcome', async () => {
  supabase.functions.invoke.mockResolvedValue({ data: { transaction_status: 'success', outcomes: { b1: 'dates_conflict' } }, error: null });
  await expect(confirmBookingPayment('b1', 'ref1')).resolves.toEqual({ outcome: 'dates_conflict' });
});

test('a rejection (4xx) throws the server message and is marked non-retryable', async () => {
  supabase.functions.invoke.mockResolvedValue(httpError(402, { error: 'The amount paid (GH₵900.00) does not cover these bookings (GH₵4500.00).' }));
  await expect(confirmBookingPayment('b1', 'ref1')).rejects.toMatchObject({ message: expect.stringContaining('does not cover'), rejected: true });
});

test('a server fault (5xx) is retryable (not marked rejected)', async () => {
  supabase.functions.invoke.mockResolvedValue(httpError(500, { error: 'boom' }));
  await expect(confirmBookingPayment('b1', 'ref1')).rejects.toMatchObject({ message: 'boom', rejected: false });
});

test('a payment that is not successful throws a non-retryable error', async () => {
  supabase.functions.invoke.mockResolvedValue({ data: { transaction_status: 'abandoned', outcomes: {} }, error: null });
  await expect(confirmBookingPayment('b1', 'ref1')).rejects.toMatchObject({ rejected: true });
});

test('missing outcome falls back to failed', async () => {
  supabase.functions.invoke.mockResolvedValue({ data: { transaction_status: 'success', outcomes: {} }, error: null });
  await expect(confirmBookingPayment('b1', 'ref1')).resolves.toEqual({ outcome: 'failed' });
});
