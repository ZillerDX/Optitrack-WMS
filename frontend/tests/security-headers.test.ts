import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);

async function headersFor(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) v === undefined ? vi.stubEnv(k, '') : vi.stubEnv(k, v);
  delete require.cache[require.resolve('../next.config.js')];
  const config = require('../next.config.js');
  const rules = await config.headers();
  const all = rules.find((r: any) => r.source === '/(.*)');
  const byKey = Object.fromEntries(all.headers.map((h: any) => [h.key, h.value]));
  return { rules, byKey, csp: byKey['Content-Security-Policy'] as string };
}

afterEach(() => vi.unstubAllEnvs());

describe('security headers (production)', () => {
  it('sets the standard hardening headers on every route', async () => {
    const { byKey } = await headersFor({ NODE_ENV: 'production', VERCEL_ENV: 'production' });
    expect(byKey['X-Content-Type-Options']).toBe('nosniff');
    expect(byKey['X-Frame-Options']).toBe('DENY');
    expect(byKey['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(byKey['Strict-Transport-Security']).toMatch(/max-age=\d{7,}/);
    expect(byKey['Permissions-Policy']).toContain('camera=()');
  });

  it('CSP forbids plugins, framing, <base> and cross-origin form posts', async () => {
    const { csp } = await headersFor({ NODE_ENV: 'production', VERCEL_ENV: 'production' });
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('CSP allows only Google Sign-In and the FX API besides this origin', async () => {
    const { csp } = await headersFor({ NODE_ENV: 'production', VERCEL_ENV: 'production' });
    const scriptSrc = csp.split('; ').find((d) => d.startsWith('script-src'))!;
    expect(scriptSrc).toBe("script-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/client");
    expect(scriptSrc).not.toContain('unsafe-eval');
    expect(scriptSrc).not.toContain('*');
    const connect = csp.split('; ').find((d) => d.startsWith('connect-src'))!;
    expect(connect).toBe("connect-src 'self' https://accounts.google.com/gsi/ https://open.er-api.com");
    expect(csp).not.toContain('vercel.live');
  });

  it('only previews (never production) may load the Vercel toolbar', async () => {
    const prod = await headersFor({ NODE_ENV: 'production', VERCEL_ENV: 'production' });
    const preview = await headersFor({ NODE_ENV: 'production', VERCEL_ENV: 'preview' });
    expect(prod.csp).not.toContain('vercel.live');
    expect(preview.csp).toContain('https://vercel.live');
  });

  it('keeps the service-worker no-cache rule', async () => {
    const { rules } = await headersFor({ NODE_ENV: 'production', VERCEL_ENV: 'production' });
    const sw = rules.find((r: any) => r.source === '/sw.js');
    expect(sw.headers.some((h: any) => h.key === 'Cache-Control' && /no-store/.test(h.value))).toBe(true);
  });

  it('images are only optimised for Google profile pictures', async () => {
    delete require.cache[require.resolve('../next.config.js')];
    const config = require('../next.config.js');
    expect(config.images.remotePatterns).toEqual([{ protocol: 'https', hostname: '*.googleusercontent.com' }]);
  });
});
