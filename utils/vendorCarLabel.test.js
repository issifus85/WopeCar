import { buildCarLabels } from './vendorCarLabel';

describe('buildCarLabels', () => {
  it('adds the year model so same-model cars of different years differ', () => {
    const labels = buildCarLabels([
      { id: 'a', name: 'Hyundai Elantra', year: 2019, location: 'Spintex, Accra' },
      { id: 'b', name: 'Hyundai Elantra', year: 2021, location: 'Osu, Accra' },
    ]);
    expect(labels).toEqual({ a: 'Hyundai Elantra 2019', b: 'Hyundai Elantra 2021' });
  });

  it('does not repeat a year the name already carries', () => {
    expect(buildCarLabels([{ id: 'a', name: 'Toyota RAV4 2018', year: 2018 }]).a).toBe('Toyota RAV4 2018');
  });

  it('falls back to location, then a counter, when name and year are identical', () => {
    const labels = buildCarLabels([
      { id: 'a', name: 'Honda CR-V', year: 2022, location: 'Osu, Accra' },
      { id: 'b', name: 'Honda CR-V', year: 2022, location: 'East Legon, Accra' },
      { id: 'c', name: 'Kia Sportage', year: 2020, location: 'Osu' },
      { id: 'd', name: 'Kia Sportage', year: 2020, location: 'Osu' },
    ]);
    expect(labels.a).toBe('Honda CR-V 2022 · Osu');
    expect(labels.b).toBe('Honda CR-V 2022 · East Legon');
    expect(labels.c).toBe('Kia Sportage 2020 · Osu (1)');
    expect(labels.d).toBe('Kia Sportage 2020 · Osu (2)');
  });

  it('every label in a fleet is unique', () => {
    const cars = Array.from({ length: 6 }, (_, i) => ({ id: String(i), name: 'Toyota Corolla', year: 2018, location: 'Accra' }));
    const values = Object.values(buildCarLabels(cars));
    expect(new Set(values).size).toBe(6);
  });
});
