import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as vendorCarsApi from '../services/vendorCarsApi';
import * as vendorBookingsApi from '../services/vendorBookingsApi';
import { DEFAULT_AVAILABILITY_SETTINGS } from '../services/vendorMockData';
import { useAuth } from './AuthContext';

const EMPTY_VENDOR_DATA = {
  cars: [],
  earningsHistory: [],
  bookingRequests: [],
  bookingHistory: [],
  blockedDates: {},
};

function monthKeyFor(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Real 6-month (trailing, current month last) earnings trend for the
// dashboard's bar chart - replaces the old buildMockEarningsHistory() seed.
// Same {key,label,total} shape, same Confirmed/Completed-only earned-income
// rule as currentMonthEarnings below, just grouped by month instead of
// filtered to one.
function deriveEarningsHistory(bookingHistory) {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: monthKeyFor(d), label: d.toLocaleDateString(undefined, { month: 'short' }), total: 0 });
  }
  const totalsByKey = Object.fromEntries(months.map((m) => [m.key, 0]));
  bookingHistory.forEach((b) => {
    if (!b.startDate || (b.status !== 'Confirmed' && b.status !== 'Completed')) return;
    const key = monthKeyFor(new Date(b.startDate));
    if (key in totalsByKey) totalsByKey[key] += (b.earnings ?? 0);
  });
  return months.map((m) => ({ ...m, total: totalsByKey[m.key] }));
}

const VendorContext = createContext(null);

// A single slow/hung call here (most likely getCurrentUser()'s
// supabase.auth.getUser() - a real network round-trip with no built-in
// timeout, inside every getVendorProfile() call below) must never block
// Vendor Mode from loading for the rest of the app session. 12s comfortably
// covers a slow mobile network without making a genuine failure feel
// broken. Unlike a plain `promise.catch(() => fallback)`, this also reports
// whether the fallback was actually used (`failed: true`) - a real vendor
// with real cars/bookings whose fetch merely timed out once must never be
// silently, indistinguishably treated as "a brand-new vendor with zero
// cars" (see the `hasLoadError` derived value below, and its use in
// app/vendor/(tabs)/index.js to avoid showing that vendor a "list your
// first car" welcome card they've already outgrown).
function withTimeout(promise, fallback, ms = 12000) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ value: fallback, failed: true });
    }, ms);
    promise
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ value, failed: false });
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ value: fallback, failed: true });
      });
  });
}

export function VendorProvider({ children }) {
  const { user } = useAuth();
  const [data, setData] = useState(EMPTY_VENDOR_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [vendorProfile, setVendorProfile] = useState(null);
  const [hasLoadError, setHasLoadError] = useState(false);

  // Resolves the vendor profile once, then hands it to getMyCars/
  // getVendorBookingsSplit instead of letting each independently re-resolve
  // it. They used to each call getVendorProfile() (and so getCurrentUser(),
  // a real supabase.auth.getUser() network round-trip) on their own, meaning
  // a single loadVendorData() call fired 3 concurrent, fully independent
  // auth+vendor lookups. On a cold start racing the Supabase session
  // restore, one of those three could transiently fail on its own while the
  // others succeeded - most visibly when it was the direct getVendorProfile
  // call, which silently bounced a real, approved vendor with real cars to
  // the "Become a Vendor" screen even though their cars/bookings had loaded
  // fine moments earlier. A single shared lookup makes that class of
  // disagreement structurally impossible, and is strictly less work.
  const loadVendorData = useCallback(async () => {
    const profileResult = await withTimeout(vendorCarsApi.getVendorProfile(), null);
    const vendor = profileResult.value;
    const [carsResult, bookingsResult] = await Promise.all([
      vendor ? withTimeout(vendorCarsApi.getMyCars(vendor), []) : { value: [], failed: false },
      vendor ? withTimeout(vendorBookingsApi.getVendorBookingsSplit(vendor), { bookingRequests: [], bookingHistory: [] }) : { value: { bookingRequests: [], bookingHistory: [] }, failed: false },
    ]);
    const cars = carsResult.value;
    const bookingsSplit = bookingsResult.value;
    const blockedDatesResult = await withTimeout(vendorCarsApi.getBlockedDatesForCars(cars.map((c) => c.id)), {});
    const earningsHistory = deriveEarningsHistory(bookingsSplit.bookingHistory);
    setData({ cars, blockedDates: blockedDatesResult.value, earningsHistory, ...bookingsSplit });
    setVendorProfile(vendor);
    setHasLoadError(profileResult.failed || carsResult.failed || bookingsResult.failed || blockedDatesResult.failed);
  }, []);

  // Depends on user?.id (not the whole `user` object, which may get a new
  // identity on every AuthContext render even for the same session) so a
  // slow cold-start session restore - the most likely real cause of a
  // vendor's own fetch racing an not-yet-ready auth.uid() - gets one
  // automatic retry the moment auth actually resolves, instead of the
  // permanent, un-refreshable empty state this previously produced (empty
  // dependency array, fired exactly once at VendorProvider mount).
  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    loadVendorData().finally(() => setIsLoading(false));
  }, [user?.id, loadVendorData]);

  // Manual retry path - wired to the Dashboard's pull-to-refresh and its
  // "Couldn't load your data" banner, so a vendor who hits a one-off fetch
  // failure (see withTimeout above) isn't stuck until they relaunch the app.
  const refreshVendorData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await loadVendorData();
    } finally {
      setIsRefreshing(false);
    }
  }, [loadVendorData]);

  // Re-fetches just the bookings split from Supabase - called after
  // accept/decline (below) so the requests list, history, and earnings
  // chart all reflect the real write immediately, without a full app reload.
  const refreshBookings = useCallback(async () => {
    const bookingsSplit = await vendorBookingsApi.getVendorBookingsSplit();
    setData((prev) => ({ ...prev, ...bookingsSplit, earningsHistory: deriveEarningsHistory(bookingsSplit.bookingHistory) }));
    return bookingsSplit;
  }, []);

  // Called by app/vendor/apply.js right after a successful application -
  // VendorProvider lives above the whole Stack and doesn't remount on
  // navigation, so without this the Dashboard's own vendorProfile-null guard
  // would immediately bounce the freshly-approved user back to the
  // application screen in a loop.
  const refreshVendorProfile = useCallback(async () => {
    const profile = await vendorCarsApi.getVendorProfile().catch(() => null);
    setVendorProfile(profile);
    return profile;
  }, []);

  const updateCar = useCallback(async (carId, patch) => {
    const updated = await vendorCarsApi.updateCarListing(carId, patch);
    setData((prev) => ({
      ...prev,
      cars: prev.cars.map((c) => (c.id === carId ? updated : c)),
    }));
    return updated;
  }, []);

  // Real per-car columns (cars.min_booking_days/advance_notice/booking_window,
  // added back in the original cars migration but never surfaced in any
  // Vendor Mode UI until now) - falls back to DEFAULT_AVAILABILITY_SETTINGS
  // only while `cars` is still loading, not as a per-car override store.
  const getAvailabilitySettings = useCallback((carId) => {
    const car = data.cars.find((c) => c.id === carId);
    if (!car) return DEFAULT_AVAILABILITY_SETTINGS;
    return {
      advanceNoticeDays: car.advanceNoticeDays ?? DEFAULT_AVAILABILITY_SETTINGS.advanceNoticeDays,
      bookingWindowMonths: car.bookingWindowMonths ?? DEFAULT_AVAILABILITY_SETTINGS.bookingWindowMonths,
      minBookingDays: car.minBookingDays ?? DEFAULT_AVAILABILITY_SETTINGS.minBookingDays,
    };
  }, [data.cars]);

  // Just a real Supabase write via the existing updateCar() - settings are
  // plain columns on `cars`, not a separate settings store.
  const setAvailabilitySettings = useCallback((carId, settings) => updateCar(carId, settings), [updateCar]);

  // Real `availability` rows (status='blocked'), not local storage - see
  // vendorCarsApi.setBlockedDates for the insert/delete diffing. Updates
  // context state only after the write succeeds, so a failed save doesn't
  // leave the UI showing a date as blocked that never actually persisted.
  const setBlockedDates = useCallback(async (carId, dates) => {
    await vendorCarsApi.setBlockedDates(carId, dates);
    setData((prev) => ({ ...prev, blockedDates: { ...prev.blockedDates, [carId]: dates } }));
  }, []);

  // Real vendors.business_info/payout_method write - replaces the old
  // local-only vendorSettings.businessInfo/.payoutMethod. Updates the
  // vendorProfile state directly (not `data`) since that's already where
  // the rest of the vendor row lives.
  const saveVendorProfile = useCallback(async (patch) => {
    const updated = await vendorCarsApi.updateVendorProfile(patch);
    setVendorProfile(updated);
    return updated;
  }, []);

  // Every new listing starts Pending, with no bypass - it only goes live
  // once WopeCar support has completed the photo verification/vetting visit
  // scheduled in the Add Car wizard and approved it (createCar() forces
  // status='pending' server-side regardless of what's passed here). There is
  // intentionally no in-app action that publishes a car automatically (see
  // app/vendor/add-car/review.js's submit notice); flipping Pending->Active
  // is the one thing the existing Car Management "Active Listing" toggle
  // still can't do (it's disabled while a car is Pending).
  const addCar = useCallback(async (carData) => {
    const car = await vendorCarsApi.createCar(carData);
    setData((prev) => ({ ...prev, cars: [car, ...prev.cars] }));
    return car;
  }, []);

  // Real Supabase write (bookings.status + vendor_accepted), not local
  // state - see services/vendorBookingsApi.js. Optimistically moves the
  // item from requests into history immediately using the server's own
  // response, then does a background refresh in case anything else on the
  // list changed concurrently (another device, admin action, etc.).
  const respondToBookingRequest = useCallback(async (requestId, { accept, reason = null }) => {
    const resolved = accept
      ? await vendorBookingsApi.acceptBookingRequest(requestId)
      : await vendorBookingsApi.declineBookingRequest(requestId, reason);
    setData((prev) => ({
      ...prev,
      bookingRequests: prev.bookingRequests.filter((r) => r.id !== requestId),
      bookingHistory: [resolved, ...prev.bookingHistory],
    }));
    refreshBookings().catch(() => {});
    return resolved;
  }, [refreshBookings]);

  const currentMonthKey = useMemo(() => monthKeyFor(new Date()), []);

  // Only Confirmed/Completed counts as earned (a still-pending request
  // isn't income yet), same rule as deriveEarningsHistory and
  // carEarningsThisMonth below.
  const currentMonthEarnings = useMemo(() => {
    return data.bookingHistory.reduce((sum, b) => {
      if (!b.startDate || (b.status !== 'Confirmed' && b.status !== 'Completed')) return sum;
      if (monthKeyFor(new Date(b.startDate)) !== currentMonthKey) return sum;
      return sum + (b.earnings ?? 0);
    }, 0);
  }, [data.bookingHistory, currentMonthKey]);

  const bookingsThisMonthCount = useMemo(() => {
    return data.bookingHistory.filter((b) => {
      if (!b.startDate) return false;
      return monthKeyFor(new Date(b.startDate)) === currentMonthKey;
    }).length;
  }, [data.bookingHistory, currentMonthKey]);

  // Per-car earnings for the current month, keyed by carId - used by My
  // Fleet's "earned this month" line. Only confirmed/completed bookings
  // count as real earnings (a still-pending request isn't income yet).
  const carEarningsThisMonth = useMemo(() => {
    const totals = {};
    data.bookingHistory.forEach((b) => {
      if (!b.startDate || (b.status !== 'Confirmed' && b.status !== 'Completed')) return;
      if (monthKeyFor(new Date(b.startDate)) !== currentMonthKey) return;
      totals[b.carId] = (totals[b.carId] ?? 0) + (b.earnings ?? 0);
    });
    return totals;
  }, [data.bookingHistory, currentMonthKey]);

  const value = useMemo(() => ({
    ...data,
    isLoading,
    isRefreshing,
    hasLoadError,
    vendorProfile,
    isVendorApproved: !!vendorProfile?.isApproved,
    refreshVendorProfile,
    refreshVendorData,
    fleetSize: data.cars.length,
    currentMonthEarnings,
    bookingsThisMonthCount,
    carEarningsThisMonth,
    getAvailabilitySettings,
    updateCar,
    addCar,
    setAvailabilitySettings,
    setBlockedDates,
    saveVendorProfile,
    respondToBookingRequest,
    refreshBookings,
  }), [
    data, isLoading, isRefreshing, hasLoadError, vendorProfile, refreshVendorProfile, refreshVendorData, currentMonthEarnings, bookingsThisMonthCount, carEarningsThisMonth, getAvailabilitySettings,
    updateCar, addCar, setAvailabilitySettings, setBlockedDates, saveVendorProfile,
    respondToBookingRequest, refreshBookings,
  ]);

  return <VendorContext.Provider value={value}>{children}</VendorContext.Provider>;
}

export function useVendor() {
  const context = useContext(VendorContext);
  if (!context) {
    throw new Error('useVendor must be used within a VendorProvider');
  }
  return context;
}
