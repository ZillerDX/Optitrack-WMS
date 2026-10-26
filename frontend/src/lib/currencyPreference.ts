import { FALLBACK_USD_RATES, isSupportedCurrency, SUPPORTED_CURRENCIES, DEFAULT_CURRENCY, type SupportedCurrency } from '@/lib/currency';

/**
 * Display currency of the redesigned pages. Amounts are stored in US dollars; this only decides how they are
 * shown. It uses the same storage key as the pages not yet redesigned, so a choice made on either applies
 * to both.
 */
export const CURRENCY_STORAGE_KEY = 'optitrack_currency';
export const RATES_URL = 'https://open.er-api.com/v6/latest/USD';

export { SUPPORTED_CURRENCIES, DEFAULT_CURRENCY };
export type { SupportedCurrency };

export function readStoredCurrency(): SupportedCurrency {
  try {
    const value = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
    return isSupportedCurrency(value) ? value : DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

export function storeCurrency(currency: SupportedCurrency): void {
  try {
    window.localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
  } catch {
    // storage blocked: the choice applies until the page is closed
  }
}

export type Rates = Record<SupportedCurrency, number>;

/**
 * Rates from the provider's answer, with the fallback for anything missing or not a positive number
 * (a bad rate would show wrong money).
 */
export function parseRates(body: unknown): Rates {
  const raw = (body as { rates?: Record<string, unknown> } | null)?.rates ?? {};
  const pick = (code: SupportedCurrency): number => {
    const n = Number(raw[code]);
    return Number.isFinite(n) && n > 0 ? n : FALLBACK_USD_RATES[code];
  };
  return { USD: 1, THB: pick('THB'), EUR: pick('EUR') };
}

export async function fetchRates(signal?: AbortSignal): Promise<Rates> {
  const response = await fetch(RATES_URL, { signal });
  if (!response.ok) throw new Error(`Exchange rates answered ${response.status}`);
  return parseRates(await response.json());
}
