# OptiTrack WMS — Architecture Summary

OptiTrack WMS is a multi-tenant warehouse management system. It is **one Next.js application**:
the UI (App Router) and the HTTP API (Route Handlers under `frontend/src/app/api`) ship and deploy
together. Data lives in a hosted PostgreSQL database (Supabase). There is no separate backend service.

> History: earlier versions also contained a FastAPI service. The deployed frontend never used it
> (it called the Route Handlers, which talked to Supabase directly), so the two implementations had
> drifted apart. It was removed; its schema was preserved as `supabase/migrations/0000_baseline.sql`.

## Stack

| Concern | Choice |
|---|---|
| UI | Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind, Radix UI, Recharts, next-intl, PWA |
| API | Next.js Route Handlers (`src/app/api/**/route.ts`) |
| Database | PostgreSQL on Supabase, reached through PostgREST with the **service-role key** (server side only) |
| Auth | Email + password (bcrypt) and Google Sign-In; HS256 JWT in an httpOnly cookie |
| Email | SMTP through `nodemailer` (password reset) |
| AI | Gemini, then Groq, then a deterministic analytics fallback (server-side keys only) |
| Tests | Vitest (API handlers against an in-memory PostgREST double); integration tests of the same handlers against a real PostgreSQL + PostgREST; SQL tests of the stock functions, including concurrent sessions; Playwright browser tests of the production build against the same database stack |
| CI | GitHub Actions: lint, `tsc`, tests, `npm audit`, build; a job that applies the migrations twice and runs the SQL / concurrency tests on PostgreSQL; a job that runs the integration tests against PostgreSQL + PostgREST; a job that runs the browser tests |

## Request flow

```
Browser ──(same origin, session cookie)──▶ Next.js Route Handler ──(service-role key)──▶ Supabase PostgREST ──▶ PostgreSQL
```

1. `getAuthUser(req)` (`src/lib/supabase.ts`) reads the session (an explicit `Authorization: Bearer` header
   wins, otherwise the cookie), verifies the JWT, then **re-checks the user in the database**
   (must exist and be active, and the token's `tv` must equal `users.token_version`). Results are cached for
   5 seconds per user.
2. Every handler scopes its queries by `owner_id` / `user_id` from that result. Nothing tenant-related is
   ever taken from the request body.
3. Handlers validate input (`src/lib/productInput.ts`, `aiInput.ts`, `validation.ts`) and return generic
   error text; details are logged server-side.

## Multi-tenancy and the database

- Tenancy is enforced **in the API layer** (owner filters), because the service-role key bypasses Row Level
  Security. RLS (`0002_enable_rls.sql`) is deny-by-default for the `anon` / `authenticated` roles, so nobody
  can reach the tables directly with the public anon key. **Verify this on the real project** after every
  schema change.
- Location and inventory rows reference locations **by name**, not by id. Uniqueness is enforced by the
  database: `(owner_id, name)` on locations and categories, `(owner_id, sku)` on products,
  `(product_id, location)` on inventory.
- Schema changes are hand-run SQL files in `supabase/migrations/`, numbered `0000`–`0010`, all idempotent.
  CI applies them to an empty PostgreSQL twice.

## Sessions

- Login and Google sign-in set `__Host-session` (`session` in development): `HttpOnly; Secure; SameSite=Lax;
  Path=/`, 24 h. The token is not in the response body, so page scripts cannot read it.
- Cookie-authenticated requests that change data must be same-origin (`Origin` matches the host) — a second
  CSRF layer on top of `SameSite=Lax`.
- Password reset and logout bump `users.token_version`, which invalidates every issued token (all devices).
  Deactivating a user takes effect within the 5 s cache window.
- Password reset links are single use: the token carries a fingerprint of the current password hash.

## Stock movements

Stock is changed by two Postgres functions (`0008_stock_movements.sql`), called with the service-role key
through PostgREST RPC; nothing else writes transactions or moves stock.

- `apply_stock_movement(user, product, location, type, quantity, ...)` runs as **one database transaction**:
  it checks that the product and the location belong to the caller, locks the location row and the stock row
  (`FOR UPDATE`), applies the rules (OUTBOUND never exceeds stock and is never clamped; INBOUND/ADJUST never
  exceed the location capacity; the price comes from the product), updates or creates the stock row and inserts
  the transaction. If any step fails, none of it happened.
- `approve_reorder(...)` does the same for a purchase-order receipt and also writes the PO row, so stock,
  transaction and PO are all-or-nothing (a repeated PO number rolls the receipt back).
- Every movement takes the **location lock first**, so movements at one location are serialised (capacity spans
  all its products) and cannot deadlock. Movements at different locations run in parallel.
- User-facing refusals are raised as SQLSTATE `PT4xx`, which PostgREST returns as HTTP 4xx with the message;
  the API passes those through and reports anything else generically. Execution is revoked from `anon` and
  `authenticated` because the caller supplies the user id.

Renaming a location goes through `update_location` (`0009_update_location.sql`), which renames the location and the inventory and transaction rows that reference its name in one transaction.

Deleting a product is a soft delete (`delete_product`, `0010_soft_delete_products.sql`): its stock is taken to zero with ADJUST movements, the row is kept with `deleted_at` set so the transaction history stays, and its SKU is renamed `<sku>-deleted<id>` so it can be reused. Deleted products are hidden from lists and cannot be moved.

`PUT /api/inventory/{id}` (manual correction) is an ADJUST movement too: only `quantity` is editable, the status follows it, and the location cannot be changed.

`src/lib/stock.ts` is only the RPC client. The rules are tested where they live: `supabase/tests/stock_movements.sql`
(rules, atomicity, privileges) and `supabase/tests/stock_concurrency.sh` (dozens of simultaneous connections:
no overselling, no lost updates, one receipt per PO number) run against real PostgreSQL in CI. Removing the row
locks makes them fail.

## Abuse controls

- Rate limiting for the API is a shared counter in Postgres (`0007_rate_limits.sql`, function
  `rate_limit_hit`), because serverless instances share no memory. Login is limited per address and per
  account; sign-up, Google, reset, upload and the AI endpoints are limited too. It **fails open** (and logs)
  if the counter is unavailable.
- Security headers and a CSP are set in `next.config.js`. Pages are statically generated, so the CSP needs
  `'unsafe-inline'` for scripts and does not stop an injected inline script; it does block third-party
  scripts, framing, `<base>` and cross-origin form posts.
- Uploaded avatars must be image data URLs (magic bytes checked) or Google profile pictures; the image
  optimizer only fetches `*.googleusercontent.com`.

## Configuration

All variables are documented in `frontend/.env.example`. `SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and
`NEXT_PUBLIC_SUPABASE_URL` are required; they are read at request time, so a misconfigured deployment fails
loudly instead of falling back to a default.

## Deploying

1. Create a Supabase project and apply `supabase/migrations/*.sql` in order. New releases: apply any newer
   migrations **before** deploying the code that needs them.
2. Set the environment variables on the host (Vercel or the Docker image).
3. `docker compose up --build`, or deploy `frontend/` to Vercel (root directory `frontend`).

## Known limitations

- Locations are still referenced by name (renaming is safe: `update_location` moves the stock and history in one transaction), not by id.
- Sessions last 24 h and are revoked per user, not per device.
- The CSP allows inline scripts (see above); the app has no nonce-based CSP.
- The browser tests (`frontend/e2e`) cover the session cookie, login/sign-out, CSRF and that the main pages load an account's own data; most other screens and their forms are still not covered.
- `DELETE /api/inventory/{id}` removes a stock row without a transaction row (`PUT` is recorded as an ADJUST movement).
