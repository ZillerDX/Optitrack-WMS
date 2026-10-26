// Starts what the browser tests talk to: a proxy in front of a real PostgREST (adds Supabase's
// /rest/v1 prefix and signs the service-role key, like tests-integration/globalSetup.ts) and the
// production build of the app (`next start`) pointed at it.
//
//   INTEGRATION_POSTGREST_URL  where PostgREST listens, e.g. http://127.0.0.1:55441
//   INTEGRATION_JWT_SECRET     the PGRST_JWT_SECRET PostgREST was started with
//   E2E_PORT                   port for the app (default 3111)
//
// Playwright runs this as its webServer and stops it (SIGTERM) when the tests end.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { SignJWT } from 'jose';

const target = process.env.INTEGRATION_POSTGREST_URL;
const secret = process.env.INTEGRATION_JWT_SECRET;
if (!target || !secret) {
  console.error('Set INTEGRATION_POSTGREST_URL and INTEGRATION_JWT_SECRET (see e2e/README.md).');
  process.exit(1);
}
const upstream = new URL(target);
const appPort = process.env.E2E_PORT ?? '3111';

const proxy = http.createServer((req, res) => {
  const path = (req.url ?? '/').replace(/^\/rest\/v1/, '') || '/';
  const forward = http.request(
    { host: upstream.hostname, port: upstream.port, path, method: req.method, headers: req.headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    }
  );
  forward.on('error', () => res.writeHead(502).end('bad gateway'));
  req.pipe(forward);
});
await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
const proxyPort = proxy.address().port;

const serviceKey = await new SignJWT({ role: 'service_role' })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('2h')
  .sign(new TextEncoder().encode(secret));

const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', appPort], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    SECRET_KEY: 'e2e-secret-key-0123456789-0123456789-abcdef',
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${proxyPort}`,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    APP_URL: `http://localhost:${appPort}`,
  },
});

const stop = () => {
  app.kill();
  proxy.close();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
app.on('exit', (code) => {
  proxy.close();
  process.exit(code ?? 0);
});
