// Static per-currency display metadata, mirroring the live values the old
// Laravel /currencies endpoint returned (confirmed via curl before this was
// written) so cutting over to Supabase doesn't change how any price looks.
// The `rate` field is deliberately NOT here - it's the one thing an admin
// can edit (Settings > Currency Rates -> app_settings.currency_rate_usd /
// currency_rate_eur), fetched separately by services/currencyApi.js. GHS
// has no rate setting because it's the base currency everything is stored
// in (constants/pricing.js's formatCurrency divides by rate to convert) -
// its rate is always exactly 1 by definition, never editable.
export const CURRENCY_META = {
  GHS: {
    code: 'GHS',
    name: 'Ghana Cedis',
    symbol: '¢',
    isMain: true,
    format: 'left',
    thousandSeparator: '',
    decimalSeparator: '.',
    decimals: 2,
  },
  USD: {
    code: 'USD',
    name: 'United States Dollar',
    symbol: '$',
    isMain: false,
    format: 'left',
    thousandSeparator: '.',
    decimalSeparator: ',',
    decimals: 0,
  },
  EUR: {
    code: 'EUR',
    name: 'Euro Member Countries',
    symbol: '€',
    isMain: false,
    format: 'left',
    thousandSeparator: '.',
    decimalSeparator: ',',
    decimals: 2,
  },
};
