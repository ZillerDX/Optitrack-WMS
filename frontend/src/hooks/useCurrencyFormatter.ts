import { useCallback, useEffect } from 'react';
import { convertFromUsd, formatConvertedCurrency } from '@/lib/currency';
import { useCurrencyStore } from '@/store/useCurrencyStore';

export function useCurrencyFormatter() {
  const { currency, rates, fetchRates } = useCurrencyStore();

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  const formatCurrency = useCallback(
    (amount: number) => formatConvertedCurrency(Number(amount) || 0, currency, rates),
    [currency, rates]
  );

  const convertCurrency = useCallback(
    (amount: number) => convertFromUsd(Number(amount) || 0, currency, rates),
    [currency, rates]
  );

  return {
    currency,
    rates,
    formatCurrency,
    convertCurrency,
  };
}
