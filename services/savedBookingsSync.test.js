jest.mock('./supabase', () => ({ __esModule: true, default: {} }));
const { mergeSavedBookings } = require('./savedBookingsSync');

test('adds drafts saved on the website and drops ones resolved elsewhere', () => {
  const local = [
    { id: 'l1', pendingInvoiceId: 'p1' },
    { id: 'l2', pendingInvoiceId: 'p2' },
  ];
  const server = [
    { id: 's1', pendingInvoiceId: 'p1' },
    { id: 's3', pendingInvoiceId: 'p3' },
  ];
  expect(mergeSavedBookings(local, server).map((b) => b.id)).toEqual(['l1', 's3']);
});
