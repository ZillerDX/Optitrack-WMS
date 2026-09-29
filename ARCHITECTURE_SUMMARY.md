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
| Tests | Vitest (API handlers against an in-memory PostgREST double) |
| CI | GitHub Actions: lint, `tsc`, tests, `npm audit`, build, and a job that applies the SQL migrations to a real PostgreSQL twice |

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
- Schema changes are hand-run SQL files in `supabase/migrations/`, numbered `0000`–`0007`, all idempotent.
  CI applies them to an empty PostgreSQL twice.

## Sessions

- Login and Google sign-in set `__Host-session` (`session` in development): `HttpOnly; Secure; SameSite=Lax;
  Path=/`, 24 h. The token is not in the response body, so page scripts cannot read it.
- Cookie-authenticated requests that change data must be same-origin (`Origin` matches the host) — a second
  CSRF layer on top of `SameSite=Lax`.
- Password reset and logout bump `users.token_version`, which invalidates every issued token (all devices).
  Deactivating a user takes effect within the 5 s cache window.
- Password reset links are single use: the token carries a fingerprint of the current password hash.

## Stock movements (`src/lib/stock.ts`)

`applyStockMovement` is the only code path that changes stock through transactions and purchase-order
approval: the product and location must belong to the caller, OUTBOUND cannot exceed stock (never clamped),
INBOUND/ADJUST cannot exceed the location capacity, the price comes from the product, and the inventory write
is a compare-and-swap on the previous quantity (409 on a concurrent change) that is reverted if the
transaction row cannot be written. PostgREST cannot run a multi-statement transaction, so this is
best-effort atomicity; the durable fix is a Postgres function (see limitations).

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

- Stock movements are not a single database transaction (see above).
- Deleting a product deletes its transaction history (cascade); there is no soft delete.
- Renaming a location does not update inventory or transactions that reference the old name.
- Sessions last 24 h and are revoked per user, not per device.
- The CSP allows inline scripts (see above); the app has no nonce-based CSP.
- Only the Route Handlers are covered by automated tests; there is no browser end-to-end suite.
