// The wizard draft is stored in expo-secure-store, which rejects values over ~2KB. A dropped write used to leave the PREVIOUS booking's draft
// in storage, which later resumed as the current inspection (wrong server id).
const store = {};
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k) => (k in store ? store[k] : null)),
  setItemAsync: jest.fn(async (k, v) => {
    if (v.length > 2048) throw new Error('Value being stored in SecureStore is larger than 2048 bytes');
    store[k] = v;
  }),
  deleteItemAsync: jest.fn(async (k) => { delete store[k]; }),
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

const { setDraft, getDraft } = require('./inspectionStorage');

const bigDraft = (bookingId, serverId) => ({
  bookingId, type: 'pre', serverId, mileage: 52000, fuelLevel: 'full', pendingSync: false,
  photos: Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`angle_${i}`, `file:///var/mobile/Containers/Data/Application/ABCDEF/Library/Caches/ImagePicker/photo-${i}.jpg`])),
  checklist: { notes: 'x'.repeat(300) },
  damagePoints: [],
  signatures: { renter: 'data:...', agent: 'data:...' },
});

beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; });

test('a small draft is stored in full', async () => {
  await setDraft({ bookingId: 'b1', type: 'pre', serverId: 's1', mileage: 1, photos: {}, checklist: {}, signatures: {} });
  expect((await getDraft()).serverId).toBe('s1');
});

test('an oversized draft still records which booking/inspection it is, instead of leaving the previous draft behind', async () => {
  await setDraft({ bookingId: 'old-booking', type: 'pre', serverId: 'old-inspection', photos: {}, checklist: {}, signatures: {} });
  await setDraft(bigDraft('new-booking', 'new-inspection'));
  const saved = await getDraft();
  expect(saved.bookingId).toBe('new-booking');
  expect(saved.serverId).toBe('new-inspection');
  expect(saved.serverId).not.toBe('old-inspection');
});
