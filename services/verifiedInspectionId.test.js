// verifiedInspectionId: a cached inspection id is only trusted once the server says it belongs to THIS booking + type.
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('./supabase', () => {
  const rows = [
    { id: 'insp-8538', booking_id: 'b-8538', type: 'pre' },
    { id: 'insp-3826', booking_id: 'b-3826', type: 'pre' },
  ];
  const builder = (table) => {
    const filters = {};
    const b = {
      select: () => b,
      eq: (col, val) => { filters[col] = val; return b; },
      maybeSingle: async () => ({ data: rows.find((r) => Object.entries(filters).every(([k, v]) => r[k] === v)) ?? null, error: null }),
    };
    return b;
  };
  return { __esModule: true, default: { from: jest.fn(builder) }, getCurrentUser: jest.fn() };
});

const { verifiedInspectionId } = require('./inspectionsApi');

test('keeps the cached id when it really belongs to this booking', async () => {
  expect(await verifiedInspectionId('insp-3826', 'b-3826', 'pre')).toBe('insp-3826');
});

test("a stale id from another booking's draft is replaced by this booking's inspection (the WC-2026-3826 / 8538 case)", async () => {
  expect(await verifiedInspectionId('insp-8538', 'b-3826', 'pre')).toBe('insp-3826');
});

test('no cached id: looks the inspection up by booking + type', async () => {
  expect(await verifiedInspectionId(null, 'b-3826', 'pre')).toBe('insp-3826');
});

test('nothing on the server yet: returns null (the caller then creates it)', async () => {
  expect(await verifiedInspectionId('insp-8538', 'b-new', 'pre')).toBeNull();
});
