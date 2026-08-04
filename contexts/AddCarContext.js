import { createContext, useCallback, useContext, useMemo, useState } from 'react';

// Starting text for the Description field - a simple, editable outline
// vendors adopt and fill in rather than face a blank box. Bracketed
// placeholders are deliberately literal (not auto-filled from make/model/
// year) so editing one field never silently overwrites another.
const DESCRIPTION_TEMPLATE = `This [Year] [Make] [Model] is perfect for [road trips / city errands / airport runs] around [your city/region].

✔ [Feature - e.g. Spacious trunk for luggage]
✔ [Feature - e.g. Fuel-efficient engine]
✔ [Feature - e.g. Bluetooth & USB connectivity]

What's included: [e.g. Full tank of fuel, clean interior, dash cam]

Ideal for: [e.g. Family trips, business travel, weekend getaways]

Please note: [e.g. Return with same fuel level, no smoking]`;

// In-memory draft across the 5-step Add Car wizard - mirrors
// CheckoutContext.js exactly (not persisted, intentionally reset each
// attempt via startAddCar()).
const EMPTY_DRAFT = {
  make: '',
  model: '',
  year: null,
  type: '',
  vehicleClass: '',
  drivenBy: 'Self-drive',
  energySource: '',
  transmission: 'Automatic',
  seats: '',
  doors: '',
  baggage: '',
  features: [],
  description: DESCRIPTION_TEMPLATE,
  location: '',
  pricePerDay: '',
  // {name, price, type:'per_day'}[] - same shape car.regionalAddons already
  // uses on the renter side (constants/pricing.js / checkout/addons.js).
  offersRegionalAddons: false,
  regionalAddons: [],
  vettingDate: null,
  vettingTime: null,
  // Compliance docs - local device uris until review.js's submit uploads
  // them for real (needs the car's own id first, see uploadCarDocument).
  insurancePolicyNumber: '',
  roadworthyDocUri: null,
  insuranceDocUri: null,
};

const AddCarContext = createContext(null);

export function AddCarProvider({ children }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const startAddCar = useCallback(() => {
    setDraft(EMPTY_DRAFT);
  }, []);

  const updateDraft = useCallback((patch) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetAddCar = useCallback(() => {
    setDraft(EMPTY_DRAFT);
  }, []);

  const value = useMemo(
    () => ({ draft, startAddCar, updateDraft, resetAddCar }),
    [draft, startAddCar, updateDraft, resetAddCar]
  );

  return (
    <AddCarContext.Provider value={value}>
      {children}
    </AddCarContext.Provider>
  );
}

export function useAddCar() {
  const context = useContext(AddCarContext);
  if (!context) {
    throw new Error('useAddCar must be used within an AddCarProvider');
  }
  return context;
}
