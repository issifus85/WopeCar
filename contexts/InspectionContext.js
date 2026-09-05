import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as inspectionStorage from '../services/inspectionStorage';
import { PHOTO_ANGLES } from '../constants/inspectionPhotos';

// bookingId/type identify which booking+pre|post this draft belongs to.
// serverId is set once store() has synced at least once (needed for the
// per-step photo/signature/submit endpoints, which key off it rather than
// bookingId). photos/signatures hold local uris only until Phase 4 uploads
// them - never base64. pendingSync mirrors the offline-resume story: set
// true when a sync attempt fails, cleared on the next successful one.
const EMPTY_DRAFT = {
  bookingId: null,
  type: null, // 'pre' | 'post'
  serverId: null,
  mileage: '',
  fuelLevel: '',
  damagePoints: [],
  photos: Object.fromEntries(PHOTO_ANGLES.map((a) => [a.key, null])),
  checklist: {
    // Mirrors the client's official Vehicle Inspection Checklist PDF
    // (sections 2-6 - "Requirements for Rental" is client ID docs, already
    // covered by the Verification Docs upload flow, and Inspector
    // Name/Signature map to the renter/agent signature step in Phase 4).
    lightsOperational: false,
    mirrorsGoodCondition: false,
    windshieldClear: false,
    wipersFunctioning: false,
    bodyConditionGood: false,
    doorsLocksFunctioning: false,
    tyresGoodCondition: false,
    wheelAlignmentBalance: false,
    seatBeltsFunctioning: false,
    engineOilGood: false,
    brakeFluidGood: false,
    coolantLevelGood: false,
    noDashboardWarningLights: false,
    acFunctioning: false,
    warningTriangles: false,
    spareTire: false,
    jack: false,
    spannerTools: false,
    fireExtinguisher: false,
    notes: '',
  },
  signatures: { renter: null, agent: null },
  pendingSync: false,
};

const InspectionContext = createContext(null);

export function InspectionProvider({ children }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    inspectionStorage.getDraft()
      .then((saved) => {
        if (saved) setDraft(saved);
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Resuming the same booking+type keeps the existing draft (and whatever
  // was already synced/captured); starting a different inspection replaces
  // it - this app only ever tracks one in-progress inspection draft at a
  // time, matching CheckoutContext's single-active-checkout model.
  const startInspection = useCallback((bookingId, type) => {
    setDraft((prev) => {
      if (prev.bookingId === String(bookingId) && prev.type === type) {
        return prev;
      }
      const next = { ...EMPTY_DRAFT, bookingId: String(bookingId), type };
      inspectionStorage.setDraft(next);
      return next;
    });
  }, []);

  const updateDraft = useCallback((patch) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      inspectionStorage.setDraft(next);
      return next;
    });
  }, []);

  const resetInspection = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    inspectionStorage.clearDraft();
  }, []);

  const value = useMemo(
    () => ({ draft, isLoading, startInspection, updateDraft, resetInspection }),
    [draft, isLoading, startInspection, updateDraft, resetInspection]
  );

  return (
    <InspectionContext.Provider value={value}>
      {children}
    </InspectionContext.Provider>
  );
}

export function useInspection() {
  const context = useContext(InspectionContext);
  if (!context) {
    throw new Error('useInspection must be used within an InspectionProvider');
  }
  return context;
}
