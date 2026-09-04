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
  // Optional self-drive-only add-on - a WopeCar driver for the whole trip,
  // priced per day via constants/pricing.js's getWithDriverFeePerDay(). Never
  // offered/settable for a Chauffeur car (see checkout/addons.js).
  withDriver: false,
  totalCost: 0,
  // 'none' | 'basic' | 'plus' | 'premium' - see constants/pricing.js's
  // WOPECARE_PLANS. wopeCareDetails caches the selected plan object itself
  // (not just the id) so screens after addons.js can read plan.rate/
  // coverage/name without re-importing WOPECARE_PLANS or risking it drift
  // from whatever was actually selected.
  wopeCare: 'none',
  wopeCareDetails: null,
  // Only the code + the promo's own discount shape are kept, not a raw
  // discount amount - it's recomputed reactively against whatever the
  // subtotal actually is on each screen (see checkout/summary.js and
  // checkout/payment.js), the same way car-level discounts already work,
  // so going back and changing dates/addons after applying a code doesn't
  // leave a stale discount amount behind.
  promoCode: null,
  promoDiscountType: null,
  promoDiscountValue: 0,
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
