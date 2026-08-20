import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as cartStorage from '../services/cartStorage';
import { sendLocalPushNotification } from '../services/pushNotifications';

const CartContext = createContext(null);

// Same "held for 24 hours" window checkout/payment.js's Save & Pay Later
// stamps onto every saved draft's expiresAt.
const REMINDER_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours before expiry

// Drops any saved booking whose hold has already lapsed, and fires a
// one-time local reminder (services/pushNotifications.js - real on-device
// push, no backend) for any booking that just entered its final 2 hours.
// remindedAt lives on the saved booking itself (persisted alongside it)
// rather than a separate id list, so a reminder never double-fires across
// app restarts within that same 2h window. Same "scan on mount + on
// AppState -> 'active'" convention as InboxContext's trip reminders
// (see PROJECT.md 6.10) - no ticking interval while the app stays open.
function pruneAndRemind(bookings) {
  const now = Date.now();
  let changed = false;
  const kept = [];
  for (const booking of bookings) {
    const msLeft = new Date(booking.expiresAt).getTime() - now;
    if (msLeft <= 0) {
      changed = true;
      continue;
    }
    if (!booking.remindedAt && msLeft <= REMINDER_WINDOW_MS) {
      sendLocalPushNotification({
        title: 'Your booking is about to expire',
        body: `Your ${booking.carName} booking expires in 2 hours — complete payment now`,
        data: { url: '/(tabs)/cart' },
      }).catch(() => {});
      kept.push({ ...booking, remindedAt: new Date().toISOString() });
      changed = true;
    } else {
      kept.push(booking);
    }
  }
  if (changed) cartStorage.setSavedBookings(kept);
  return kept;
}

export function CartProvider({ children }) {
  const [cartIds, setCartIds] = useState([]);
  const [savedBookings, setSavedBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([cartStorage.getCartIds(), cartStorage.getSavedBookings()])
      .then(([ids, bookings]) => {
        setCartIds(ids);
        setSavedBookings(pruneAndRemind(bookings));
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setSavedBookings(prev => pruneAndRemind(prev));
      }
    });
    return () => subscription.remove();
  }, []);

  const isInCart = useCallback((carId) => cartIds.includes(String(carId)), [cartIds]);

  const addToCart = useCallback((carId) => {
    const id = String(carId);
    setCartIds(prev => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      cartStorage.setCartIds(next);
      return next;
    });
  }, []);

  const removeFromCart = useCallback((carId) => {
    const id = String(carId);
    setCartIds(prev => {
      const next = prev.filter(existing => existing !== id);
      cartStorage.setCartIds(next);
      return next;
    });
  }, []);

  // A renter can only ever have one saved-for-later booking per car at a
  // time - saving again (e.g. re-entering checkout for the same car)
  // replaces the earlier draft rather than piling up duplicates.
  const saveBookingDraft = useCallback((draft) => {
    setSavedBookings(prev => {
      const next = [...prev.filter(b => b.carId !== draft.carId), draft];
      cartStorage.setSavedBookings(next);
      return next;
    });
  }, []);

  const removeSavedBooking = useCallback((id) => {
    setSavedBookings(prev => {
      const next = prev.filter(b => b.id !== id);
      cartStorage.setSavedBookings(next);
      return next;
    });
  }, []);

  return (
    <CartContext.Provider value={{
      cartIds, savedBookings, isLoading, isInCart, addToCart, removeFromCart,
      saveBookingDraft, removeSavedBooking,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
