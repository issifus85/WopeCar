import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as cartStorage from '../services/cartStorage';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cartIds, setCartIds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    cartStorage.getCartIds()
      .then(setCartIds)
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

  return (
    <CartContext.Provider value={{ cartIds, isLoading, isInCart, addToCart, removeFromCart }}>
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
