// The device keeps ONE agreement draft. It must only resume for the booking it belongs to - otherwise opening another booking's agreement
// showed (and later submitted) the previous booking's details.
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

const { setDraft, getDraft } = require('./rentalAgreementStorage');

beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; });

test('resumes the draft for the same booking', async () => {
  await setDraft({ bookingId: 'b1', fields: { lesseeName: 'Ama' }, signatures: { client: 'data:x' }, agreementId: 'a1' });
  const draft = await getDraft('b1');
  expect(draft.fields.lesseeName).toBe('Ama');
  expect(draft.signatures).toEqual({ client: null, representative: null }); // signatures are never persisted
});

test("ignores another booking's draft", async () => {
  await setDraft({ bookingId: 'b1', fields: { lesseeName: 'Ama' }, signatures: {}, agreementId: 'a1' });
  expect(await getDraft('b2')).toBeNull();
});

test('a draft saved before drafts carried a booking id is ignored rather than trusted', async () => {
  store.wopecar_rental_agreement_draft = JSON.stringify({ fields: { lesseeName: 'Old' }, agreementId: 'a0' });
  expect(await getDraft('b1')).toBeNull();
});

test('an oversized draft still records which booking it is, instead of leaving the previous one behind', async () => {
  await setDraft({ bookingId: 'old', fields: { lesseeName: 'Old' }, signatures: {}, agreementId: 'a-old' });
  await setDraft({ bookingId: 'new', fields: { lesseeName: 'N'.repeat(3000) }, signatures: {}, agreementId: 'a-new' });
  expect(await getDraft('old')).toBeNull();
  const saved = await getDraft('new');
  expect(saved.agreementId).toBe('a-new');
});
