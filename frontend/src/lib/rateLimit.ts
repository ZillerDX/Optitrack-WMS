import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/supabase';

/**
 * Client IP for rate limiting. On Vercel, `x-forwarded-for` is set by the
 * platform (client-supplied values are overwritten). If you self-host behind
 * your own proxy, make that proxy set/strip the header, otherwise callers can
 * pick their own bucket.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim() || 'unknown';
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 24);

async function hit(key: string, windowSeconds: number, max: number): Promise<number | null> {
  try {
    const res = await supabaseRest('rpc/rate_limit_hit', {
      method: 'POST',
      body: JSON.stringify({ p_key: key, p_window_seconds: windowSeconds, p_max: max }),
    });
    if (!res.ok) {
      console.error('[RateLimit] rpc failed (has migration rate_limits.sql been applied?):', await res.text());
      return null; // fail open: a limiter outage must not lock everyone out
    }
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (row && row.allowed === false) return Math.max(1, Number(row.retry_after) || windowSeconds);
    return null;
  } catch (err) {
    console.error('[RateLimit] error:', err);
    return null;
  }
}

/**
 * Enforce a per-IP limit and, optionally, a second limit on an identifier
 * (e.g. the target email) so distributed attempts against one account are also
 * throttled. Returns a 429 response when limited, otherwise null.
 */
export async function rateLimit(
  req: Request,
  opts: {
    name: string;
    limit: number;
    windowSeconds: number;
    /** Extra per-identifier limit; the identifier is hashed before storage. */
    identifier?: { value: string; limit: number; windowSeconds: number };
  }
): Promise<NextResponse | null> {
  const checks: Array<[string, number, number]> = [
    [`${opts.name}:ip:${getClientIp(req)}`, opts.windowSeconds, opts.limit],
  ];
  if (opts.identifier?.value) {
    checks.push([
      `${opts.name}:id:${digest(opts.identifier.value.toLowerCase())}`,
      opts.identifier.windowSeconds,
      opts.identifier.limit,
    ]);
  }

  for (const [key, windowSeconds, max] of checks) {
    const retryAfter = await hit(key, windowSeconds, max);
    if (retryAfter !== null) {
      return NextResponse.json(
        { detail: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }
  }
  return null;
}
