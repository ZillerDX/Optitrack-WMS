import { create } from 'zustand';
import {
  DEFAULT_CURRENCY,
  FALLBACK_USD_RATES,
  isSupportedCurrency,
  type SupportedCurrency,
} from '@/lib/currency';

interface CurrencyState {
  currency: SupportedCurrency;
  rates: Record<SupportedCurrency, number>;
  isLoadingRates: boolean;
  lastUpdated: string | null;
  setCurrency: (currency: SupportedCurrency) => void;
  fetchRates: () => Promise<void>;
}

const STORAGE_KEY = 'optitrack_currency';

const getInitialCurrency = (): SupportedCurrency => {
  if (typeof window === 'undefined') return DEFAULT_CURRENCY;
  const storedCurrency = window.localStorage.getItem(STORAGE_KEY);
  return isSupportedCurrency(storedCurrency) ? storedCurrency : DEFAULT_CURRENCY;
};

export const useCurrencyStore = create<CurrencyState>((set) => ({
  currency: getInitialCurrency(),
  rates: FALLBACK_USD_RATES,
  isLoadingRates: false,
  lastUpdated: null,
  setCurrency: (currency) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, currency);
    }
    set({ currency });
  },
  fetchRates: async () => {
    set({ isLoadingRates: true });
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!response.ok) {
        throw new Error('Failed to fetch exchange rates');
      }
      const data = await response.json();
      set({
        rates: {
          USD: 1,
          THB: Number(data.rates?.THB) || FALLBACK_USD_RATES.THB,
          EUR: Number(data.rates?.EUR) || FALLBACK_USD_RATES.EUR,
        },
        lastUpdated: typeof data.time_last_update_utc === 'string' ? data.time_last_update_utc : new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to fetch currency rates:', error);
      set({ rates: FALLBACK_USD_RATES });
    } finally {
      set({ isLoadingRates: false });
    }
  },
}));
