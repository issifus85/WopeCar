import { clearCartIds } from './cartStorage';
import { clearBookings } from './bookingsStorage';
import { clearFavoriteIds } from './favoritesStorage';
import { clearInboxData } from './inboxStorage';
import { clearDraft as clearRentalAgreementDraft } from './rentalAgreementStorage';
import { clearDraft as clearInspectionDraft } from './inspectionStorage';
import { clearVendorData } from './vendorStorage';

/**
 * Wipes every per-user local cache (cart, bookings, favorites, inbox,
 * in-progress inspection/rental-agreement drafts, vendor-mode data) on
 * sign-out. Without this, a second account signing in on the same
 * browser/device would inherit whatever the previous account left behind -
 * confirmed live: a freshly-logged-in test account showed another
 * account's cached bookings until a fresh Supabase fetch happened to
 * overwrite that one specific piece, and several of these keys (inbox,
 * vendor data, drafts) have no such overwrite-on-fetch path at all, so
 * they'd persist indefinitely otherwise.
 *
 * Deliberately leaves `wopecar_settings` (services/settingsStorage.js)
 * alone - dark mode/currency/units etc. are device-level UI preferences,
 * not per-user data, and clearing them on every sign-out would just be an
 * annoying UX regression for shared-device use with no privacy benefit.
 * Supabase's own session token is a separate key already cleared by
 * supabase.auth.signOut() (called inside services/supabaseAuthApi.js's
 * logout()) - not this file's concern.
 *
 * Every *Storage.js clear function already swallows its own platform
 * differences (web localStorage vs native SecureStore) and any read/parse
 * errors - failures here are non-fatal by the same logic as everywhere
 * else these modules are used, so this runs all of them best-effort rather
 * than letting one failure block sign-out.
 */
export async function clearLocalUserData() {
  await Promise.allSettled([
    clearCartIds(),
    clearBookings(),
    clearFavoriteIds(),
    clearInboxData(),
    clearRentalAgreementDraft(),
    clearInspectionDraft(),
    clearVendorData(),
  ]);
}
