import Constants from 'expo-constants';
import analytics from '@react-native-firebase/analytics';
import crashlytics from '@react-native-firebase/crashlytics';

// Native (iOS/Android) implementation - this file is never bundled for web
// (see analytics.web.js, a same-shaped no-op sibling Metro picks instead
// there), since @react-native-firebase's native modules aren't available
// in a web bundle at all.
//
// Only logs in production and staging, never in development, to keep event
// data clean. Reads APP_ENV via Constants.expoConfig.extra (same pattern
// components/EnvironmentBanner.js already uses) rather than
// process.env.APP_ENV directly - Expo does not inline arbitrary
// process.env.* vars into the runtime bundle (only EXPO_PUBLIC_-prefixed
// ones), so a bare process.env.APP_ENV read here would always be
// `undefined` at runtime, making shouldLog permanently true - including in
// local development.
const shouldLog = Constants.expoConfig?.extra?.APP_ENV !== 'development';

// ─── SCREEN TRACKING ──────────────────────────────────
export async function logScreen(screenName) {
  if (!shouldLog) return;
  await analytics().logScreenView({
    screen_name: screenName,
    screen_class: screenName,
  });
}

// ─── SEARCH & BROWSE ──────────────────────────────────
export async function logSearchCars({ location, carType, startDate, endDate }) {
  if (!shouldLog) return;
  await analytics().logEvent('search_cars', {
    location: location || 'not_set',
    car_type: carType || 'all',
    start_date: startDate || 'not_set',
    end_date: endDate || 'not_set',
  });
}

export async function logViewCar({ carId, carName, carType, pricePerDay, location }) {
  if (!shouldLog) return;
  await analytics().logEvent('view_car', {
    car_id: carId,
    car_name: carName,
    car_type: carType || 'not_set',
    price_per_day: pricePerDay,
    location: location || 'not_set',
  });
}

// ─── BOOKING FLOW ──────────────────────────────────────
export async function logStartCheckout({ carId, carName, totalDays, estimatedCost }) {
  if (!shouldLog) return;
  await analytics().logEvent('start_checkout', {
    car_id: carId,
    car_name: carName,
    total_days: totalDays,
    estimated_cost: estimatedCost,
  });
}

export async function logCheckoutStep({ step, stepName, carId }) {
  if (!shouldLog) return;
  await analytics().logEvent('checkout_step', {
    step_number: step,
    step_name: stepName,
    car_id: carId,
  });
}

export async function logSaveToCart({ carId, carName, totalCost, totalDays }) {
  if (!shouldLog) return;
  await analytics().logEvent('save_to_cart', {
    car_id: carId,
    car_name: carName,
    total_cost: totalCost,
    total_days: totalDays,
  });
}

export async function logBookingCompleted({
  bookingRef, carId, carName, totalCost,
  totalDays, driveType, wopecareSelected, paymentMethod,
}) {
  if (!shouldLog) return;
  await analytics().logEvent('booking_completed', {
    booking_ref: bookingRef,
    car_id: carId,
    car_name: carName,
    total_cost: totalCost,
    total_days: totalDays,
    drive_type: driveType || 'self_drive',
    wopecare_selected: wopecareSelected ? 'yes' : 'no',
    payment_method: paymentMethod || 'paystack',
  });
  // Also logged as a purchase event for Firebase's built-in revenue tracking.
  await analytics().logPurchase({
    currency: 'GHS',
    value: totalCost,
    transaction_id: bookingRef,
    items: [{
      item_id: carId,
      item_name: carName,
      quantity: totalDays,
      price: totalCost / totalDays,
    }],
  });
}

export async function logBookingCancelled({ bookingRef, carId, reason }) {
  if (!shouldLog) return;
  await analytics().logEvent('booking_cancelled', {
    booking_ref: bookingRef,
    car_id: carId,
    reason: reason || 'not_specified',
  });
}

// ─── WOPECARE ─────────────────────────────────────────
export async function logWopecareSelected({ plan, dailyRate, totalCost, carId }) {
  if (!shouldLog) return;
  await analytics().logEvent('wopecare_selected', {
    plan,
    daily_rate: dailyRate,
    total_cost: totalCost,
    car_id: carId,
  });
}

// ─── VENDOR ──────────────────────────────────────────
export async function logVendorRegistered({ vendorId }) {
  if (!shouldLog) return;
  await analytics().logEvent('vendor_registered', {
    vendor_id: vendorId,
  });
}

export async function logCarListed({ carId, carName, carType, region, pricePerDay }) {
  if (!shouldLog) return;
  await analytics().logEvent('car_listed', {
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
  await analytics().logSignUp({ method: method || 'email' });
}

export async function logLogin({ method }) {
  if (!shouldLog) return;
  await analytics().logLogin({ method: method || 'email' });
}

export async function setUserProperties({ userId, userType, region }) {
  if (!shouldLog) return;
  await analytics().setUserId(userId);
  await analytics().setUserProperties({
    user_type: userType || 'renter',
    region: region || 'not_set',
  });
}

// ─── CRASHLYTICS ─────────────────────────────────────
export function logError(error, context = '') {
  crashlytics().recordError(error);
  if (context) crashlytics().log(context);
}

export function setCrashlyticsUser(userId) {
  crashlytics().setUserId(userId);
}
