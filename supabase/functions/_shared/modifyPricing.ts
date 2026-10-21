// Server-side re-pricing for modify-booking. The clients send their own totals, and nothing used to check them: a tampered request could
// pay for a tiny difference, and the clients themselves disagreed on add-on days, the security deposit, the promo and the driver cost
// after a change. These are the parts of a booking's price that follow simple, shared rules and are worked out here from what the server
// knows (stored add-on days, the car's current add-on prices, app_settings, the promo row), so every surface ends up with the same
// numbers. The rental cost and WopeCare cost still come from the client (seasonal prices and discounts live in the clients), but the
// caller range-checks the rental cost.

export type RegionalAddon = { name: string; type: string; price: number };

export type ModifyPricingInput = {
  /** 'Chauffeur' or 'Self-drive' (the car's drive type). */
  driveType: string | null;
  /** New billable days, already computed by the client with the shared billing rule. */
  billableDays: number;
  /** Rental cost for the new dates (after seasonal prices and discounts, before the promo). */
  rentalCost: number;
  wopecareTotalCost: number;
  /** The driver after this change: cost and days (null days = every billable day). */
  driver: { active: boolean; cost: number; days: number | null };
  /** Add-ons as stored on the booking (parallel arrays) and the car's current add-on definitions. */
  addonNames: string[] | null;
  addonDays: number[] | null;
  addonDefs: RegionalAddon[] | null;
  /** Fallback when an add-on can't be re-priced (definition removed): keep this cost. */
  currentAddonsCost: number;
  currentDeliveryFee: number;
  promo: { discountType: string | null; discountValue: number } | null;
  settings: Record<string, unknown>;
};

export type ModifyPricing = {
  addonDays: number[] | null;
  addonsCost: number;
  deliveryFee: number;
  securityDeposit: number;
  promoDiscount: number;
  totalCost: number;
  driverCoversAll: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export function computeModifyPricing(i: ModifyPricingInput): ModifyPricing {
  const billable = Math.max(1, Math.round(i.billableDays));
  const isChauffeur = i.driveType === 'Chauffeur';

  // Add-ons: a per-day add-on can never run longer than the rental is billed for.
  let addonDays: number[] | null = null;
  let addonsCost = i.currentAddonsCost;
  const names = i.addonNames ?? [];
  if (names.length > 0) {
    const defs = i.addonDefs ?? [];
    const days = names.map((_, idx) => Math.min(Math.max(1, Math.round(num(i.addonDays?.[idx], billable))), billable));
    const allPriced = names.every((n) => defs.some((d) => d.name === n));
    addonDays = days;
    if (allPriced) {
      addonsCost = round2(names.reduce((sum, name, idx) => {
        const def = defs.find((d) => d.name === name)!;
        return sum + (def.type === 'per_day' ? Number(def.price) * days[idx] : Number(def.price));
      }, 0));
    }
  } else {
    addonsCost = 0;
  }

  // Delivery: self-drive only, and free while a WopeCar driver covers every day.
  const driverCoversAll = i.driver.active && !isChauffeur && (i.driver.days == null || i.driver.days >= billable);
  const standardDelivery = num(i.settings.self_drive_delivery_fee, 200);
  const deliveryFee = isChauffeur || driverCoversAll ? 0 : i.currentDeliveryFee > 0 ? i.currentDeliveryFee : standardDelivery;

  // Deposit: flat chauffeur amount for chauffeured / fully-driven trips, else 25% of rental + add-ons at or above the threshold, else flat.
  const subtotal = i.rentalCost + addonsCost;
  const securityDeposit = isChauffeur || driverCoversAll
    ? num(i.settings.chauffeur_security_deposit, 500)
    : subtotal < num(i.settings.security_deposit_threshold, 2000)
      ? num(i.settings.security_deposit_flat, 500)
      : round2(subtotal * num(i.settings.security_deposit_percentage, 0.25));

  // Promo: same base the app uses (rental + add-ons), a flat code stays flat, never more than that base.
  let promoDiscount = 0;
  if (i.promo) {
    const raw = i.promo.discountType === 'percentage' ? subtotal * (i.promo.discountValue / 100) : i.promo.discountValue;
    promoDiscount = round2(Math.min(subtotal, Math.max(0, raw)));
  }

  const totalCost = round2(i.rentalCost + addonsCost + deliveryFee + securityDeposit + i.wopecareTotalCost + i.driver.cost - promoDiscount);
  return { addonDays, addonsCost, deliveryFee, securityDeposit, promoDiscount, totalCost, driverCoversAll };
}
