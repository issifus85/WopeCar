// App <-> wopecar.com list continuity: the first sync of an account on a
// device must never drop cars added while signed out, and later syncs must
// let the server win so removals made on the website stick.
const mockStore = {};
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k) => (k in mockStore ? mockStore[k] : null)),
  setItemAsync: jest.fn(async (k, v) => { mockStore[k] = v; }),
  deleteItemAsync: jest.fn(async (k) => { delete mockStore[k]; }),
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

let mockServerRows = [];
let mockFailSelect = false;
const mockUpserts = [];
jest.mock('./supabase', () => ({
  __esModule: true,
  default: {
    from: () => ({
      select: () => ({
        eq: async () => (mockFailSelect ? { data: null, error: new Error('offline') } : { data: mockServerRows, error: null }),
      }),
      upsert: async (row) => { mockUpserts.push(row); return { error: null }; },
      delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    }),
  },
}));

const { reconcileCarIds, clearSyncMarkers } = require('./accountListSync');

beforeEach(async () => {
  mockServerRows = [];
  mockFailSelect = false;
  mockUpserts.length = 0;
  await clearSyncMarkers();
});

test('first sync unions local and server and pushes local-only cars', async () => {
  mockServerRows = [{ car_id: 'b' }];
  const merged = await reconcileCarIds('saved_cars', 'u1', ['a', 'b']);
  expect(merged.sort()).toEqual(['a', 'b']);
  expect(mockUpserts).toEqual([{ user_id: 'u1', car_id: 'a' }]);
});

test('later syncs take the server list as-is', async () => {
  mockServerRows = [{ car_id: 'a' }];
  await reconcileCarIds('saved_cars', 'u1', ['a']);
  mockServerRows = [];
  const merged = await reconcileCarIds('saved_cars', 'u1', ['a']);
  expect(merged).toEqual([]);
});

test('a different account on the same device unions again', async () => {
  await reconcileCarIds('cart_items', 'u1', []);
  mockServerRows = [];
  const merged = await reconcileCarIds('cart_items', 'u2', ['x']);
  expect(merged).toEqual(['x']);
});

test('server unreachable leaves the local list alone', async () => {
  mockFailSelect = true;
  expect(await reconcileCarIds('cart_items', 'u1', ['a'])).toBeNull();
});
