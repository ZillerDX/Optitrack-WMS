# Browser tests (Playwright)

They drive the **production build** (`next start`) in a real browser against a **real PostgreSQL + PostgREST**
(the same stack as `tests-integration`). They cover what the other suites cannot see: what the browser stores and
lets scripts read (the `__Host-session` cookie is HttpOnly / Secure / SameSite=Lax, no token in storage), the
login form, sign-out revoking the session, the CSRF check with a genuine cross-site `Origin`, and that the
Products / Inventory / Transactions pages load an account's own data through the cookie.

They are not part of `npm test`. Docker and a browser are required:

```bash
# from the repository root: start Postgres 16 + PostgREST with every migration applied
eval "$(bash supabase/tests/integration-stack.sh up)"

cd frontend
npm run build          # the tests run the production build
npx playwright install chromium    # once; or set E2E_CHROME_CHANNEL=chrome to use the installed Chrome
npm run test:e2e

bash ../supabase/tests/integration-stack.sh down
```

`e2e/serve.mjs` is Playwright's `webServer`: it puts a small proxy in front of PostgREST (adds Supabase's
`/rest/v1` prefix and signs the service-role JWT), then starts `next start` pointed at it. Tests create their own
accounts with unique emails, so nothing needs cleaning up, but **never point this at a database you care about**.
