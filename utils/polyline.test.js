import { decodePolyline, formatEta, formatDistance } from './polyline';

describe('decodePolyline', () => {
  it('decodes the reference Google example', () => {
    const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(pts).toHaveLength(3);
    expect(pts[0]).toEqual({ latitude: 38.5, longitude: -120.2 });
    expect(pts[1].latitude).toBeCloseTo(40.7, 5);
    expect(pts[1].longitude).toBeCloseTo(-120.95, 5);
    expect(pts[2].latitude).toBeCloseTo(43.252, 5);
    expect(pts[2].longitude).toBeCloseTo(-126.453, 5);
  });
  it('returns [] for empty input', () => {
    expect(decodePolyline(null)).toEqual([]);
    expect(decodePolyline('')).toEqual([]);
  });
});

describe('formatEta / formatDistance', () => {
  it('formats', () => {
    expect(formatEta(20)).toBe('Less than a minute');
    expect(formatEta(720)).toBe('12 min');
    expect(formatEta(3900)).toBe('1 h 5 min');
    expect(formatEta(null)).toBeNull();
    expect(formatDistance(437)).toBe('440 m');
    expect(formatDistance(4200)).toBe('4.2 km');
    expect(formatDistance(15400)).toBe('15 km');
  });
});
