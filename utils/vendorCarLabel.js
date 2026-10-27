// A vendor can list several cars of the same make/model (two Hyundai Elantras), so booking screens must say WHICH one. The year model
// tells most apart ("Hyundai Elantra 2019" vs "Hyundai Elantra 2021"); when name AND year are the same, the car's location (then a
// counter) is added, so every label in a vendor's fleet is unique.

function baseLabel(car) {
  const name = car.name ?? 'Untitled Car';
  const year = car.year ? String(car.year) : '';
  return year && !name.includes(year) ? `${name} ${year}` : name;
}

/** { [carId]: unique label } for a vendor's cars. */
export function buildCarLabels(cars = []) {
  const groups = new Map();
  for (const car of cars) {
    const label = baseLabel(car);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(car);
  }
  const labels = {};
  for (const [label, group] of groups) {
    if (group.length === 1) {
      labels[group[0].id] = label;
      continue;
    }
    // Same name and year: tell them apart by location, then number whatever is still ambiguous.
    const withLocation = group.map((c) => {
      const place = (c.location ?? '').split(',')[0].trim();
      return { c, label: place ? `${label} · ${place}` : label };
    });
    const seen = new Map();
    for (const { c, label: l } of withLocation) {
      const n = (seen.get(l) ?? 0) + 1;
      seen.set(l, n);
      labels[c.id] = n > 1 || withLocation.filter((x) => x.label === l).length > 1 ? `${l} (${n})` : l;
    }
  }
  return labels;
}
