import { NextResponse } from 'next/server';

/**
 * Query parameters of the list endpoints (products, inventory, transactions).
 *
 * The lists used to send no limit, so PostgREST cut them at its `max-rows` (1000 on Supabase) without
 * any sign, and the pages added the rows up in the browser. Now every list says how many rows exist
 * (`X-Total-Count`) and whether the answer was cut (`X-Truncated`), and can be paged and filtered on the
 * server. The body stays a plain array, so existing callers keep working.
 */

export const MAX_LIST_LIMIT = 1000;

export type Parsed<T> = { ok: true; value: T } | { ok: false; detail: string };

const bad = (detail: string): { ok: false; detail: string } => ({ ok: false, detail });

export interface Paging {
  limit: number;
  offset: number;
  /** true when the caller asked for a limit; false when the default cap applies. */
  explicit: boolean;
}

function intParam(params: URLSearchParams, name: string): number | null | 'invalid' {
  const raw = params.get(name);
  if (raw === null || raw === '') return null;
  if (!/^\d{1,9}$/.test(raw)) return 'invalid';
  return Number(raw);
}

export function parsePaging(params: URLSearchParams): Parsed<Paging> {
  const limit = intParam(params, 'limit');
  const offset = intParam(params, 'offset');
  if (limit === 'invalid' || limit === 0 || (limit !== null && limit > MAX_LIST_LIMIT)) {
    return bad(`limit must be an integer from 1 to ${MAX_LIST_LIMIT}`);
  }
  if (offset === 'invalid') return bad('offset must be a non-negative integer');
  return { ok: true, value: { limit: limit ?? MAX_LIST_LIMIT, offset: offset ?? 0, explicit: limit !== null } };
}

/**
 * A search term for a PostgREST `ilike` filter inside an `or=(...)` list: wildcards typed by the user
 * (`%`, `_`, `*`) are literal, quotes and commas cannot break out of the value.
 */
export function ilikeTerm(term: string): string {
  const likeEscaped = term.replace(/\*/g, '').replace(/[\\%_]/g, (c) => `\\${c}`);
  const quoted = likeEscaped.replace(/[\\"]/g, (c) => `\\${c}`);
  return `"*${quoted}*"`;
}

const MAX_TEXT = 100;

function text(params: URLSearchParams, name: string): string | null | 'invalid' {
  const raw = params.get(name);
  if (raw === null) return null;
  const v = raw.trim();
  if (v === '') return null;
  return v.length > MAX_TEXT ? 'invalid' : v;
}

/** Filters of GET /api/products: `q` (name, SKU or barcode contains) and `category` (exact). */
export function productFilters(params: URLSearchParams): Parsed<string> {
  let out = '';
  const q = text(params, 'q');
  if (q === 'invalid') return bad(`q must be at most ${MAX_TEXT} characters`);
  if (q) {
    const t = ilikeTerm(q);
    // percent-encoded as a whole: the term can hold %, & or # that would otherwise end up raw in the URL
    out += `&or=${encodeURIComponent(`(name.ilike.${t},sku.ilike.${t},barcode.ilike.${t})`)}`;
  }
  const category = text(params, 'category');
  if (category === 'invalid') return bad(`category must be at most ${MAX_TEXT} characters`);
  if (category) out += `&category=eq.${encodeURIComponent(category)}`;
  return { ok: true, value: out };
}

const TYPES = ['INBOUND', 'OUTBOUND', 'ADJUST'];

/** A date or date-time for `from` / `to`. A date alone means the whole day in UTC. */
function dateParam(params: URLSearchParams, name: 'from' | 'to'): Parsed<string | null> {
  const raw = params.get(name);
  if (raw === null || raw.trim() === '') return { ok: true, value: null };
  const v = raw.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(v);
  const parsed = new Date(dateOnly ? `${v}T${name === 'from' ? '00:00:00.000' : '23:59:59.999'}Z` : v);
  if (Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() < 2000 || parsed.getUTCFullYear() > 2100) {
    return bad(`${name} is not a valid date`);
  }
  return { ok: true, value: parsed.toISOString() };
}

/** Filters of GET /api/transactions: `type`, `product_id`, `from`, `to` (`location` is handled by the route). */
export function transactionFilters(params: URLSearchParams): Parsed<string> {
  let out = '';
  const type = params.get('type');
  if (type) {
    if (!TYPES.includes(type)) return bad('type must be INBOUND, OUTBOUND or ADJUST');
    out += `&type=eq.${type}`;
  }
  const product = intParam(params, 'product_id');
  if (product === 'invalid' || product === 0) return bad('product_id must be a positive integer');
  if (product !== null) out += `&product_id=eq.${product}`;
  const from = dateParam(params, 'from');
  if (!from.ok) return from;
  const to = dateParam(params, 'to');
  if (!to.ok) return to;
  if (from.value && to.value && from.value > to.value) return bad('from must not be after to');
  if (from.value) out += `&created_at=gte.${encodeURIComponent(from.value)}`;
  if (to.value) out += `&created_at=lte.${encodeURIComponent(to.value)}`;
  return { ok: true, value: out };
}

/** Filters of GET /api/inventory besides `location`: `product_id`. */
export function inventoryFilters(params: URLSearchParams): Parsed<string> {
  const product = intParam(params, 'product_id');
  if (product === 'invalid' || product === 0) return bad('product_id must be a positive integer');
  return { ok: true, value: product === null ? '' : `&product_id=eq.${product}` };
}

/** The paging part of a PostgREST path. */
export function pagingPath(p: Paging): string {
  return `&limit=${p.limit}&offset=${p.offset}`;
}

/** Request headers that make PostgREST count all matching rows. */
export const COUNT_HEADERS = { Prefer: 'count=exact' } as const;

/** Total from a `Content-Range: 0-9/42` header (`*` when unknown). */
export function totalFromContentRange(header: string | null): number | null {
  const m = header?.match(/\/(\d+)$/);
  return m ? Number(m[1]) : null;
}

/**
 * A list response: the rows as a plain array, `X-Total-Count` with the number of rows that match, and
 * `X-Truncated: true` when the default cap cut the answer (a caller that paged on purpose knows).
 */
export function listResponse(res: Response, rows: unknown, paging: Paging): NextResponse {
  const list = Array.isArray(rows) ? rows : [];
  const total = totalFromContentRange(res.headers.get('content-range'));
  const headers: Record<string, string> = {};
  if (total !== null) {
    headers['X-Total-Count'] = String(total);
    if (!paging.explicit && paging.offset + list.length < total) headers['X-Truncated'] = 'true';
  }
  return NextResponse.json(list, { headers });
}
