/**
 * Client-side API access for the redesigned pages (used with TanStack Query).
 *
 * - same origin, the session cookie goes along; no token is ever read by script
 * - a failed request throws an ApiError whose message is the API's own user-facing text (`detail`)
 * - list endpoints answer a plain array plus X-Total-Count / X-Truncated: both are returned
 * - a 401 on a page that needs a session sends the browser to /login
 */

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface ApiResult<T> {
  data: T;
  /** Number of rows that match, for list endpoints (X-Total-Count). */
  total: number | null;
  /** True when the endpoint's default cap cut the answer (X-Truncated). */
  truncated: boolean;
}

function detailOf(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
    // the assistant's chat route words its errors as a reply
    const reply = (body as { response?: unknown }).response;
    if (typeof reply === 'string' && reply.trim()) return reply;
  }
  if (status === 401) return 'Your session has ended. Please sign in again.';
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status >= 500) return 'The server could not complete the request. Please try again.';
  return 'The request could not be completed.';
}

export async function apiFetch<T>(path: string, init: RequestInit & { json?: unknown; signal?: AbortSignal } = {}): Promise<ApiResult<T>> {
  const { json, headers, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...rest,
      headers: { Accept: 'application/json', ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(headers ?? {}) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }

  let body: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.assign('/login');
    }
    throw new ApiError(detailOf(body, response.status), response.status);
  }

  const totalHeader = response.headers.get('x-total-count');
  const total = totalHeader !== null && /^\d+$/.test(totalHeader) ? Number(totalHeader) : null;
  return { data: body as T, total, truncated: response.headers.get('x-truncated') === 'true' };
}

/** Shortcut for queries that only need the body. */
export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return (await apiFetch<T>(path, { signal })).data;
}
