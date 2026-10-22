// Admin-initiated rental agreement: the draft is created (prefilled from the booking) the moment the admin starts it, never overwrites an
// existing agreement, and submitting is idempotent.
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

const mockInserted = [];
let mockExisting = null;
let mockBooking = null;
let mockInsertError = null;
jest.mock('./supabase', () => {
  const chain = (table) => {
    const state = { table, filters: {} };
    const b = {
      select: () => b,
      eq: (c, v) => { state.filters[c] = v; return b; },
      insert: (row) => { state.insertRow = row; return b; },
      update: (patch) => { state.update = patch; return b; },
      maybeSingle: async () => ({ data: state.table === 'rental_agreements' ? mockExisting : null, error: null }),
      single: async () => {
        if (state.insertRow) {
          if (mockInsertError) return { data: null, error: mockInsertError };
          mockInserted.push(state.insertRow);
          return { data: { id: 'agr-1', status: 'draft', ...state.insertRow }, error: null };
        }
        if (state.table === 'bookings') return { data: mockBooking, error: null };
        if (state.table === 'rental_agreements') return { data: mockExisting, error: null };
        return { data: null, error: null };
      },
    };
    return b;
  };
  return { __esModule: true, default: { from: (t) => chain(t), functions: { invoke: jest.fn() }, storage: { from: jest.fn() } }, getCurrentUser: jest.fn() };
});

const { startRentalAgreementForBooking, submitRentalAgreement } = require('./rentalAgreementApi');

beforeEach(() => {
  mockInserted.length = 0;
  mockExisting = null;
  mockInsertError = null;
  mockBooking = {
    id: 'b1', start_date: '2026-12-10', end_date: '2026-12-14', pickup_time: '10:00 AM', return_time: '10:00 AM', security_deposit: 1250,
    cars: { make: 'Honda', model: 'CR-V', price_per_day: 1250 }, renter: { full_name: 'Ama Mensah' },
  };
});

test('starting saves a draft prefilled from the booking (the RENTER as lessee, not the admin)', async () => {
  const agreement = await startRentalAgreementForBooking('b1');
  expect(mockInserted).toHaveLength(1);
  expect(mockInserted[0]).toMatchObject({
    booking_id: 'b1', status: 'draft', lessee_name: 'Ama Mensah', vehicle_make: 'Honda CR-V', daily_rate: 1250, security_deposit: 1250,
    duration_start: '2026-12-10', duration_end: '2026-12-14', pickup_time: '10:00 AM', return_time: '10:00 AM', ghana_only_use: true,
  });
  expect(agreement.status).toBe('draft');
  expect(agreement.lesseeName).toBe('Ama Mensah');
});

test('an agreement that already exists is returned untouched, never overwritten', async () => {
  mockExisting = { id: 'agr-9', booking_id: 'b1', status: 'draft', lessee_name: 'Someone typed this' };
  const agreement = await startRentalAgreementForBooking('b1');
  expect(mockInserted).toHaveLength(0);
  expect(agreement.id).toBe('agr-9');
  expect(agreement.lesseeName).toBe('Someone typed this');
});

test('a race with another creator falls back to the row that now exists', async () => {
  mockInsertError = { code: '23505', message: 'duplicate key' };
  // first lookup finds nothing, the second (after the failed insert) finds the other party's row
  let calls = 0;
  const supabase = require('./supabase').default;
  const original = supabase.from;
  supabase.from = (t) => {
    const b = original(t);
    if (t === 'rental_agreements') {
      const orig = b.maybeSingle;
      b.maybeSingle = async () => { calls += 1; return calls === 1 ? { data: null, error: null } : { data: { id: 'agr-race', booking_id: 'b1', status: 'draft' }, error: null }; };
      void orig;
    }
    return b;
  };
  const agreement = await startRentalAgreementForBooking('b1');
  supabase.from = original;
  expect(agreement.id).toBe('agr-race');
});

test('submitting an already-submitted agreement is a no-op (a retry, or the other party finished first)', async () => {
  mockExisting = { id: 'agr-1', status: 'submitted', submitted_at: '2026-10-22T10:00:00Z', lessee_name: 'X' };
  const result = await submitRentalAgreement('agr-1');
  expect(result.status).toBe('submitted');
});
