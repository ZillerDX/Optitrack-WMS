export const SUPPORTED_CURRENCIES = ['USD', 'THB', 'EUR'] as const;

export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

export const DEFAULT_CURRENCY: SupportedCurrency = 'USD';

export const CURRENCY_LOCALES: Record<SupportedCurrency, string> = {
  USD: 'en-US',
  THB: 'th-TH',
  EUR: 'de-DE',
};

export const FALLBACK_USD_RATES: Record<SupportedCurrency, number> = {
  USD: 1,
  THB: 36,
  EUR: 0.92,
};

export function isSupportedCurrency(value: string | null): value is SupportedCurrency {
  return SUPPORTED_CURRENCIES.includes(value as SupportedCurrency);
}

export function convertFromUsd(amount: number, currency: SupportedCurrency, rates: Record<SupportedCurrency, number>): number {
  return amount * rates[currency];
}

export function formatConvertedCurrency(amount: number, currency: SupportedCurrency, rates: Record<SupportedCurrency, number>): string {
  return new Intl.NumberFormat(CURRENCY_LOCALES[currency], {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'THB' ? 0 : 2,
  }).format(convertFromUsd(amount, currency, rates));
}
