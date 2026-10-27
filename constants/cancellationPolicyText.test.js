import { buildCancellationPolicyText } from '../constants/cancellationPolicyText';

describe('buildCancellationPolicyText', () => {
  it('uses the standard 48h / 24h / 50% wording by default and ends with the in-trip rule', () => {
    const t = buildCancellationPolicyText();
    expect(t).toContain('Full refund if cancelled at least 48 hours before pickup.');
    expect(t).toContain('50% refund if cancelled between 24 and 48 hours before.');
    expect(t).toContain('No refund of the rental charges inside 24 hours of pickup.');
    expect(t).toContain('Once the trip has started, cancellations, early returns and changes that shorten the trip are non-refundable');
  });
  it('follows the admin-configured hours and percentage', () => {
    const t = buildCancellationPolicyText({ fullHours: 72, partialHours: 36, partialPercentage: 0.25 });
    expect(t).toContain('at least 72 hours');
    expect(t).toContain('25% refund if cancelled between 36 and 72 hours');
    expect(t).toContain('inside 36 hours of pickup');
  });
});
