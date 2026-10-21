// Booking pickup/return times are stored as text, and the two clients write them differently: the mobile app saves "9:00 AM" / "1:00 PM",
// the website saves 24-hour "09:00" / "13:00" (a few older rows have "17:00:00"). Every server function that turns one into a real moment
// goes through here so both shapes are read the same way - reading "9:00 AM" as a 24-hour time gives an Invalid Date, and "10:00 PM" read
// as 10:00 would be twelve hours out.

export function parseTimeOfDay(time: string | null | undefined): { hour: number; minute: number } | null {
  if (!time) return null;
  const text = String(time).trim();
  const twelve = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i.exec(text);
  if (twelve) {
    const hour12 = parseInt(twelve[1], 10);
    const minute = parseInt(twelve[2], 10);
    if (hour12 < 1 || hour12 > 12 || minute > 59) return null;
    return { hour: (hour12 % 12) + (twelve[3].toUpperCase() === 'PM' ? 12 : 0), minute };
  }
  const twentyFour = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(text);
  if (twentyFour) {
    const hour = parseInt(twentyFour[1], 10);
    const minute = parseInt(twentyFour[2], 10);
    if (hour > 23 || minute > 59) return null;
    return { hour, minute };
  }
  return null;
}

/** 'YYYY-MM-DD' + a stored time in either format -> a Date. Missing/unreadable time falls back to `fallback` ('HH:MM', default midnight). */
export function combineDateAndTime(dateOnly: string, time: string | null | undefined, fallback = '00:00'): Date {
  const [y, m, d] = dateOnly.split('-').map(Number);
  const parsed = parseTimeOfDay(time) ?? parseTimeOfDay(fallback) ?? { hour: 0, minute: 0 };
  return new Date(y, m - 1, d, parsed.hour, parsed.minute, 0, 0);
}
