// Mock data for the Vendor/Host experience - no real backend endpoints exist
// for this yet (see PROJECT.md, "Vendor Mode" is a new domain built with
// mock local data by design, real backend comes in a later phase). These
// builders run once, the first time vendorStorage is empty, and the result
// is then persisted like any other locally-stored domain in this app - so
// totals stay stable across reloads instead of re-rolling every launch.

// make/model/year broken out (not just baked into `name`) so Edit Listing
// can prefill its pickers for these seed cars the same way it does for any
// car added through the real Add Car wizard.
const MOCK_CARS = [
  { id: 'vcar-1', name: 'Toyota Camry 2022', make: 'Toyota', model: 'Camry', year: 2022, drivenBy: 'Self-drive', pricePerDay: 350, status: 'Active' },
  { id: 'vcar-2', name: 'Hyundai Tucson 2021', make: 'Hyundai', model: 'Tucson', year: 2021, drivenBy: 'Self-drive', pricePerDay: 420, status: 'Active' },
  { id: 'vcar-3', name: 'Kia Sportage 2023', make: 'Kia', model: 'Sportage', year: 2023, drivenBy: 'Chauffeur', pricePerDay: 480, status: 'Pending' },
];

export function buildMockFleet() {
  return MOCK_CARS.map((car) => ({ ...car, image: null }));
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Fixed-but-varied totals (GHS) so the bar chart always shows a believable
// trend rather than a flat line or a different number every app restart.
const MOCK_MONTHLY_TOTALS = [3200, 4100, 2800, 5300, 4600, 5950];

export function buildMockEarningsHistory() {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: monthKey(d),
      label: d.toLocaleDateString(undefined, { month: 'short' }),
      total: MOCK_MONTHLY_TOTALS[5 - i],
    });
  }
  return months;
}

function isoDaysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function buildMockBookingRequests() {
  return [
    {
      id: 'vreq-1',
      carId: 'vcar-1',
      carName: 'Toyota Camry 2022',
      reference: 'WPC-10245',
      startDate: isoDaysFromNow(5),
      endDate: isoDaysFromNow(8),
      pickupTime: '10:00 AM',
      returnTime: '10:00 AM',
      earnings: 1050,
      status: 'Requested',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'vreq-2',
      carId: 'vcar-2',
      carName: 'Hyundai Tucson 2021',
      reference: 'WPC-10251',
      startDate: isoDaysFromNow(10),
      endDate: isoDaysFromNow(13),
      pickupTime: '9:00 AM',
      returnTime: '6:00 PM',
      earnings: 1260,
      status: 'Requested',
      createdAt: new Date().toISOString(),
    },
  ];
}

export function buildMockBookingHistory() {
  const now = new Date();
  const thisMonth = (day) => new Date(now.getFullYear(), now.getMonth(), day).toISOString().slice(0, 10);
  const lastMonth = (day) => new Date(now.getFullYear(), now.getMonth() - 1, day).toISOString().slice(0, 10);

  return [
    {
      id: 'vbk-1', carId: 'vcar-1', carName: 'Toyota Camry 2022', reference: 'WPC-10190',
      startDate: thisMonth(3), endDate: thisMonth(6), pickupTime: '10:00 AM', returnTime: '10:00 AM',
      earnings: 1050, status: 'Confirmed', createdAt: thisMonth(1), declineReason: null,
    },
    {
      id: 'vbk-2', carId: 'vcar-2', carName: 'Hyundai Tucson 2021', reference: 'WPC-10201',
      startDate: thisMonth(12), endDate: thisMonth(15), pickupTime: '9:00 AM', returnTime: '9:00 AM',
      earnings: 1260, status: 'Completed', createdAt: thisMonth(9), declineReason: null,
    },
    {
      id: 'vbk-3', carId: 'vcar-1', carName: 'Toyota Camry 2022', reference: 'WPC-10150',
      startDate: lastMonth(18), endDate: lastMonth(21), pickupTime: '11:00 AM', returnTime: '11:00 AM',
      earnings: 1050, status: 'Completed', createdAt: lastMonth(15), declineReason: null,
    },
  ];
}

// Per-car defaults, applied lazily by VendorContext when a car has no
// override saved yet - matches wopecar.com's stated self-drive minimum
// (see constants/pricing.js) as the default minimum booking length.
export const DEFAULT_AVAILABILITY_SETTINGS = {
  advanceNoticeDays: 1,
  bookingWindowMonths: 6,
  minBookingDays: 3,
};
