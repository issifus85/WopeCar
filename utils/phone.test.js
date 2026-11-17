import { isUsablePhone } from './phone';

describe('isUsablePhone', () => {
  it('accepts Ghana and international numbers in common formats', () => {
    expect(isUsablePhone('024 000 0000')).toBe(true);
    expect(isUsablePhone('+233 24 000 0000')).toBe(true);
    expect(isUsablePhone('+44 7700 900123')).toBe(true);
  });

  it('rejects empty and junk values', () => {
    expect(isUsablePhone('')).toBe(false);
    expect(isUsablePhone(null)).toBe(false);
    expect(isUsablePhone(undefined)).toBe(false);
    expect(isUsablePhone('   ')).toBe(false);
    expect(isUsablePhone('0')).toBe(false);
    expect(isUsablePhone('abc')).toBe(false);
    expect(isUsablePhone('12345')).toBe(false);
  });
});
