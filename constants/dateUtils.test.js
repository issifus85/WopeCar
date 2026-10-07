import { parseDateOnly } from './dateUtils';

const LABEL = { month: 'short', day: 'numeric', year: 'numeric' };

test('a date-only string keeps its calendar day in the local timezone', () => {
  const d = parseDateOnly('2026-10-12');
  expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 12]);
  expect(d.toLocaleDateString('en-US', LABEL)).toBe('Oct 12, 2026');
});

test('month/year boundaries stay put', () => {
  expect(parseDateOnly('2026-12-31').toLocaleDateString('en-US', LABEL)).toBe('Dec 31, 2026');
  expect(parseDateOnly('2027-01-01').toLocaleDateString('en-US', LABEL)).toBe('Jan 1, 2027');
});

test('full timestamps and Date objects are unchanged', () => {
  expect(parseDateOnly('2026-10-07T23:03:39.000Z').getTime()).toBe(new Date('2026-10-07T23:03:39.000Z').getTime());
  const now = new Date();
  expect(parseDateOnly(now).getTime()).toBe(now.getTime());
});
