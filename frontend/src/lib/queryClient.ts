import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/apiFetch';

/**
 * Defaults for every query in the app (PLAN.md, "Architecture assessment"):
 * - data is fresh for 30 s and refetched when the user comes back to the window: no setInterval polling
 * - one retry for a network or server failure, none for a 4xx (the request itself is wrong or refused)
 * - mutations are never retried (a stock movement must not be sent twice)
 */
export const STALE_TIME_MS = 30_000;

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return true;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        refetchOnWindowFocus: true,
        retry: shouldRetry,
      },
      mutations: { retry: false },
    },
  });
}
