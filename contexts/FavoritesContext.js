import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as favoritesStorage from '../services/favoritesStorage';
import { addServerCarId, reconcileCarIds, removeServerCarId } from '../services/accountListSync';
import { useAuth } from './AuthContext';

const FavoritesContext = createContext(null);

export function FavoritesProvider({ children }) {
  const { user } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    favoritesStorage.getFavoriteIds()
      .then(setFavoriteIds)
      .finally(() => setIsLoading(false));
  }, []);

  // Same real-logout-transition reset as CartContext - see its own comment
  // for why this can't just be "clear whenever user is falsy" (that would
  // also wipe a genuine guest's own saved cars).
  const prevUserRef = useRef(user);
  useEffect(() => {
    if (prevUserRef.current && !user) {
      setFavoriteIds([]);
    }
    prevUserRef.current = user;
  }, [user]);

  // Shares favourites with wopecar.com's Saved cars through the saved_cars
  // table (migration 0176) while signed in - same merge rules as the cart
  // (services/accountListSync.js). Signed out, favourites stay on the device.
  const userId = user?.id ?? null;
  const syncWithAccount = useCallback(async () => {
    if (!userId) return;
    const localIds = await favoritesStorage.getFavoriteIds();
    const merged = await reconcileCarIds('saved_cars', userId, localIds);
    if (merged) {
      favoritesStorage.setFavoriteIds(merged);
      setFavoriteIds(merged);
    }
  }, [userId]);

  useEffect(() => {
    if (!isLoading && userId) syncWithAccount();
  }, [isLoading, userId, syncWithAccount]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncWithAccount();
    });
    return () => subscription.remove();
  }, [syncWithAccount]);

  const isFavorite = useCallback((carId) => favoriteIds.includes(String(carId)), [favoriteIds]);

  const toggleFavorite = useCallback((carId) => {
    const id = String(carId);
    const wasFavorite = favoriteIds.includes(id);
    setFavoriteIds(prev => {
      const next = prev.includes(id) ? prev.filter(existing => existing !== id) : [...prev, id];
      favoritesStorage.setFavoriteIds(next);
      return next;
    });
    if (userId) {
      if (wasFavorite) removeServerCarId('saved_cars', userId, id);
      else addServerCarId('saved_cars', userId, id);
    }
  }, [favoriteIds, userId]);

  return (
    <FavoritesContext.Provider value={{ favoriteIds, isLoading, isFavorite, toggleFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
}
