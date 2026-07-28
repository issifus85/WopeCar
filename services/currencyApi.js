import { request } from './api';

function normalizeCurrency(raw) {
  return {
    code: raw.code,
    name: raw.name,
    symbol: raw.symbol,
    rate: Number(raw.rate) || 1,
    isMain: !!raw.is_main,
    format: raw.format,
    thousandSeparator: raw.thousand_separator,
    decimalSeparator: raw.decimal_separator,
    decimals: Number(raw.decimals) || 0,
  };
}

export async function getCurrencies() {
  const json = await request('/currencies');
  return (json.data ?? []).map(normalizeCurrency);
}
