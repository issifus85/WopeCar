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
});
