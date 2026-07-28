import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { getCurrencies } from '../services/currencyApi';
import { useSettings } from './SettingsContext';

// Matches constants/pricing.js's old hardcoded "GHS 1,234" output exactly,
// so the app looks identical while the backend endpoint hasn't been
// deployed yet (new controller, no migration - but still requires the
// user's usual cPanel re-upload) or if the request fails for any reason.
const FALLBACK_CURRENCY = {
  code: 'GHS',
  name: 'Ghana Cedis',
  symbol: 'GHS',
  rate: 1,
  isMain: true,
  format: 'left_space',
  decimals: 0,
};

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
