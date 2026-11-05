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
  supabase.functions.invoke.mockReset();
});

test('markBookingPaid goes through the guarded database function with the method, reference and note', async () => {
  supabase.rpc.mockResolvedValue({ data: 'b1', error: null });
  supabase.from.mockReturnValue(selectChain({ id: 'b1', payment_status: 'paid' }));
  const updated = await markBookingPaid({ id: 'b1' }, { method: 'bank_transfer', reference: ' TRX-1 ', note: '' });
  expect(supabase.rpc).toHaveBeenCalledWith('admin_mark_booking_paid', { p_booking_id: 'b1', p_method: 'bank_transfer', p_reference: 'TRX-1', p_note: null });
  expect(updated.payment_status).toBe('paid');
});

test('a Paystack reference seen in the dashboard is verified by confirm-booking-payment before it is filed', async () => {
  supabase.functions.invoke.mockResolvedValue({ data: { transaction_status: 'success', outcomes: { b1: 'confirmed' } }, error: null });
  supabase.rpc.mockResolvedValue({ data: 'b1', error: null });
  supabase.from.mockReturnValue(selectChain({ id: 'b1', payment_status: 'paid', payment_ref: 'PSK-9' }));
  const updated = await markBookingPaid({ id: 'b1' }, { method: 'paystack_dashboard', reference: ' PSK-9 ', note: '' });
  expect(supabase.functions.invoke).toHaveBeenCalledWith('confirm-booking-payment', {
    body: { bookingIds: ['b1'], reference: 'PSK-9', asAdmin: true },
  });
  expect(supabase.rpc).toHaveBeenCalledWith('admin_mark_booking_paid', { p_booking_id: 'b1', p_method: 'paystack_dashboard', p_reference: 'PSK-9', p_note: null });
  expect(updated.payment_ref).toBe('PSK-9');
});

test('a Paystack reference Paystack refuses never reaches the database', async () => {
  supabase.functions.invoke.mockResolvedValue({ data: { error: 'This payment reference was already used for other bookings.' }, error: null });
  await expect(markBookingPaid({ id: 'b1' }, { method: 'paystack_dashboard', reference: 'PSK-9', note: '' })).rejects.toThrow('already used');
  expect(supabase.rpc).not.toHaveBeenCalled();
});

test('an off-Paystack payment goes straight to the database, with no Paystack call', async () => {
  supabase.rpc.mockResolvedValue({ data: 'b1', error: null });
  supabase.from.mockReturnValue(selectChain({ id: 'b1', payment_status: 'paid' }));
  await markBookingPaid({ id: 'b1' }, { method: 'mobile_money', reference: 'MOMO-7', note: '' });
  expect(supabase.functions.invoke).not.toHaveBeenCalled();
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
