// Canonical rental Terms & Conditions text, consolidated from the real
// WopeCar policy text that used to be pasted verbatim into every single
// car's `description` field in Supabase (see supabase/scripts/
// set-car-descriptions.mjs). Defining it once here - instead of per-car -
// means Car Detail's terms section and the standalone /rental-terms screen
// both render the same clean, correctly-formatted copy, and a wording fix
// only ever needs to happen in one place.

export const CHAUFFEUR_TERMS = {
  title: 'Chauffeured Rental — Terms & Conditions',
  clauses: [
    { title: 'Rental Period', body: 'Chauffeured rentals cover 12 hours per day, ending at 8:30 PM. If your rental begins in the afternoon (around 12 PM), the service will still conclude at 8:30 PM that same day.' },
    { title: 'Overtime Charges', body: 'Should your trip extend beyond 8:30 PM, overtime charges will apply:\n8:30 PM – 11:00 PM → Half-day rate\nAfter 11:00 PM → Full-day rate' },
    { title: 'Driver’s Allowance', body: 'The rental fee already includes the driver’s allowance for vehicles that come with a chauffeur.' },
    { title: 'Accommodation (for trips outside Accra)', body: 'For multi-day trips outside Accra, the driver will require accommodation. You may either provide suitable accommodation, or request that we add the cost of accommodation to your booking.' },
    { title: 'Fuel Policy', body: 'Rental fees do not include fuel. Clients are kindly responsible for fueling the car throughout the rental period.' },
    { title: 'Security Deposit', body: 'A refundable flat security deposit of GHS 500 is required for every chauffeured booking. This deposit is held against minor issues or unforeseen costs and is fully refunded once the vehicle is returned in good condition and all terms are met.' },
    { title: 'Payment Terms', body: 'Full payment is kindly required before the rental commences. Payments may be made via Mobile Money, Bank Transfer, or Paystack (Supports Mastercard, Visa Debit & Credit Card, and Mobile Money).' },
    { title: 'No Cash Payments', body: 'For your security, we do not accept cash for rentals. Please avoid making any direct payments to drivers (except for tips). If any payment is requested, kindly confirm with your sales agent before proceeding.' },
    { title: 'Cancellation Policy', body: 'Refunds for cancelled bookings are tiered by how far ahead of pickup you cancel: cancelling well in advance qualifies for a full refund, cancelling closer to pickup qualifies for a partial refund, and cancelling shortly before pickup is non-refundable. Exact refund tiers and percentages are shown when you cancel a booking in the app.' },
    { title: 'Use of Vehicle', body: 'Vehicles may only be used within the destinations agreed upon with your sales agent. If you need to adjust your travel route, please inform us in advance so your booking can be updated.' },
    { title: 'Rental Extensions', body: 'If you wish to extend your rental, please contact Wopecar at least 24 hours before your current booking ends. Once we issue the extension invoice, payment must be made promptly to secure the additional days.' },
  ],
};

export const SELF_DRIVE_TERMS = {
  title: 'Self-Drive Rental — Terms & Conditions',
  clauses: [
    { title: 'Minimum Booking Duration', body: 'Cars must be rented for at least 3 days.' },
    { title: 'Rental Rates & Destinations', body: 'Rental prices are based on your destination. Please do not drive the car to destinations you have not booked and paid for — doing so will attract a penalty charge.' },
    { title: 'Rental Period', body: 'Standard rentals last 24 hours per day. For luxury vehicles (e.g., Prado, Pajero), rentals cover 12 hours per day.' },
    { title: 'Fuel Policy', body: 'Rental fees do not include fuel. Clients are kindly responsible for fueling the car throughout the rental period.' },
    { title: 'Security Deposit', body: 'A refundable security deposit is required for every booking: 25% of the total rental cost for rentals of GHS 2,000 or more, or a flat GHS 500 deposit for rentals below GHS 2,000. The deposit is refunded after inspection if all terms are met and the vehicle is returned in good condition.' },
    { title: 'Delivery', body: 'Delivery and collection cost GHS 200 (covers both drop-off and pick-up). Client pick-ups at our location are not available.' },
    { title: 'Delivery Days', body: 'Vehicles are delivered and collected Monday to Saturday only.' },
    { title: 'Payment Terms', body: 'Full payment is required before delivery. Accepted payment methods: Mobile Money, Bank Transfer, or Card Payment. Cash payments are not accepted — until payment is received, the car remains available to other clients.' },
    { title: 'Battery Charging Policy (for EVs)', body: 'Rental rates do not include battery charging costs. The battery must never fall below 30% during the rental. For city driving, charge to a maximum of 80% (charging to 100% frequently will damage the battery). For long-distance driving, charging up to 100% is allowed.' },
    { title: 'Driver’s License', body: 'Only the person(s) who submitted a valid driver’s license to Wopecar may drive the car. Allowing an unregistered driver to operate the car is strictly prohibited and considered a breach of agreement.' },
    { title: 'Vehicle Condition', body: 'Vehicles must be returned in the same clean and physical condition they were delivered in, including the same fuel level. Extra charges apply if the car is returned dirty, damaged, or with fuel short.' },
    { title: 'Damages & Fines', body: 'In the event of damage, mechanical issues, or police fines, please contact Wopecar customer support before taking any action. Attempting to repair or pay for issues without our approval may result in extra costs or loss of deposit.' },
    { title: 'Rental Extensions', body: 'To extend your rental, please contact Wopecar at least 24 hours before your booking ends. Once the extension invoice is issued, kindly pay immediately to confirm your extra days.' },
    { title: 'Cancellation Policy', body: 'Refunds for cancelled bookings are tiered by how far ahead of pickup you cancel: cancelling well in advance qualifies for a full refund, cancelling closer to pickup qualifies for a partial refund, and cancelling shortly before pickup is non-refundable. Exact refund tiers and percentages are shown when you cancel a booking in the app.' },
    { title: 'Refunds', body: 'Security deposits are refunded within 1–3 business days after vehicle inspection. Any deductions (for damages, cleaning, or fuel shortage) will be clearly explained before refund.' },
  ],
};
