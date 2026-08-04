import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { getCurrencies } from '../services/currencyApi';
import { CURRENCY_META } from '../constants/currencies';
import { useSettings } from './SettingsContext';

// Used only until the real Supabase fetch below resolves, or if it fails -
// GHS at rate 1 is always correct since it's the base currency every stored
// price is already in.
const FALLBACK_CURRENCY = { ...CURRENCY_META.GHS, rate: 1 };

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const { settings, updateSetting } = useSettings();
  const [currencies, setCurrencies] = useState([FALLBACK_CURRENCY]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getCurrencies()
      .then(list => {
        if (list.length) setCurrencies(list);
      })
      .catch(() => {
        // Stay on FALLBACK_CURRENCY - the endpoint being unreachable
        // shouldn't break price display anywhere else in the app.
      })
      .finally(() => setIsLoading(false));
  }, []);

  const activeCurrency = useMemo(
    () => currencies.find(c => c.code === settings.currency) ?? currencies.find(c => c.isMain) ?? currencies[0],
    [currencies, settings.currency]
  );

  const setCurrency = useCallback((code) => {
    updateSetting('currency', code);
  }, [updateSetting]);

  return (
    <CurrencyContext.Provider value={{ currencies, activeCurrency, isLoading, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}
