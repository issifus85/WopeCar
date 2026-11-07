import Constants from 'expo-constants';
import {
  getAnalytics,
  logEvent as fbLogEvent,
  logScreenView as fbLogScreenView,
  logPurchase as fbLogPurchase,
  logSignUp as fbLogSignUp,
  logLogin as fbLogLogin,
  setUserId as fbSetAnalyticsUserId,
  setUserProperties as fbSetUserProperties,
} from '@react-native-firebase/analytics';
import {
  getCrashlytics,
  recordError as fbRecordError,
  log as fbCrashlyticsLog,
  setUserId as fbSetCrashlyticsUserId,
} from '@react-native-firebase/crashlytics';

// Native (iOS/Android) implementation - this file is never bundled for web
// (see analytics.web.js, a same-shaped no-op sibling Metro picks instead
// there), since @react-native-firebase's native modules aren't available
// in a web bundle at all.
//
// @react-native-firebase v26 ships the fully modular API only - no
// `import analytics from '@react-native-firebase/analytics'; analytics()`
// default export exists anymore (confirmed by reading the installed
// package's own source after a real device crash: "TypeError: undefined
// is not a function" at setCrashlyticsUser, because `crashlytics` was
// undefined - there was never a default export to import). The real shape
// is `getAnalytics()`/`getCrashlytics()` returning an instance, passed as
// the first argument to free functions like `logEvent(analytics, name,
// params)`. Every RNFB import here is aliased (fb-prefixed) since several
// names collide with this file's own exports (logSignUp, logLogin,
// setUserProperties) - callers of this service didn't need to change.
//
// Only logs in production and staging, never in development, to keep
// event data clean. Reads APP_ENV via Constants.expoConfig.extra (same
// pattern components/EnvironmentBanner.js already uses) rather than
// process.env.APP_ENV directly - Expo does not inline arbitrary
// process.env.* vars into the runtime bundle (only EXPO_PUBLIC_-prefixed
// ones), so a bare process.env.APP_ENV read here would always be
// `undefined` at runtime, making shouldLog permanently true - including in
// local development.
const shouldLog = Constants.expoConfig?.extra?.APP_ENV !== 'development';

// Event names follow GA4's recommended e-commerce vocabulary (search,
// view_item, add_to_cart, begin_checkout, add_payment_info, purchase,
// refund, generate_lead, sign_up, login) and match the website's
// lib/analytics.ts exactly, so web and app land in the same GA4 funnel
// and e-commerce reports and the weekly report can show one funnel with
// a platform split. Function names are unchanged so callers didn't move.
// The old custom names (search_cars, view_car, start_checkout,
// save_to_cart, booking_completed) are no longer sent.
const CURRENCY = 'GHS';
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const carItem = ({ carId, carName, carType, pricePerDay, quantity, driveType }) => ({
  item_id: String(carId ?? ''),
  item_name: carName ?? '',
  item_category: driveType === 'chauffeur' || driveType === 'Chauffeur' ? 'chauffeured' : 'self_drive',
  item_category2: carType || undefined,
  price: pricePerDay != null ? round2(pricePerDay) : undefined,
  quantity: quantity ?? 1,
});

// ─── SCREEN TRACKING ──────────────────────────────────
// Called automatically for every route by components/ScreenViewTracker.js.
export async function logScreen(screenName, screenClass) {
  if (!shouldLog) return;
  await fbLogScreenView(getAnalytics(), {
    screen_name: screenName,
    screen_class: screenClass || screenName,
  });
}

// ─── SEARCH & BROWSE ──────────────────────────────────
export async function logSearchCars({ location, carType, startDate, endDate }) {
  if (!shouldLog) return;
  await fbLogEvent(getAnalytics(), 'search', {
    search_term: location || 'any',
    vehicle_type: carType || 'all',
    start_date: startDate || undefined,
    end_date: endDate || undefined,
  });
}

export async function logViewCar({ carId, carName, carType, pricePerDay, location }) {
  if (!shouldLog) return;
  await fbLogEvent(getAnalytics(), 'view_item', {
    currency: CURRENCY,
    value: round2(pricePerDay),
    location: location || undefined,
    items: [carItem({ carId, carName, carType, pricePerDay })],
  });
}

// ─── BOOKING FLOW ──────────────────────────────────────
export async function logStartCheckout({ carId, carName, totalDays, estimatedCost }) {
  if (!shouldLog) return;
  await fbLogEvent(getAnalytics(), 'begin_checkout', {
    currency: CURRENCY,
    value: round2(estimatedCost),
    items: [carItem({ carId, carName, quantity: totalDays, pricePerDay: totalDays ? estimatedCost / totalDays : undefined })],
  });
}

export async function logCheckoutStep({ step, stepName, carId }) {
  if (!shouldLog) return;
  await fbLogEvent(getAnalytics(), 'checkout_progress', {
    step,
    step_name: stepName,
    car_id: carId,
  });
}

export async function logSaveToCart({ carId, carName, totalCost, totalDays }) {
  if (!shouldLog) return;
  await fbLogEvent(getAnalytics(), 'add_to_cart', {
    currency: CURRENCY,
    value: round2(totalCost),
    items: [carItem({ carId, carName, quantity: totalDays, pricePerDay: totalDays ? totalCost / totalDays : undefined })],
  });
}

/**
 * `value` is revenue, not the amount charged: the refundable security
 * deposit is subtracted (same rule as the website's purchase event) so
 * Google Ads optimises toward money WopeCar keeps. The deposit still goes
 * out as its own parameter for reconciliation against Paystack.
 */
export async function logBookingCompleted({
  bookingRef, carId, carName, carType, totalCost, securityDeposit = 0,
  totalDays, driveType, wopecareSelected, withDriverSelected, paymentMethod, promoCode,
}) {
  if (!shouldLog) return;
  const revenue = round2(totalCost - (securityDeposit || 0));
  await fbLogPurchase(getAnalytics(), {
    currency: CURRENCY,
    value: revenue,
    transaction_id: bookingRef,
    coupon: promoCode || undefined,
    security_deposit: round2(securityDeposit),
    payment_type: paymentMethod || 'paystack',
    wopecare_selected: wopecareSelected ? 'yes' : 'no',
    with_driver: withDriverSelected ? 'yes' : 'no',
    items: [carItem({ carId, carName, carType, driveType, quantity: totalDays, pricePerDay: totalDays ? revenue / totalDays : revenue })],
  });
}

export async function logBookingCancelled({ bookingRef, carId, reason }) {
  if (!shouldLog) return;
  await fbLogEvent(getAnalytics(), 'refund', {
    currency: CURRENCY,
    transaction_id: bookingRef,
    reason: reason || 'not_specified',
    items: [carItem({ carId })],
  });
}

// ─── WOPECARE ─────────────────────────────────────────
export async function logWopecareSelected({ plan, dailyRate, totalCost, carId }) {
  if (!shouldLog) return;
  await fbLogEvent(getAnalytics(), 'wopecare_selected', {
    plan,
    daily_rate: dailyRate,
    total_cost: totalCost,
    car_id: carId,
  });
}

// ─── VENDOR ──────────────────────────────────────────
export async function logVendorRegistered({ vendorId }) {
  if (!shouldLog) return;
  await fbLogEvent(getAnalytics(), 'vendor_registered', {
    vendor_id: vendorId,
  });
}

export async function logCarListed({ carId, carName, carType, region, pricePerDay }) {
  if (!shouldLog) return;
  await fbLogEvent(getAnalytics(), 'car_listed', {
    car_id: carId,
    car_name: carName,
    car_type: carType || 'not_set',
    region: region || 'not_set',
    price_per_day: pricePerDay,
  });
}

// ─── USER ─────────────────────────────────────────────
export async function logSignUp({ method }) {
  if (!shouldLog) return;
  await fbLogSignUp(getAnalytics(), { method: method || 'email' });
}

export async function logLogin({ method }) {
  if (!shouldLog) return;
  await fbLogLogin(getAnalytics(), { method: method || 'email' });
}

export async function setUserProperties({ userId, userType, region }) {
  if (!shouldLog) return;
  const analytics = getAnalytics();
  await fbSetAnalyticsUserId(analytics, userId);
  await fbSetUserProperties(analytics, {
    user_type: userType || 'renter',
    region: region || 'not_set',
  });
}

// ─── CRASHLYTICS ─────────────────────────────────────
// Crashlytics deliberately always reports, even when shouldLog is false
// (development) - a crash is worth capturing regardless of environment,
// unlike a marketing/product analytics event.
export function logError(error, context = '') {
  const crashlytics = getCrashlytics();
  fbRecordError(crashlytics, error);
  if (context) fbCrashlyticsLog(crashlytics, context);
}

export function setCrashlyticsUser(userId) {
  fbSetCrashlyticsUserId(getCrashlytics(), userId);
}
