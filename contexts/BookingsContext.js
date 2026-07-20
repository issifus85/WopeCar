import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as bookingsStorage from '../services/bookingsStorage';

const BookingsContext = createContext(null);

export function BookingsProvider({ children }) {
  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    bookingsStorage.getBookings()
      .then(setBookings)
      .finally(() => setIsLoading(false));
  }, []);

  // Bookings created locally (checkout submitted, payment "completed" in the
  // simulated Paystack step) - not yet synced with a real backend booking
  // record, since no Sanctum-authenticated checkout API exists yet. See the
  // note in the checkout payment screen.
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

  const cancelBooking = useCallback((id) => {
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
