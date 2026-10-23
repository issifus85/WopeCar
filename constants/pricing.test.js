import {
  calculateRentalPricing,
  SELF_DRIVE_CYCLE_HOURS,
  CHAUFFEUR_CYCLE_HOURS,
  DEFAULT_GRACE_PERIOD_MINUTES,
} from './pricing';

function hoursFrom(date, hours) {
  return new Date(new Date(date).getTime() + hours * 60 * 60 * 1000);
}

describe('calculateRentalPricing - Self-Drive (24-hour cycle)', () => {
  const drivenBy = 'Self-drive';
  const dailyRate = 300;

  it('bills 1 day for any duration up to 24 hours', () => {
    const startDate = '2026-08-01T08:00:00';
    const endDate = hoursFrom(startDate, 24);
    const result = calculateRentalPricing({ startDate, endDate, drivenBy, dailyRate });
    expect(result.billableDays).toBe(1);
    expect(result.rentalCost).toBe(dailyRate);
  });

  it('bills 2 days once duration exceeds 24 hours (no grace period)', () => {
    const startDate = '2026-08-01T08:00:00';
    const endDate = hoursFrom(startDate, 25);
    const result = calculateRentalPricing({
      startDate,
      endDate,
      drivenBy,
      dailyRate,
      useGracePeriod: false,
    });
    expect(result.billableDays).toBe(2);
    expect(result.rentalCost).toBe(dailyRate * 2);
  });

  it('absorbs up to the grace period past a 24h boundary without adding a day', () => {
    const startDate = '2026-08-01T08:00:00';
    const endDate = new Date(
      hoursFrom(startDate, 24).getTime() + DEFAULT_GRACE_PERIOD_MINUTES * 60 * 1000
    );
    const result = calculateRentalPricing({ startDate, endDate, drivenBy, dailyRate });
    expect(result.billableDays).toBe(1);
  });

  it('adds a day once past the grace period', () => {
    const startDate = '2026-08-01T08:00:00';
    const endDate = new Date(
      hoursFrom(startDate, 24).getTime() + (DEFAULT_GRACE_PERIOD_MINUTES + 1) * 60 * 1000
    );
    const result = calculateRentalPricing({ startDate, endDate, drivenBy, dailyRate });
    expect(result.billableDays).toBe(2);
  });

  it('applies the grace period at every 24h boundary, not just the first', () => {
    const startDate = '2026-08-01T08:00:00';
    // 48h + 1 minute is still within grace of the 48h boundary.
    const withinGrace = hoursFrom(startDate, 48 + 1 / 60);
    expect(
      calculateRentalPricing({ startDate, endDate: withinGrace, drivenBy, dailyRate }).billableDays
    ).toBe(2);

    // 48h + 30 minutes exceeds the grace window past the 48h boundary.
    const pastGrace = hoursFrom(startDate, 48.5);
    expect(
      calculateRentalPricing({ startDate, endDate: pastGrace, drivenBy, dailyRate }).billableDays
    ).toBe(3);
  });

  it('can disable the grace period entirely', () => {
    const startDate = '2026-08-01T08:00:00';
    const endDate = new Date(hoursFrom(startDate, 24).getTime() + 5 * 60 * 1000);
    const result = calculateRentalPricing({
      startDate,
      endDate,
      drivenBy,
      dailyRate,
      useGracePeriod: false,
    });
    expect(result.billableDays).toBe(2);
  });

  it('reports the 24-hour cycle length', () => {
    const startDate = '2026-08-01T08:00:00';
    const result = calculateRentalPricing({
      startDate,
      endDate: hoursFrom(startDate, 24),
      drivenBy,
      dailyRate,
    });
    expect(result.cycleHours).toBe(SELF_DRIVE_CYCLE_HOURS);
  });
});

describe('calculateRentalPricing - Chauffeur-Driven (12-hour cycle)', () => {
  const drivenBy = 'Chauffeur';
  const dailyRate = 500;

  it('bills 1 day for an 8:00 AM to 8:00 PM booking (12 hours)', () => {
    const result = calculateRentalPricing({
      startDate: '2026-08-01',
      endDate: '2026-08-01',
      pickupTime: '8:00 AM',
      returnTime: '8:00 PM',
      drivenBy,
      dailyRate,
    });
    expect(result.durationHours).toBe(12);
    expect(result.billableDays).toBe(1);
    expect(result.rentalCost).toBe(dailyRate);
  });

  it('bills 2 days once duration exceeds 12 hours', () => {
    const startDate = '2026-08-01T08:00:00';
    const endDate = hoursFrom(startDate, 13);
    const result = calculateRentalPricing({ startDate, endDate, drivenBy, dailyRate });
    expect(result.billableDays).toBe(2);
    expect(result.rentalCost).toBe(dailyRate * 2);
  });

  it('does not apply a grace period, even when requested', () => {
    const startDate = '2026-08-01T08:00:00';
    const endDate = hoursFrom(startDate, 12 + 5 / 60);
    const result = calculateRentalPricing({
      startDate,
      endDate,
      drivenBy,
      dailyRate,
      useGracePeriod: true,
    });
    expect(result.billableDays).toBe(2);
  });

  it('reports the 12-hour cycle length', () => {
    const result = calculateRentalPricing({
      startDate: '2026-08-01T08:00:00',
      endDate: '2026-08-01T20:00:00',
      drivenBy,
      dailyRate,
    });
    expect(result.cycleHours).toBe(CHAUFFEUR_CYCLE_HOURS);
  });

  it('bills a multi-day daytime hire per calendar day (7 AM-7 PM for 4 days = 4 days, not 7 cycles)', () => {
    const result = calculateRentalPricing({
      startDate: '2026-11-24',
      endDate: '2026-11-27',
      pickupTime: '7:00 AM',
      returnTime: '7:00 PM',
      drivenBy,
      dailyRate,
    });
    expect(result.billableDays).toBe(4);
  });

  it('adds a cycle for every day when the daily hire is longer than 12 hours', () => {
    const result = calculateRentalPricing({
      startDate: '2026-11-24',
      endDate: '2026-11-27',
      pickupTime: '7:00 AM',
      returnTime: '10:00 PM',
      drivenBy,
      dailyRate,
    });
    expect(result.billableDays).toBe(8);
  });

  it('bills across multiple 12h cycles using real pickup/return time slots', () => {
    // Pickup 6:00 PM day 1, return 6:00 PM day 3 = exactly 48 hours = 4 cycles.
    const result = calculateRentalPricing({
      startDate: '2026-08-01',
      endDate: '2026-08-03',
      pickupTime: '6:00 PM',
      returnTime: '6:00 PM',
      drivenBy,
      dailyRate,
    });
    expect(result.durationHours).toBe(48);
    expect(result.billableDays).toBe(4);
  });
});

describe('calculateRentalPricing - shared behavior', () => {
  it('clamps to a minimum of 1 billable day for zero/negative duration', () => {
    const startDate = '2026-08-01T08:00:00';
    const result = calculateRentalPricing({
      startDate,
      endDate: startDate,
      drivenBy: 'Self-drive',
      dailyRate: 100,
    });
    expect(result.billableDays).toBe(1);
    expect(result.rentalCost).toBe(100);
  });

  it('defaults dailyRate to 0 when not provided', () => {
    const startDate = '2026-08-01T08:00:00';
    const result = calculateRentalPricing({
      startDate,
      endDate: hoursFrom(startDate, 24),
      drivenBy: 'Self-drive',
    });
    expect(result.rentalCost).toBe(0);
  });

  it('aligns billable days to calendar dates starting from a bare date-only string regardless of runtime timezone', () => {
    const result = calculateRentalPricing({
      startDate: '2026-09-01',
      endDate: '2026-09-03',
      drivenBy: 'Self-drive',
      dailyRate: 100,
    });
    expect(result.dailyBreakdown.map((d) => d.date)).toEqual(['2026-09-01', '2026-09-02']);
  });
});

describe('calculateRentalPricing - per-date custom pricing', () => {
  it('uses getDatePrice for a specific calendar date and falls back to dailyRate elsewhere', () => {
    const getDatePrice = (iso) => (iso === '2026-09-02' ? 900 : undefined);
    const result = calculateRentalPricing({
      startDate: '2026-09-01',
      endDate: '2026-09-04',
      drivenBy: 'Self-drive',
      dailyRate: 300,
      getDatePrice,
    });
    expect(result.billableDays).toBe(3);
    expect(result.dailyBreakdown).toEqual([
      { date: '2026-09-01', rate: 300 },
      { date: '2026-09-02', rate: 900 },
      { date: '2026-09-03', rate: 300 },
    ]);
    expect(result.baseRentalCost).toBe(1500);
    expect(result.rentalCost).toBe(1500);
  });
});

describe('calculateRentalPricing - length-of-stay discount', () => {
  const tiers = [
    { minDays: 7, type: 'percentage', value: 10 },
    { minDays: 28, type: 'percentage', value: 20 },
  ];

  it('applies no tier below the shortest threshold', () => {
    const result = calculateRentalPricing({
      startDate: '2026-09-01',
      endDate: '2026-09-04',
      drivenBy: 'Self-drive',
      dailyRate: 100,
      lengthOfStayDiscounts: tiers,
    });
    expect(result.appliedLengthOfStayTier).toBeNull();
    expect(result.rentalCost).toBe(300);
  });

  it('applies the weekly tier once the trip is long enough', () => {
    const result = calculateRentalPricing({
      startDate: '2026-09-01',
      endDate: '2026-09-08',
      drivenBy: 'Self-drive',
      dailyRate: 100,
      lengthOfStayDiscounts: tiers,
    });
    expect(result.billableDays).toBe(7);
    expect(result.appliedLengthOfStayTier.minDays).toBe(7);
    expect(result.lengthOfStayDiscountAmount).toBe(70);
    expect(result.rentalCost).toBe(630);
  });

  it('applies the richest eligible tier rather than stacking them', () => {
    const startDate = '2026-09-01';
    const endDate = new Date(2026, 8, 1 + 28);
    const result = calculateRentalPricing({
      startDate,
      endDate,
      drivenBy: 'Self-drive',
      dailyRate: 100,
      lengthOfStayDiscounts: tiers,
    });
    expect(result.billableDays).toBe(28);
    expect(result.appliedLengthOfStayTier.minDays).toBe(28);
    expect(result.lengthOfStayDiscountAmount).toBe(560);
    expect(result.rentalCost).toBe(2240);
  });
});

describe('calculateRentalPricing - blanket discount', () => {
  it('applies a flat discount after the length-of-stay discount', () => {
    const result = calculateRentalPricing({
      startDate: '2026-09-01',
      endDate: '2026-09-04',
      drivenBy: 'Self-drive',
      dailyRate: 100,
      discount: { enabled: true, type: 'flat', value: 50 },
    });
    expect(result.blanketDiscountAmount).toBe(50);
    expect(result.rentalCost).toBe(250);
  });

  it('applies a percentage discount on top of an already length-of-stay-discounted subtotal', () => {
    const result = calculateRentalPricing({
      startDate: '2026-09-01',
      endDate: '2026-09-08',
      drivenBy: 'Self-drive',
      dailyRate: 100,
      lengthOfStayDiscounts: [{ minDays: 7, type: 'percentage', value: 10 }],
      discount: { enabled: true, type: 'percentage', value: 10 },
    });
    // base 700 -> -10% length-of-stay = 630 -> -10% blanket = 567
    expect(result.lengthOfStayDiscountAmount).toBe(70);
    expect(result.blanketDiscountAmount).toBe(63);
    expect(result.rentalCost).toBe(567);
    expect(result.totalDiscount).toBe(133);
  });

  it('does nothing when disabled', () => {
    const result = calculateRentalPricing({
      startDate: '2026-09-01',
      endDate: '2026-09-04',
      drivenBy: 'Self-drive',
      dailyRate: 100,
      discount: { enabled: false, type: 'flat', value: 50 },
    });
    expect(result.blanketDiscountAmount).toBe(0);
    expect(result.rentalCost).toBe(300);
  });

  it('only applies within its start/end date window', () => {
    const outsideWindow = calculateRentalPricing({
      startDate: '2026-09-01',
      endDate: '2026-09-04',
      drivenBy: 'Self-drive',
      dailyRate: 100,
      discount: { enabled: true, type: 'flat', value: 50, startsAt: '2026-10-01', endsAt: '2026-10-31' },
    });
    expect(outsideWindow.blanketDiscountAmount).toBe(0);

    const insideWindow = calculateRentalPricing({
      startDate: '2026-09-01',
      endDate: '2026-09-04',
      drivenBy: 'Self-drive',
      dailyRate: 100,
      discount: { enabled: true, type: 'flat', value: 50, startsAt: '2026-08-15', endsAt: '2026-09-15' },
    });
    expect(insideWindow.blanketDiscountAmount).toBe(50);
  });
});

describe('calculateRentalPricing - stored time formats', () => {
  const base = { drivenBy: 'Self-drive', dailyRate: 300 };

  it('reads the website\'s 24-hour times the same as the app\'s AM/PM slots', () => {
    const app = calculateRentalPricing({ ...base, startDate: '2026-11-27', endDate: '2026-12-02', pickupTime: '10:00 AM', returnTime: '10:00 AM' });
    const web = calculateRentalPricing({ ...base, startDate: '2026-11-27', endDate: '2026-12-02', pickupTime: '10:00', returnTime: '10:00' });
    expect(app.billableDays).toBe(5);
    expect(web.billableDays).toBe(5);
  });

  it('reads an evening 24-hour time as the evening (17:00 is 5 PM, not midnight)', () => {
    const web = calculateRentalPricing({ ...base, startDate: '2026-10-15', endDate: '2026-10-19', pickupTime: '17:00', returnTime: '13:00' });
    const app = calculateRentalPricing({ ...base, startDate: '2026-10-15', endDate: '2026-10-19', pickupTime: '5:00 PM', returnTime: '1:00 PM' });
    expect(web.billableDays).toBe(app.billableDays);
    expect(web.billableDays).toBe(4);
  });

  it('chauffeur daytime hire reads 24-hour times (07:00-19:00 for 4 days bills 4)', () => {
    const web = calculateRentalPricing({ drivenBy: 'Chauffeur', dailyRate: 500, startDate: '2026-12-01', endDate: '2026-12-04', pickupTime: '07:00', returnTime: '19:00' });
    expect(web.billableDays).toBe(4);
  });

  it('does not bill an extra day when a clock change falls inside the trip (wall-clock, not elapsed time)', () => {
    // 96 wall-clock hours across the 25 Oct 2026 UK clock change is 97 elapsed hours there; it must still bill 4 days.
    const r = calculateRentalPricing({ ...base, startDate: '2026-10-23', endDate: '2026-10-27', pickupTime: '10:00 AM', returnTime: '10:00 AM' });
    expect(r.billableDays).toBe(4);
  });
});

describe('driver mode - a self-drive car booked WITH a WopeCar driver follows the chauffeur rules', () => {
  const { applyDriverMode, calculateWithDriver, calculateSecurityDeposit, getMinBookingDays } = require('./pricing');
  const selfDriveCar = { id: 'c1', drivenBy: 'Self-drive', pricePerDay: 1050 };

  it('is a view of the car: chauffeur rules with a driver, the car\'s own type kept, and a no-op without one', () => {
    const withDriver = applyDriverMode(selfDriveCar, true);
    expect(withDriver.drivenBy).toBe('Chauffeur');
    expect(withDriver.ownDrivenBy).toBe('Self-drive');
    expect(applyDriverMode(withDriver, false).drivenBy).toBe('Self-drive'); // idempotent / reversible
    expect(applyDriverMode(selfDriveCar, false)).toBe(selfDriveCar);
    expect(applyDriverMode({ id: 'c2', drivenBy: 'Chauffeur' }, true).drivenBy).toBe('Chauffeur'); // a chauffeur car already has a driver
    expect(applyDriverMode(null, true)).toBeNull();
  });

  const price = (car, startDate, endDate, pickupTime, returnTime) =>
    calculateRentalPricing({ startDate, endDate, pickupTime, returnTime, drivenBy: car.drivenBy, dailyRate: car.pricePerDay, appWideDiscount: null });

  it('bills in 12-hour units at the SAME daily rate; the driver adds 300 per billed unit', () => {
    const car = applyDriverMode(selfDriveCar, true);
    const cases = [
      // [label, start, end, pickup, return, units]
      ['same-day daytime hire 7AM-7PM', '2026-12-01', '2026-12-01', '7:00 AM', '7:00 PM', 1],
      ['3 calendar days, 7AM-7PM each', '2026-12-01', '2026-12-03', '7:00 AM', '7:00 PM', 3],
      ['overnight, 10AM to 10AM next day (24h)', '2026-12-01', '2026-12-02', '10:00 AM', '10:00 AM', 2],
    ];
    for (const [label, s, e, pt, rt, units] of cases) {
      const p = price(car, s, e, pt, rt);
      expect({ label, units: p.billableDays }).toEqual({ label, units });
      expect(p.rentalCost).toBe(1050 * units);
      const driver = calculateWithDriver(true, null, p.billableDays, 300);
      expect(driver.cost).toBe(300 * units);
      expect(driver.coversAll).toBe(true);
    }
    // the same 24-hour trip WITHOUT a driver is the self-drive rule: 1 day, no 12-hour count
    expect(price(selfDriveCar, '2026-12-01', '2026-12-02', '10:00 AM', '10:00 AM').billableDays).toBe(1);
  });

  it('driver mode: flat chauffeur deposit and a 1-day minimum; without a driver the 25% deposit and the 3-day minimum return', () => {
    const car = applyDriverMode(selfDriveCar, true);
    expect(calculateSecurityDeposit(8568, car.drivenBy, true)).toBe(500);
    expect(getMinBookingDays(car.drivenBy)).toBe(1);
    expect(getMinBookingDays(selfDriveCar.drivenBy)).toBe(3);
    expect(calculateSecurityDeposit(8568, selfDriveCar.drivenBy, false)).toBe(8568 * 0.25);
  });
});
