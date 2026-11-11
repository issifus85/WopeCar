import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as cartStorage from '../services/cartStorage';
import { syncCartItemAdded, syncCartItemRemoved } from '../services/cartSync';
import { reconcileCarIds } from '../services/accountListSync';
import { fetchOpenPendingInvoices, mergeSavedBookings } from '../services/savedBookingsSync';
import { sendLocalPushNotification } from '../services/pushNotifications';
import { voidQuickbooksPendingInvoice } from '../services/supabaseApi';
import { useAuth } from './AuthContext';

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
      // Fire-and-forget: voids the real QuickBooks invoice + sends the
      // "your booking expired" email (quickbooks-void-invoice). The
      // invoice may not exist yet if the fire-and-forget create call
      // from handleSaveToCart hasn't landed - that function degrades
      // gracefully and just marks the row resolved either way.
      if (booking.pendingInvoiceId) {
        voidQuickbooksPendingInvoice(booking.pendingInvoiceId).catch(() => {});
      }
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
  const { user } = useAuth();
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

  // Clears this account's cart the moment they actually log out - not on
  // every render where `user` happens to be null, which would also fire
  // for a genuine guest who's never signed in and would wipe a cart they
  // built up intentionally before deciding to check out. prevUserRef only
  // flips this on the real transition (was signed in, now isn't). Storage
  // itself is already wiped by AuthContext's logout()/deleteAccount() (see
  // services/clearLocalUserData.js) - this is the other half of that fix:
  // without it, the next person to pick up the device (or the same person
  // browsing on afterward as a guest) still saw the previous account's cart
  // and saved-for-later bookings rendered from in-memory state that a
  // storage wipe alone can't touch, confirmed live.
  const prevUserRef = useRef(user);
  useEffect(() => {
    if (prevUserRef.current && !user) {
      setCartIds([]);
      setSavedBookings([]);
    }
    prevUserRef.current = user;
  }, [user]);

  // Account continuity with wopecar.com: the wishlist cart lives in
  // cart_items and Save & Pay Later drafts in pending_invoices, both shared
  // with the website. Runs once the local copy has loaded and whenever a
  // (different) account is signed in, then again each time the app comes
  // back to the foreground so changes made on the website show up. Signed
  // out, nothing changes - the cart stays device-local as before.
  // Local-only cart items are pushed up on an account's first sync on this
  // device (see services/accountListSync.js), which also feeds the
  // send-cart-reminders cron the same way the old sign-in push did.
  const userId = user?.id ?? null;
  const syncWithAccount = useCallback(async () => {
    if (!userId) return;
    const localIds = await cartStorage.getCartIds();
    const mergedIds = await reconcileCarIds('cart_items', userId, localIds);
    if (mergedIds) {
      cartStorage.setCartIds(mergedIds);
      setCartIds(mergedIds);
    }
    try {
      const serverOpen = await fetchOpenPendingInvoices();
      setSavedBookings((prev) => {
        const next = pruneAndRemind(mergeSavedBookings(prev, serverOpen));
        cartStorage.setSavedBookings(next);
        return next;
      });
    } catch {
      // Offline/RLS error - keep the local saved bookings as they are.
    }
  }, [userId]);

  useEffect(() => {
    if (!isLoading && userId) syncWithAccount();
  }, [isLoading, userId, syncWithAccount]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setSavedBookings(prev => pruneAndRemind(prev));
        syncWithAccount();
      }
    });
    return () => subscription.remove();
  }, [syncWithAccount]);

  const isInCart = useCallback((carId) => cartIds.includes(String(carId)), [cartIds]);

  const addToCart = useCallback((carId) => {
    const id = String(carId);
    setCartIds(prev => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      cartStorage.setCartIds(next);
      return next;
    });
    if (user?.id) syncCartItemAdded(user.id, id);
  }, [user]);

  const removeFromCart = useCallback((carId) => {
    const id = String(carId);
    setCartIds(prev => {
      const next = prev.filter(existing => existing !== id);
      cartStorage.setCartIds(next);
      return next;
    });
    if (user?.id) syncCartItemRemoved(user.id, id);
  }, [user]);

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

  // The renter removing a saved booking themselves (not paying it). Also
  // voids its pending invoice, which marks the pending_invoices row
  // resolved - otherwise the next account sync would bring the draft back,
  // and wopecar.com would keep listing it. Same call the website's own
  // "remove saved booking" makes.
  const discardSavedBooking = useCallback((id) => {
    const target = savedBookings.find(b => b.id === id);
    if (target?.pendingInvoiceId) {
      voidQuickbooksPendingInvoice(target.pendingInvoiceId).catch(() => {});
    }
    removeSavedBooking(id);
  }, [savedBookings, removeSavedBooking]);

  return (
    <CartContext.Provider value={{
      cartIds, savedBookings, isLoading, isInCart, addToCart, removeFromCart,
      saveBookingDraft, removeSavedBooking, discardSavedBooking,
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
