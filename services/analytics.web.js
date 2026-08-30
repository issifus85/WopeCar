// Web build of services/analytics.js - Metro's platform-extension
// resolution picks this file over analytics.js automatically whenever the
// app is bundled for web (react-native-web target), so
// @react-native-firebase's native-only modules never get imported into the
// web bundle at all. Every export here mirrors analytics.js's signature
// exactly as a no-op, so every call site can import from './analytics'
// (or '@/services/analytics') without any Platform.OS branching of its own.
export async function logScreen() {}
export async function logSearchCars() {}
export async function logViewCar() {}
export async function logStartCheckout() {}
export async function logCheckoutStep() {}
export async function logSaveToCart() {}
export async function logBookingCompleted() {}
export async function logBookingCancelled() {}
export async function logWopecareSelected() {}
export async function logVendorRegistered() {}
export async function logCarListed() {}
export async function logSignUp() {}
export async function logLogin() {}
export async function setUserProperties() {}
export function logError() {}
export function setCrashlyticsUser() {}
