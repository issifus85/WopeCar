import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const INSPECTION_DRAFT_KEY = 'wopecar_inspection_draft';

// Same convention as every other *Storage.js file (bookingsStorage,
// favoritesStorage, etc). Unlike CheckoutContext (in-memory only), the VIR
// wizard's draft is persisted on every change so a killed app or lost
// connection resumes exactly where it left off - see contexts/
// InspectionContext.js. Only lightweight metadata and local picker/camera
// URIs are ever stored here, never base64 blobs - expo-secure-store
// (Keychain/Keystore-backed on native) rejects values above ~2KB, the same
// constraint documented in services/inboxStorage.js.
async function readRaw() {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? window.localStorage.getItem(INSPECTION_DRAFT_KEY) : null;
  }
  return SecureStore.getItemAsync(INSPECTION_DRAFT_KEY);
}

async function writeRaw(value) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.setItem(INSPECTION_DRAFT_KEY, value);
    return;
  }
  return SecureStore.setItemAsync(INSPECTION_DRAFT_KEY, value);
}

export async function getDraft() {
  try {
    const raw = await readRaw();
    if (!raw) return null;
    // signatures is stripped before every write (see setDraft) - restore an
    // empty shape so draft.signatures.renter/agent is always safe to read,
    // never undefined, after a resume.
    return { ...JSON.parse(raw), signatures: { renter: null, agent: null } };
  } catch {
    return null;
  }
}

export async function setDraft(draft) {
  // Signatures are base64 data URIs (tens of KB - see components/
  // SignaturePad.js's onOK) - expo-secure-store's native Keychain/Keystore
  // backend rejects values above ~2KB, so persisting them here would
  // silently fail to write the *entire* draft on native the moment a
  // signature is captured. Signatures stay in-memory only for the current
  // session; if the app is killed mid-wizard the user just re-signs (a few
  // seconds) rather than the whole draft failing to resume.
  const { signatures, ...persistable } = draft;
  await writeRaw(JSON.stringify(persistable));
}

export async function clearDraft() {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.removeItem(INSPECTION_DRAFT_KEY);
    return;
  }
  return SecureStore.deleteItemAsync(INSPECTION_DRAFT_KEY);
}
