import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { SignJWT } from 'jose';

/**
 * Points the app at a real PostgREST.
 *
 *   INTEGRATION_POSTGREST_URL  where PostgREST listens, e.g. http://127.0.0.1:3001
 *   INTEGRATION_JWT_SECRET     the PGRST_JWT_SECRET PostgREST was started with
 *
 * Supabase serves PostgREST under /rest/v1 (behind its gateway); plain PostgREST serves at /.
 * A tiny proxy in front adds that prefix back, so the app's real URLs are exercised unchanged.
 * It also signs the service-role JWT the app sends, exactly like Supabase's service key.
 */
export default async function setup() {
  const target = process.env.INTEGRATION_POSTGREST_URL;
  const secret = process.env.INTEGRATION_JWT_SECRET;
  if (!target || !secret) {
    throw new Error(
      'Set INTEGRATION_POSTGREST_URL and INTEGRATION_JWT_SECRET (see tests-integration/README.md).'
    );
  }
  const upstream = new URL(target);

  const proxy = http.createServer((req, res) => {
    const path = (req.url ?? '/').replace(/^\/rest\/v1/, '') || '/';
    const forward = http.request(
      { host: upstream.hostname, port: upstream.port, path, method: req.method, headers: req.headers },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      }
    );
    forward.on('error', () => {
      res.writeHead(502).end('bad gateway');
    });
    req.pipe(forward);
  });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const { port } = proxy.address() as AddressInfo;

  const key = new TextEncoder().encode(secret);
  const sign = (role: string) =>
    new SignJWT({ role }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('2h').sign(key);

  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = await sign('service_role');
  process.env.INTEGRATION_ANON_KEY = await sign('anon');

  return async () => {
    await new Promise((resolve) => proxy.close(resolve));
  };
}
