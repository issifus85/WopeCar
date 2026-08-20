import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as cartStorage from '../services/cartStorage';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cartIds, setCartIds] = useState([]);
  const [savedBookings, setSavedBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([cartStorage.getCartIds(), cartStorage.getSavedBookings()])
      .then(([ids, bookings]) => {
        setCartIds(ids);
        setSavedBookings(bookings);
      })
      .finally(() => setIsLoading(false));
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
