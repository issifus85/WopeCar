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
