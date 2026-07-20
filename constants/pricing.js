export const CURRENCY_CODE = 'GHS';

export function formatCurrency(amount) {
  const value = Number(amount) || 0;
  return `${CURRENCY_CODE} ${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// Matches the live site's booking widget and T&Cs (wopecar.com/book-a-car/<slug>):
// a flat delivery/collection fee for self-drive rentals only, plus a refundable
// security deposit (all rentals) of 25% of the rental+add-ons subtotal, or a
// flat GHS 500 if that subtotal is under GHS 2,000.
export const SELF_DRIVE_DELIVERY_FEE = 200;
const SECURITY_DEPOSIT_THRESHOLD = 2000;
const SECURITY_DEPOSIT_FLAT = 500;
const SECURITY_DEPOSIT_PERCENT = 0.25;

export function calculateSecurityDeposit(subtotal) {
  return subtotal < SECURITY_DEPOSIT_THRESHOLD ? SECURITY_DEPOSIT_FLAT : subtotal * SECURITY_DEPOSIT_PERCENT;
}
