import supabase from './supabase';

/**
 * Real per-date price overrides for a car (the `car_date_prices` table) -
 * shared by the vendor and admin pricing calendars, and read by the
 * checkout pricing engine via `getDatePriceMap`. Any date without a row
 * here just falls back to the car's base `price_per_day`.
 */
export async function listDatePrices(carId, { fromDate, toDate } = {}) {
  let query = supabase.from('car_date_prices').select('date, price').eq('car_id', carId).order('date');
  if (fromDate) query = query.gte('date', fromDate);
  if (toDate) query = query.lte('date', toDate);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** {iso: price} lookup map, ready to hand to calculateRentalPricing's getDatePrice. */
export async function getDatePriceMap(carId, range) {
  const rows = await listDatePrices(carId, range);
  const map = {};
  rows.forEach((r) => { map[r.date] = Number(r.price); });
  return map;
}

/** Sets the same price for every date in `dates` (the Airbnb-style "select dates, set a price" flow). */
export async function upsertDatePrices(carId, dates, price) {
  if (!dates?.length) return [];
  const rows = dates.map((date) => ({ car_id: carId, date, price, updated_at: new Date().toISOString() }));
  const { data, error } = await supabase
    .from('car_date_prices')
    .upsert(rows, { onConflict: 'car_id,date' })
    .select('date, price');
  if (error) throw error;
  return data ?? [];
}

/** Clears any custom price for the given dates, reverting them to the car's base rate. */
export async function deleteDatePrices(carId, dates) {
  if (!dates?.length) return;
  const { error } = await supabase.from('car_date_prices').delete().eq('car_id', carId).in('date', dates);
  if (error) throw error;
}
