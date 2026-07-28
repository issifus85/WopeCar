import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as vendorStorage from '../services/vendorStorage';
import {
  buildMockFleet,
  buildMockEarningsHistory,
  buildMockBookingRequests,
  buildMockBookingHistory,
  DEFAULT_AVAILABILITY_SETTINGS,
} from '../services/vendorMockData';

const EMPTY_VENDOR_DATA = {
  cars: [],
  earningsHistory: [],
  bookingRequests: [],
  bookingHistory: [],
  availabilitySettings: {},
  blockedDates: {},
  vendorSettings: {},
  vendorInspections: {},
};

function monthKeyFor(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const VendorContext = createContext(null);

export function VendorProvider({ children }) {
  const [data, setData] = useState(EMPTY_VENDOR_DATA);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    vendorStorage.getVendorData().then((loaded) => {
      // First-ever load: seed the mock fleet/earnings/bookings so the
      // dashboard and every other vendor screen have something real to
      // show immediately, matching InboxContext's "seed once, persist
      // after" pattern for its permanent Support conversation.
      if (loaded.cars.length === 0) {
        const seeded = {
          cars: buildMockFleet(),
          earningsHistory: buildMockEarningsHistory(),
          bookingRequests: buildMockBookingRequests(),
          bookingHistory: buildMockBookingHistory(),
          availabilitySettings: {},
          blockedDates: {},
          vendorSettings: {},
          vendorInspections: {},
        };
        vendorStorage.setVendorData(seeded);
        setData(seeded);
      } else {
        setData(loaded);
      }
      setIsLoading(false);
    });
  }, []);

  const updateCar = useCallback((carId, patch) => {
    setData((prev) => {
      const cars = prev.cars.map((c) => (c.id === carId ? { ...c, ...patch } : c));
      const next = { ...prev, cars };
      vendorStorage.setVendorData(next);
      return next;
    });
  }, []);

  const getAvailabilitySettings = useCallback((carId) => {
    return data.availabilitySettings[carId] ?? DEFAULT_AVAILABILITY_SETTINGS;
  }, [data.availabilitySettings]);

  const setAvailabilitySettings = useCallback((carId, settings) => {
    setData((prev) => {
      const availabilitySettings = { ...prev.availabilitySettings, [carId]: settings };
      const next = { ...prev, availabilitySettings };
      vendorStorage.setVendorData(next);
      return next;
    });
  }, []);

  const setBlockedDates = useCallback((carId, dates) => {
    setData((prev) => {
      const blockedDates = { ...prev.blockedDates, [carId]: dates };
      const next = { ...prev, blockedDates };
      vendorStorage.setVendorData(next);
      return next;
    });
  }, []);

  const setVendorSettings = useCallback((patch) => {
    setData((prev) => {
      const vendorSettings = { ...prev.vendorSettings, ...patch };
      const next = { ...prev, vendorSettings };
      vendorStorage.setVendorData(next);
      return next;
    });
  }, []);

  // Every new listing starts Pending, with no bypass - it only goes live
  // once WopeCar support has completed the photo verification/vetting visit
  // scheduled in the Add Car wizard and approved it. There is intentionally
  // no in-app action that publishes a car automatically (see
  // app/vendor/add-car/review.js's submit notice); flipping Pending->Active
  // is the one thing the existing Car Management "Active Listing" toggle
  // still can't do (it's disabled while a car is Pending).
  const addCar = useCallback((carData) => {
    setData((prev) => {
      const car = {
        id: `vcar-${Date.now()}`,
        name: carData.name,
        make: carData.make,
        model: carData.model,
        year: carData.year,
        // Same field name car.type is already read/displayed under on the
        // renter side (CarListCard/CarTileCard/car/[id].js) - vehicleClass
        // has no per-car display consumer yet (only used for search
        // filtering today), but is stored the same way for when it does.
        type: carData.type ?? null,
        vehicleClass: carData.vehicleClass ?? null,
        drivenBy: carData.drivenBy,
        location: carData.location,
        pricePerDay: carData.pricePerDay,
        description: carData.description ?? '',
        // Same field names app/car/[id].js already reads on the renter side
        // (car.transmission/seats/doors/baggage/features), so a vendor-added
        // car renders correctly there once listings are backend-connected.
        transmission: carData.transmission ?? null,
        seats: carData.seats ?? null,
        doors: carData.doors ?? null,
        baggage: carData.baggage ?? null,
        features: carData.features ?? [],
        regionalAddons: carData.regionalAddons ?? [],
        vettingAppointment: carData.vettingAppointment ?? null,
        image: null,
        status: 'Pending',
        submittedAt: new Date().toISOString(),
      };
      const cars = [...prev.cars, car];
      const next = { ...prev, cars };
      vendorStorage.setVendorData(next);
      return next;
    });
  }, []);

  // Vehicle Inspections done from Vendor Mode's own Menu entry point (not
  // tied to the renter-side app) are local-only - Vendor Mode has no real
  // backend booking ids to sync against yet, and the real inspection API is
  // hard-restricted to the booking's renter anyway. Keyed by
  // `${bookingId}:${type}` so pre/post live independently per booking,
  // mirroring the renter side's one-record-per-type shape.
  const getVendorInspection = useCallback((bookingId, type) => {
    return data.vendorInspections[`${bookingId}:${type}`] ?? null;
  }, [data.vendorInspections]);

  const submitVendorInspection = useCallback((bookingId, type, snapshot) => {
    setData((prev) => {
      const vendorInspections = {
        ...prev.vendorInspections,
        [`${bookingId}:${type}`]: { ...snapshot, status: 'submitted', submittedAt: new Date().toISOString() },
      };
      const next = { ...prev, vendorInspections };
      vendorStorage.setVendorData(next);
      return next;
    });
  }, []);

  const respondToBookingRequest = useCallback((requestId, { accept, reason = null }) => {
    setData((prev) => {
      const request = prev.bookingRequests.find((r) => r.id === requestId);
      if (!request) return prev;
      const bookingRequests = prev.bookingRequests.filter((r) => r.id !== requestId);
      const resolved = {
        ...request,
        status: accept ? 'Confirmed' : 'Declined',
        declineReason: accept ? null : reason,
      };
      const bookingHistory = [resolved, ...prev.bookingHistory];
      const next = { ...prev, bookingRequests, bookingHistory };
      vendorStorage.setVendorData(next);
      return next;
    });
  }, []);

  const currentMonthKey = useMemo(() => monthKeyFor(new Date()), []);

  const currentMonthEarnings = useMemo(() => {
    const entry = data.earningsHistory.find((m) => m.key === currentMonthKey);
    return entry?.total ?? 0;
  }, [data.earningsHistory, currentMonthKey]);

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
    fleetSize: data.cars.length,
    currentMonthEarnings,
    bookingsThisMonthCount,
    carEarningsThisMonth,
    getAvailabilitySettings,
    updateCar,
    addCar,
    setAvailabilitySettings,
    setBlockedDates,
    setVendorSettings,
    getVendorInspection,
    submitVendorInspection,
    respondToBookingRequest,
  }), [
    data, isLoading, currentMonthEarnings, bookingsThisMonthCount, carEarningsThisMonth, getAvailabilitySettings,
    updateCar, addCar, setAvailabilitySettings, setBlockedDates, setVendorSettings,
    getVendorInspection, submitVendorInspection, respondToBookingRequest,
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
