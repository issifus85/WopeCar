jest.mock('./supabase', () => ({
  __esModule: true,
  default: { rpc: jest.fn(), from: jest.fn(), functions: { invoke: jest.fn() } },
  edgeFunctionErrorMessage: jest.fn(),
}));
jest.mock('./adminNotify', () => ({ notifyUser: jest.fn() }));
jest.mock('./supabaseApi', () => ({ sendBookingCancelledEmail: jest.fn(), sendBookingConfirmedEmail: jest.fn() }));
jest.mock('./carPricingApi', () => ({ getDatePriceMap: jest.fn() }));

const supabase = require('./supabase').default;
const { markBookingPaid, confirmBooking } = require('./adminBookingsApi');

const selectChain = (row) => ({ select: () => ({ eq: () => ({ single: async () => ({ data: row, error: null }) }) }) });

beforeEach(() => {
  supabase.rpc.mockReset();
  supabase.from.mockReset();
});

test('markBookingPaid goes through the guarded database function with the method, reference and note', async () => {
  supabase.rpc.mockResolvedValue({ data: 'b1', error: null });
  supabase.from.mockReturnValue(selectChain({ id: 'b1', payment_status: 'paid' }));
  const updated = await markBookingPaid({ id: 'b1' }, { method: 'bank_transfer', reference: ' TRX-1 ', note: '' });
  expect(supabase.rpc).toHaveBeenCalledWith('admin_mark_booking_paid', { p_booking_id: 'b1', p_method: 'bank_transfer', p_reference: 'TRX-1', p_note: null });
  expect(updated.payment_status).toBe('paid');
});

test('markBookingPaid surfaces the database refusal (e.g. a cancelled booking)', async () => {
  supabase.rpc.mockResolvedValue({ data: null, error: { message: 'This booking is cancelled, so it cannot be marked as paid.' } });
  await expect(markBookingPaid({ id: 'b1' }, { method: 'cash', reference: 'R1', note: '' })).rejects.toThrow('cancelled');
  expect(supabase.from).not.toHaveBeenCalled();
});

test('confirmBooking refuses an unpaid booking instead of marking it paid', async () => {
  await expect(confirmBooking({ id: 'b1', payment_status: 'unpaid' })).rejects.toThrow('Mark as Paid');
  expect(supabase.from).not.toHaveBeenCalled();
});
