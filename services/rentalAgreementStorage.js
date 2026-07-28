import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const AGREEMENT_DRAFT_KEY = 'wopecar_rental_agreement_draft';

// Same convention as every other *Storage.js file (inspectionStorage,
// bookingsStorage, etc) - autosaved locally on every field change so a
// killed app or lost connection resumes exactly where it left off.
async function readRaw() {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? window.localStorage.getItem(AGREEMENT_DRAFT_KEY) : null;
  }
  return SecureStore.getItemAsync(AGREEMENT_DRAFT_KEY);
}

async function writeRaw(value) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.setItem(AGREEMENT_DRAFT_KEY, value);
    return;
  }
  return SecureStore.setItemAsync(AGREEMENT_DRAFT_KEY, value);
}

export async function getDraft() {
  try {
    const raw = await readRaw();
    if (!raw) return null;
    // signatures is stripped before every write (see setDraft) - restore an
    // empty shape so draft.signatures.client/representative is always safe
    // to read after a resume.
    return { ...JSON.parse(raw), signatures: { client: null, representative: null } };
  } catch {
    return null;
  }
}

export async function setDraft(draft) {
  // Signatures are base64 data URIs (tens of KB - see components/
  // SignaturePad.js's onOK) - expo-secure-store's native Keychain/Keystore
  // backend rejects values above ~2KB, so persisting them here would
  // silently fail to write the *entire* draft on native the moment a
  // signature is captured (confirmed as a real bug in the near-identical
  // inspectionStorage.js, fixed there the same way). Signatures stay
  // in-memory only for the current session; if the app is killed mid-form
  // the user just re-signs rather than the whole draft failing to resume.
  const { signatures, ...persistable } = draft;
  await writeRaw(JSON.stringify(persistable));
}

export async function clearDraft() {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.removeItem(AGREEMENT_DRAFT_KEY);
    return;
  }
  return SecureStore.deleteItemAsync(AGREEMENT_DRAFT_KEY);
}
