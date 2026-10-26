'use client';

import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { makeQueryClient } from '@/lib/queryClient';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { CurrencyProvider } from '@/components/providers/CurrencyProvider';

/** Providers of the redesigned pages: theme, server data and the display currency. */
export function AppProviders({ children }: { children: ReactNode }) {
  // one client per browser tab; created in state so it survives re-renders but is not shared between requests
  const [queryClient] = useState(makeQueryClient);
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <CurrencyProvider>{children}</CurrencyProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
