// WopeDriver pricing - the live estimate shown while the customer plans their days.
// Mirrors public.wopedriver_price_day() / wopedriver_quote() in supabase/migrations/0171_wopedriver.sql exactly;
// the database recomputes the price when the request is created, and that is what is recorded.
//
// config = {
//   settings: { extraHourRate, minHours, maxHoursPerDay, earliestStartHour, latestEndHour, ... },
//   packages: [{ id, label, hours, price }], zones: [{ id, label, description, addonFee }]
// }

// Cheapest way to cover `hours`: a package plus extra hours past it, or plain hourly when there are no packages.
// Ties go to fewer extra hours, then the smaller package (same ORDER BY as the SQL).
export function quoteDay(config, hours, zoneId) {
  const rate = Number(config.settings.extraHourRate) || 0;
  const zone = config.zones.find((z) => z.id === zoneId) ?? null;
  let best = null;
  for (const p of config.packages) {
    const extraHours = Math.max(hours - p.hours, 0);
    const cost = p.price + extraHours * rate;
    if (
      !best
      || cost < best.cost
      || (cost === best.cost && extraHours < best.extraHours)
      || (cost === best.cost && extraHours === best.extraHours && p.hours < best.pkg.hours)
    ) {
      best = { pkg: p, cost, extraHours };
    }
  }
  const packageLabel = best ? best.pkg.label : 'Hourly';
  const base = best ? best.pkg.price : 0;
  const extraHours = best ? best.extraHours : hours;
  const extra = extraHours * rate;
  const addon = zone ? zone.addonFee : 0;
  return { packageLabel, base, extraHours, extra, addon, zone, total: base + extra + addon };
}

export function maxHoursFor(settings, start) {
  return Math.max(0, Math.min(settings.maxHoursPerDay, settings.latestEndHour - start));
}

// Start times every 30 minutes, leaving room for at least the minimum hours before the latest end.
export function startOptions(settings) {
  const out = [];
  const first = Math.ceil(settings.earliestStartHour * 2) / 2;
  for (let h = first; h + settings.minHours <= settings.latestEndHour + 1e-9; h += 0.5) out.push(h);
  return out;
}

export function clampDay(settings, day) {
  const opts = startOptions(settings);
  let start = day.start;
  if (!opts.includes(start)) start = opts.reduce((a, b) => (Math.abs(b - start) < Math.abs(a - start) ? b : a), opts[0] ?? settings.earliestStartHour);
  const hours = Math.max(settings.minHours, Math.min(day.hours, maxHoursFor(settings, start)));
  return { ...day, start, hours };
}

export function quoteTotals(config, daysByDate) {
  const items = Object.keys(daysByDate).sort().map((date) => {
    const d = daysByDate[date];
    return { date, day: d, quote: quoteDay(config, d.hours, d.zoneId) };
  });
  const sum = (k) => items.reduce((acc, it) => acc + it.quote[k], 0);
  return { items, count: items.length, base: sum('base'), extra: sum('extra'), addon: sum('addon'), total: sum('total') };
}

// 8 -> '8:00 AM', 13.5 -> '1:30 PM'
export function timeLabel(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.round((hour - Math.floor(hour)) * 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 && hour < 24 ? 'PM' : 'AM'}`;
}

// 8.5 -> '08:30' (what the database takes)
export function toTimeString(hour) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// '08:30:00' -> 8.5
export function fromTimeString(value) {
  const [h, m] = String(value ?? '0:0').split(':').map(Number);
  return (h || 0) + (m || 0) / 60;
}
