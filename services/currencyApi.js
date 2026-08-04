import supabase from './supabase';
import { CURRENCY_META } from '../constants/currencies';

const RATE_KEYS = {
  USD: 'currency_rate_usd',
  EUR: 'currency_rate_eur',
};

// Replaces the old Laravel /currencies endpoint (services/api.js) - still
// live and unauthenticated today, but every other backend capability in
// this app has moved to Supabase, and the admin needs to *edit* these
// rates (Settings > Currency Rates), which the Laravel admin panel this
// app no longer manages isn't wired up for. GHS's rate is hardcoded to 1
// since it's the base currency every stored price is already in.
export async function getCurrencies() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', Object.values(RATE_KEYS));
  if (error) throw error;

  const rateByKey = Object.fromEntries((data ?? []).map((row) => [row.key, Number(row.value)]));

  return [
    { ...CURRENCY_META.GHS, rate: 1 },
    { ...CURRENCY_META.USD, rate: rateByKey[RATE_KEYS.USD] || 14.5 },
    { ...CURRENCY_META.EUR, rate: rateByKey[RATE_KEYS.EUR] || 15.42 },
  ];
}
