import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import supabase from '../services/supabase';
import * as bookingsStorage from '../services/bookingsStorage';
import { getUserBookings, sendBookingCancelledEmail } from '../services/supabaseApi';
import { useAuth } from './AuthContext';

const BookingsContext = createContext(null);

// Supabase ids are real uuids; pre-cutover local-only bookings use
// `local-<timestamp>` ids (see app/checkout/payment.js's history) - this is
// how a booking's origin is told apart without a dedicated flag column.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isSupabaseBookingId = (id) => UUID_RE.test(id);

const STATUS_MAP = { pending: 'Pending', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled' };

function normalizeSupabaseBooking(row) {
  return {
    id: row.id,
    carId: row.car_id,
    carName: row.cars?.name ?? 'Untitled Car',
    carImage: row.cars?.images?.[0] ?? null,
    startDate: row.start_date,
    endDate: row.end_date,
    pickupTime: row.pickup_time,
    returnTime: row.return_time,
    pickupLocation: row.pickup_location,
    returnLocation: row.return_location,
    addons: (row.addon_names ?? []).map((name, i) => ({ name, days: row.addon_days?.[i] ?? 1 })),
    // Same shape as the local booking object app/checkout/payment.js
    // builds on the optimistic-add path, so a booking looks identical
    // whether it just came from a fresh checkout or from this Supabase sync.
    wopeCare: {
      plan: row.wopecare_plan ?? 'none',
      dailyRate: row.wopecare_daily_rate ?? 0,
      totalCost: row.wopecare_total_cost ?? 0,
      coverage: row.wopecare_coverage ?? 0,
    },
    totalCost: row.total_cost,
    paystackReference: row.payment_ref,
    status: STATUS_MAP[row.status] ?? 'Pending',
    createdAt: row.created_at,
  };
}

export function BookingsProvider({ children }) {
  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    bookingsStorage.getBookings()
      .then(setBookings)
      .finally(() => setIsLoading(false));
  }, []);

  // Refreshes Supabase-sourced bookings (real cross-device state - e.g. a
  // vendor accepting/declining, which only ever happens server-side) and
  // merges them with whatever's in local storage. Supabase rows win on a
  // matching id (fresher/authoritative); local-only rows with no Supabase
  // counterpart (pre-cutover bookings, or Supabase temporarily
  // unreachable) are kept as-is rather than dropped.
  useEffect(() => {
    if (!user) return;
    getUserBookings(user.id)
      .then((rows) => {
        const remote = rows.map(normalizeSupabaseBooking);
        const remoteIds = new Set(remote.map((b) => b.id));
        setBookings((prev) => {
          const merged = [...remote, ...prev.filter((b) => !remoteIds.has(b.id))];
          bookingsStorage.setBookings(merged);
          return merged;
        });
      })
      .catch(() => {}); // best-effort - local state already loaded independently above
  }, [user]);

  const addBooking = useCallback((booking) => {
    setBookings(prev => {
      const next = [booking, ...prev];
      bookingsStorage.setBookings(next);
      return next;
    });
  }, []);

  const updateBooking = useCallback((id, patch) => {
    setBookings(prev => {
      const next = prev.map(b => (b.id === id ? { ...b, ...patch } : b));
      bookingsStorage.setBookings(next);
      return next;
    });
  }, []);

  // Routes through the same cancel-booking Edge Function the admin apps use
  // (services/adminBookingsApi.js), so the tiered cancellation-refund policy
  // (Settings > Cancellation Policy) and the real Paystack refund are
  // applied identically whether an admin or the renter themself cancels -
  // not a separate, drifting reimplementation. The function itself enforces
  // that a renter may only cancel their own still-'pending' booking.
  const cancelBooking = useCallback(async (id) => {
    if (isSupabaseBookingId(id)) {
      const { data: result, error } = await supabase.functions.invoke('cancel-booking', { body: { bookingId: id } });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      if (result.refunded) {
        Alert.alert('Booking cancelled', `GH₵${result.refundAmount.toFixed(2)} has been refunded to you.`);
      } else if (result.refundAmount > 0) {
        Alert.alert('Booking cancelled', `A refund of GH₵${result.refundAmount.toFixed(2)} is due — our team will process it shortly.`);
      }

      sendBookingCancelledEmail(id).catch(() => {});
    }
    setBookings(prev => {
      const next = prev.map(b => (b.id === id ? { ...b, status: 'Cancelled' } : b));
      bookingsStorage.setBookings(next);
      return next;
    });
  }, []);

  return (
    <BookingsContext.Provider value={{ bookings, isLoading, addBooking, updateBooking, cancelBooking }}>
      {children}
    </BookingsContext.Provider>
  );
}

export function useBookings() {
  const context = useContext(BookingsContext);
  if (!context) {
    throw new Error('useBookings must be used within a BookingsProvider');
  }
  return context;
}
