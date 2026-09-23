import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';

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
  // True when checkout/dates.js force-set withDriver above because the
  // selected self-drive range is under the minimum - addons.js reads this
  // to render the toggle checked and non-interactive instead of a normal
  // editable checkbox, since the driver add-on is the only way that range
  // is allowed to proceed at all.
  withDriverLocked: false,
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
  const { user } = useAuth();
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

  // In-memory only (never persisted to storage, unlike Cart/Favorites/
  // Bookings/Inbox), but the same real-logout-transition problem applies:
  // a draft can carry a name, email, phone, address, and license-photo URIs
  // typed in mid-checkout, and none of that cleared just because the
  // account signed out. Same guard as the other contexts - only fires on
  // the actual logged-in -> logged-out change.
  const prevUserRef = useRef(user);
  useEffect(() => {
    if (prevUserRef.current && !user) {
      setDraft(EMPTY_DRAFT);
    }
    prevUserRef.current = user;
  }, [user]);

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
