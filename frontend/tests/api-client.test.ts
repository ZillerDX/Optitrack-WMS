import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * A URL with a trailing slash (`/api/products/`) makes Next answer 308 to the slash-less URL. The extra
 * round trip is wasteful, and under the CSP `upgrade-insecure-requests` a browser that loaded the app
 * over plain http (localhost, an http-only Docker deployment) upgrades the redirect target to https
 * and the request fails (found by the browser tests).
 */
describe('API client', () => {
  it('never requests an /api URL with a trailing slash', () => {
    const source = readFileSync(path.resolve(__dirname, '../src/lib/api.ts'), 'utf8');
    const offenders = [...source.matchAll(/['"`](\/api\/[^'"`?]*\/)['"`?]/g)].map((m) => m[1]);
    expect(offenders).toEqual([]);
  });
});
