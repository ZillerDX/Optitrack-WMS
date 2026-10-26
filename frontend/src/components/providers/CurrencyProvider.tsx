'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCompactMoney, formatMoney } from '@/lib/format';
import { FALLBACK_USD_RATES } from '@/lib/currency';
import { DEFAULT_CURRENCY, fetchRates, readStoredCurrency, storeCurrency, type SupportedCurrency } from '@/lib/currencyPreference';

interface CurrencyContextValue {
  currency: SupportedCurrency;
  setCurrency: (currency: SupportedCurrency) => void;
  /** An amount stored in USD, shown in the chosen currency. */
  format: (amountUsd: number) => string;
  /** The same, short for chart axes: $1.2K. */
  formatCompact: (amountUsd: number) => string;
  /** False while only the built-in fallback rate is available. */
  liveRates: boolean;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  // server and first client render both say USD; the stored choice is read after mount (no hydration mismatch)
  const [currency, setCurrencyState] = useState<SupportedCurrency>(DEFAULT_CURRENCY);
  useEffect(() => setCurrencyState(readStoredCurrency()), []);

  // The rates are only needed when the choice is not USD. They change slowly: one hour, no retry (the fallback is fine).
  const rates = useQuery({
    queryKey: ['rates', 'usd'],
    queryFn: ({ signal }) => fetchRates(signal),
    enabled: currency !== 'USD',
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const setCurrency = useCallback((next: SupportedCurrency) => {
    storeCurrency(next);
    setCurrencyState(next);
  }, []);

  const value = useMemo<CurrencyContextValue>(() => {
    const table = rates.data ?? FALLBACK_USD_RATES;
    return {
      currency,
      setCurrency,
      format: (amountUsd) => formatMoney(amountUsd, currency, table[currency]),
      formatCompact: (amountUsd) => formatCompactMoney(amountUsd, currency, table[currency]),
      liveRates: currency === 'USD' || Boolean(rates.data),
    };
  }, [currency, rates.data, setCurrency]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyContextValue {
  const value = useContext(CurrencyContext);
  if (!value) throw new Error('useCurrency must be used inside CurrencyProvider');
  return value;
}
