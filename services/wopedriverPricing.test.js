const { quoteDay, quoteTotals, startOptions, maxHoursFor, clampDay, timeLabel, toTimeString, fromTimeString } = require('./wopedriverPricing');

// Same placeholder rate card the migration seeds, so these match the SQL results checked on Postgres.
const config = {
  settings: { extraHourRate: 50, minHours: 2, maxHoursPerDay: 12, earliestStartHour: 5, latestEndHour: 23 },
  packages: [
    { id: 'p4', label: 'Half day', hours: 4, price: 250 },
    { id: 'p8', label: 'Full day', hours: 8, price: 400 },
    { id: 'p12', label: 'Long day', hours: 12, price: 550 },
  ],
  zones: [
    { id: 'z0', label: 'Within Greater Accra', addonFee: 0 },
    { id: 'z1', label: 'Outside Greater Accra', addonFee: 150 },
    { id: 'z2', label: 'Long distance', addonFee: 350 },
  ],
};

test('prices match the database for the seeded rate card', () => {
  expect(quoteDay(config, 8, 'z0')).toMatchObject({ packageLabel: 'Full day', base: 400, extraHours: 0, extra: 0, addon: 0, total: 400 });
  expect(quoteDay(config, 10, 'z1')).toMatchObject({ packageLabel: 'Full day', base: 400, extraHours: 2, extra: 100, addon: 150, total: 650 });
  expect(quoteDay(config, 5, 'z0')).toMatchObject({ packageLabel: 'Half day', extraHours: 1, total: 300 });
  expect(quoteDay(config, 2, 'z0')).toMatchObject({ packageLabel: 'Half day', total: 250 });
  expect(quoteDay(config, 10, 'z2').total).toBe(850);
});

test('picks the bigger package when it is cheaper than extra hours', () => {
  // 7 hrs: Half day + 3 extra = 400, Full day = 400 -> tie goes to no extra hours.
  expect(quoteDay(config, 7, 'z0')).toMatchObject({ packageLabel: 'Full day', extraHours: 0, total: 400 });
});

test('falls back to hourly with no packages', () => {
  expect(quoteDay({ ...config, packages: [] }, 3, 'z1')).toMatchObject({ packageLabel: 'Hourly', base: 0, extraHours: 3, extra: 150, total: 300 });
});

test('totals add up across days in date order', () => {
  const t = quoteTotals(config, {
    '2026-11-11': { start: 9.5, hours: 10, zoneId: 'z2' },
    '2026-11-10': { start: 8, hours: 8, zoneId: 'z0' },
  });
  expect(t.items.map((i) => i.date)).toEqual(['2026-11-10', '2026-11-11']);
  expect(t).toMatchObject({ count: 2, base: 800, extra: 100, addon: 350, total: 1250 });
});

test('time window helpers', () => {
  const opts = startOptions(config.settings);
  expect(opts[0]).toBe(5);
  expect(opts[opts.length - 1]).toBe(21);
  expect(maxHoursFor(config.settings, 20)).toBe(3);
  expect(clampDay(config.settings, { start: 20, hours: 8 })).toEqual({ start: 20, hours: 3 });
  expect(clampDay(config.settings, { start: 3, hours: 1 })).toEqual({ start: 5, hours: 2 });
  expect(timeLabel(13.5)).toBe('1:30 PM');
  expect(timeLabel(0)).toBe('12:00 AM');
  expect(toTimeString(8.5)).toBe('08:30');
  expect(fromTimeString('09:30:00')).toBe(9.5);
});
