import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, apiGet, ApiError } from '@/lib/apiFetch';
import { makeQueryClient, shouldRetry, STALE_TIME_MS } from '@/lib/queryClient';

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
let calls: Array<{ url: string; init: RequestInit }>;
const respond = (handler: Handler) => {
  calls = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    return handler(String(input), init ?? {});
  });
};
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('returns the body, the total and the truncated flag of a list', async () => {
    respond(() => json([{ id: 1 }], 200, { 'x-total-count': '1500', 'x-truncated': 'true' }));
    const result = await apiFetch<Array<{ id: number }>>('/api/products');
    expect(result).toEqual({ data: [{ id: 1 }], total: 1500, truncated: true });
  });

  it('has no total when the header is missing or not a number', async () => {
    respond(() => json([], 200, { 'x-total-count': 'many' }));
    expect(await apiFetch('/api/products')).toMatchObject({ total: null, truncated: false });
  });

  it('sends the session cookie to the same origin and JSON bodies as JSON', async () => {
    respond(() => json({ ok: true }));
    await apiFetch('/api/transactions', { method: 'POST', json: { type: 'INBOUND', quantity: 3 } });
    expect(calls[0].init.credentials).toBe('same-origin');
    expect(calls[0].init.body).toBe('{"type":"INBOUND","quantity":3}');
    expect((calls[0].init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('turns the API\'s own message into the error message', async () => {
    respond(() => json({ detail: "Location 'A1' capacity exceeded. Capacity: 10, Current stock: 4, Projected stock: 11" }, 400));
    const error = await apiFetch('/api/transactions', { method: 'POST', json: {} }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.message).toMatch(/capacity exceeded/);
  });

  it('also reads a PostgREST style message', async () => {
    respond(() => json({ message: 'Insufficient stock. Available: 3, Requested: 5' }, 400));
    expect((await apiFetch('/x').catch((e) => e)).message).toMatch(/Insufficient stock/);
  });

  it('never shows raw server text for an unexpected failure', async () => {
    respond(() => new Response('<html>Internal Server Error at /var/app/secret.js</html>', { status: 500 }));
    const error = await apiFetch('/x').catch((e) => e);
    expect(error.status).toBe(500);
    expect(error.message).not.toMatch(/secret|html/i);
    expect(error.message).toMatch(/try again/i);
  });

  it('has a plain message for 429', async () => {
    respond(() => json({}, 429));
    expect((await apiFetch('/x').catch((e) => e)).message).toMatch(/Too many requests/);
  });

  it('reports a network failure as status 0 with a message the user can act on', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    const error = await apiFetch('/x').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.message).toMatch(/connection/i);
  });

  it('lets an aborted request stay an AbortError (a cancelled query is not an error to show)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('aborted', 'AbortError'));
    const error = await apiFetch('/x').catch((e) => e);
    expect(error).toBeInstanceOf(DOMException);
    expect(error.name).toBe('AbortError');
  });

  it('sends the browser to /login on a 401, but not when it is already there', async () => {
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { pathname: '/stock', assign } });
    respond(() => json({ detail: 'Unauthorized' }, 401));
    await expect(apiFetch('/api/products')).rejects.toMatchObject({ status: 401, message: 'Unauthorized' });
    expect(assign).toHaveBeenCalledWith('/login');

    assign.mockClear();
    vi.stubGlobal('window', { location: { pathname: '/login', assign } });
    await expect(apiFetch('/api/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(assign).not.toHaveBeenCalled();
  });

  it('apiGet returns just the body', async () => {
    respond(() => json({ warehouse_capacity_pct: 2 }));
    expect(await apiGet('/api/dashboard/metrics')).toEqual({ warehouse_capacity_pct: 2 });
  });
});

describe('query defaults', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('retries a network or server failure once, never a 4xx, and never twice', () => {
    expect(shouldRetry(0, new ApiError('down', 0))).toBe(true);
    expect(shouldRetry(0, new ApiError('boom', 500))).toBe(true);
    expect(shouldRetry(0, new Error('who knows'))).toBe(true);
    expect(shouldRetry(1, new ApiError('boom', 500))).toBe(false);
    for (const status of [400, 401, 403, 404, 409, 422, 429]) {
      expect(shouldRetry(0, new ApiError('no', status))).toBe(false);
    }
  });

  it('keeps data fresh for 30 s, refetches on focus, does not poll and never retries a mutation', () => {
    const options = makeQueryClient().getDefaultOptions();
    expect(STALE_TIME_MS).toBe(30_000);
    expect(options.queries?.staleTime).toBe(30_000);
    expect(options.queries?.refetchOnWindowFocus).toBe(true);
    expect(options.queries?.refetchInterval).toBeUndefined();
    expect(options.mutations?.retry).toBe(false);
  });

  it('gives every client its own cache', () => {
    expect(makeQueryClient()).not.toBe(makeQueryClient());
  });
});
