import { inspectionAvailability } from './inspectionAvailability';

const avail = (type, bookingStatus, preStatus) => inspectionAvailability({ type, bookingStatus, preStatus }).available;

test('pre-rental opens once the booking is confirmed (and stays open through completed)', () => {
  expect(avail('pre', 'confirmed', null)).toBe(true);
  expect(avail('pre', 'confirmed', 'draft')).toBe(true);
  expect(avail('pre', 'completed', 'submitted')).toBe(true);
});

test('post-rental stays locked until the pre-rental inspection is submitted', () => {
  expect(avail('post', 'confirmed', null)).toBe(false);
  expect(avail('post', 'confirmed', undefined)).toBe(false);
  expect(avail('post', 'confirmed', 'draft')).toBe(false);
  expect(avail('post', 'confirmed', 'submitted')).toBe(true);
  expect(avail('post', 'completed', 'submitted')).toBe(true);
});

test('neither opens for a booking that is not confirmed or was cancelled', () => {
  for (const type of ['pre', 'post']) {
    expect(avail(type, 'pending', 'submitted')).toBe(false);
    expect(avail(type, 'cancelled', 'submitted')).toBe(false);
    expect(avail(type, undefined, 'submitted')).toBe(false);
  }
  expect(inspectionAvailability({ type: 'pre', bookingStatus: 'pending' }).reason).toMatch(/confirmed/);
  expect(inspectionAvailability({ type: 'post', bookingStatus: 'confirmed', preStatus: 'draft' }).reason).toMatch(/pre-rental/);
});

test('status match is case-insensitive', () => {
  expect(avail('pre', 'Confirmed', null)).toBe(true);
});
