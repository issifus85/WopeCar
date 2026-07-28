import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const EMPTY_DRAFT = {
  carId: null,
  startDate: null,
  endDate: null,
  pickupTime: null,
  returnTime: null,
  pickupLocation: '',
  returnLocation: '',
  // {name, days}[] - days is how many of the trip's days this addon
  // applies for (e.g. a per-day regional travel fee only charged for the
  // portion of the trip actually spent in that region, not the whole trip).
  addons: [],
  totalCost: 0,
  form: {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
  },
  licenseFront: null,
  licenseBack: null,
  proofOfAddress: null,
};

const CheckoutContext = createContext(null);

export function CheckoutProvider({ children }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const startCheckout = useCallback((carId) => {
    setDraft({ ...EMPTY_DRAFT, carId: String(carId) });
  }, []);

  const updateDraft = useCallback((patch) => {
    setDraft(prev => ({ ...prev, ...patch }));
  }, []);

  const updateForm = useCallback((patch) => {
    setDraft(prev => ({ ...prev, form: { ...prev.form, ...patch } }));
  }, []);

  const resetCheckout = useCallback(() => {
    setDraft(EMPTY_DRAFT);
  }, []);

  const value = useMemo(
    () => ({ draft, startCheckout, updateDraft, updateForm, resetCheckout }),
    [draft, startCheckout, updateDraft, updateForm, resetCheckout]
  );

  return (
    <CheckoutContext.Provider value={value}>
      {children}
    </CheckoutContext.Provider>
  );
}

export function useCheckout() {
  const context = useContext(CheckoutContext);
  if (!context) {
    throw new Error('useCheckout must be used within a CheckoutProvider');
  }
  return context;
}
