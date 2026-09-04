import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import supabase, { edgeFunctionErrorMessage } from '../services/supabase';
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
  // matching id (fresher/authoritative); getUserBookings has no .limit()
  // and is scoped to renter_id, so a *successful* fetch is always the
  // user's complete, authoritative booking set - anything previously
  // cached under a real Supabase id (isSupabaseBookingId) that's no longer
  // in that set genuinely no longer exists/is no longer visible (deleted,
  // reassigned, test-data reset, ...) and gets dropped here, not kept.
  // Only true pre-cutover local-only bookings (local-<timestamp> ids, see
  // isSupabaseBookingId above) survive a merge with no remote counterpart -
  // those never had a server row to begin with.
  //
  // This isn't just cosmetic: a stale-but-kept booking id used to reach
  // screens keyed off it (e.g. app/review/[bookingId].js) and throw
  // PostgREST's raw "Cannot coerce the result to a single JSON object"
  // when the id resolved to zero rows there - the id itself was long dead,
  // this merge was just never told to let it go.
  //
  // Exposed as refreshBookings() below - this used to only run once, keyed
  // on [user], so a vendor accepting/declining while the renter's app was
  // already open (no re-login, no reload) never showed up: the booking
  // list and detail screen kept whatever status was fetched at mount for
  // the rest of the session. Screens now call refreshBookings() from their
  // own useFocusEffect (app/(tabs)/bookings.js, app/booking/[id].js), the
  // same "re-sync on focus" convention already used there for inspections/
  // rental agreements.
  const refreshBookings = useCallback(() => {
    if (!user) return Promise.resolve();
    return getUserBookings(user.id)
      .then((rows) => {
        const remote = rows.map(normalizeSupabaseBooking);
        const remoteIds = new Set(remote.map((b) => b.id));
        setBookings((prev) => {
          const preCutoverLocalOnly = prev.filter((b) => !isSupabaseBookingId(b.id) && !remoteIds.has(b.id));
          const merged = [...remote, ...preCutoverLocalOnly];
          bookingsStorage.setBookings(merged);
          return merged;
        });
      })
      .catch(() => {}); // best-effort - local state already loaded independently above
  }, [user]);

  useEffect(() => {
    refreshBookings();
  }, [refreshBookings]);

  // Deduped by id (not a blind prepend) - a booking already present (e.g.
  // this device's own refreshBookings() already picked it up, or handlePay
  // is somehow invoked twice for the same reservation) gets replaced in
  // place rather than duplicated. Without this, the Bookings list could
  // show the same trip as two identical cards until the next successful
  // refreshBookings() happened to overwrite local state with the server's
  // deduped truth - a real, user-visible symptom of exactly that kind of
  // double-add, even though the array's *server* side was never actually
  // wrong.
  const addBooking = useCallback((booking) => {
    setBookings(prev => {
      const next = [booking, ...prev.filter((b) => b.id !== booking.id)];
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

  // Routes through the real modify-booking Edge Function - this used to
  // just be a local updateBooking() call (patches AsyncStorage only, never
  // Supabase), so a genuine Paystack-charged trip extension would silently
  // revert on the very next refreshBookings() (Supabase rows win there)
  // and never appear in this device's own history, the web admin panel, or
  // the in-app admin surface - all three read the same live bookings row.
  // The Edge Function re-verifies any paystackReference against Paystack
  // directly and writes a durable booking_modifications row (old vs new
  // dates/cost) alongside the bookings update itself, which is what
  // getBookingModifications() below reads back for the "Trip Changes"
  // history section. Local state is updated optimistically with the same
  // patch that was just confirmed written, then trued up by the caller's
  // own refreshBookings() (app/booking/[id].js already calls this on
  // focus).
  const modifyBooking = useCallback(async (id, fields) => {
    const { data: result, error } = await supabase.functions.invoke('modify-booking', {
      body: {
        bookingId: id,
        startDate: fields.startDate,
        endDate: fields.endDate,
        pickupTime: fields.pickupTime,
        returnTime: fields.returnTime,
        pickupLocation: fields.pickupLocation,
        returnLocation: fields.returnLocation,
        rentalCost: fields.rentalCost,
        addonsCost: fields.addonsCost,
        deliveryFee: fields.deliveryFee,
        securityDeposit: fields.securityDeposit,
        totalCost: fields.totalCost,
        billableDays: fields.billableDays,
        wopecareTotalCost: fields.wopecareTotalCost,
        paystackReference: fields.paystackReference,
        amountCharged: fields.amountCharged,
      },
    });
    if (error) throw new Error(await edgeFunctionErrorMessage(error));
    if (result?.error) throw new Error(result.error);

    setBookings((prev) => {
      const next = prev.map((b) => (b.id === id ? {
        ...b,
        startDate: fields.startDate,
        endDate: fields.endDate,
        pickupTime: fields.pickupTime,
        returnTime: fields.returnTime,
        pickupLocation: fields.pickupLocation,
        returnLocation: fields.returnLocation,
        totalCost: fields.totalCost,
        wopeCare: fields.wopecareTotalCost != null && b.wopeCare?.plan && b.wopeCare.plan !== 'none'
          ? { ...b.wopeCare, totalCost: fields.wopecareTotalCost }
          : b.wopeCare,
      } : b));
      bookingsStorage.setBookings(next);
      return next;
    });

    return result.modification;
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
      if (error) throw new Error(await edgeFunctionErrorMessage(error));
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
    <BookingsContext.Provider value={{ bookings, isLoading, addBooking, updateBooking, modifyBooking, cancelBooking, refreshBookings }}>
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
