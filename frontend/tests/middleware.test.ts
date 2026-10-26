import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import middleware, { config } from '@/middleware';

const run = (path: string) => middleware(new NextRequest(`http://app.test${path}`));

describe('the app is English only: old /en and /th links lose their prefix', () => {
  it.each([
    ['/en', '/'],
    ['/th', '/'],
    ['/en/login', '/login'],
    ['/th/dashboard', '/dashboard'],
    ['/en/inventory/', '/inventory/'],
    ['/th/reset-password?token=abc', '/reset-password?token=abc'],
  ])('%s -> %s', (from, to) => {
    const res = run(from);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname + location.search).toBe(to);
  });

  it.each(['/login', '/dashboard', '/english', '/entry', '/thanks', '/api/products', '/'])('%s is left alone', (path) => {
    const res = run(path);
    expect(res.headers.get('location')).toBeNull();
    expect(res.status).toBe(200);
  });

  it('only runs for the prefixed paths, never for the API or static files', () => {
    expect(config.matcher).toEqual(['/en', '/en/:path*', '/th', '/th/:path*']);
  });
});
