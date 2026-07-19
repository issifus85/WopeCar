import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as favoritesStorage from '../services/favoritesStorage';

const FavoritesContext = createContext(null);

export function FavoritesProvider({ children }) {
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    favoritesStorage.getFavoriteIds()
      .then(setFavoriteIds)
      .finally(() => setIsLoading(false));
  }, []);

  const isFavorite = useCallback((carId) => favoriteIds.includes(String(carId)), [favoriteIds]);

  const toggleFavorite = useCallback((carId) => {
    const id = String(carId);
    setFavoriteIds(prev => {
      const next = prev.includes(id) ? prev.filter(existing => existing !== id) : [...prev, id];
      favoritesStorage.setFavoriteIds(next);
      return next;
    });
  }, []);

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
