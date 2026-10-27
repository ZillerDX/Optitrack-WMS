# OptiTrack WMS

Multi-tenant warehouse management web app (PWA): products, stock per location, stock movements, dashboard, AI reorder assistant. One Next.js app serves both UI and API; data is in Supabase PostgreSQL.

Read `ARCHITECTURE_SUMMARY.md` for how requests, tenancy, sessions and stock movements work. Plan and status: `PLAN.md` (read `## Next` first).

## Stack
Next.js 15 (App Router) + React 19 + TypeScript strict + Tailwind 3 + Radix (dialog) + shadcn-style primitives + Recharts + TanStack Query. API = Route Handlers in `frontend/src/app/api/**`. DB = Supabase PostgREST with the service-role key (server only). Vitest, Playwright. Hosted on Vercel (project `optitrack-wms`, team `zillerdxs-projects`, root directory `frontend`). Supabase project `hdvalaxaujjyqcejhyqb`.

## Commands (run in `frontend/`)
- Install: `npm ci`
- Dev: `npm run dev` (http://localhost:3000)
- Lint / types / unit tests: `npm run lint`, `npx tsc --noEmit`, `npm test`
- Build: `npm run build`
- Local DB for integration and e2e (Docker): `eval "$(bash ../supabase/tests/integration-stack.sh up)"`, stop with `bash ../supabase/tests/integration-stack.sh down`
- Integration tests: `npm run test:integration` (needs the stack above)
- E2E: `npm run test:e2e` (needs the stack above and a production build; see `e2e/README.md`)
- SQL tests: `supabase/tests/*.sql` and `stock_concurrency.sh`, run in CI against PostgreSQL 16

## Architecture
- `frontend/src/app/(app)/` is the whole UI (no locale segment). `(auth)/` = login, signup, forgot-password, reset-password; `(shell)/` = dashboard, inventory (Stock), products, transactions (History), settings, profile inside `components/app/AppShell.tsx` (sidebar, phone bottom bar, command palette, movement / product / assistant overlays in `useShellOverlays`). `/` is a server redirect on the session cookie. Feature code lives in `frontend/src/features/{stock,products,history,dashboard,assistant}/` (api.ts = TanStack Query hooks, plus the sheets and charts); pure logic in `src/lib/` with unit tests.
- `frontend/src/app/api/**` route handlers; every query is scoped by `owner_id`/`user_id` from `getAuthUser`, never from the body.
- `frontend/src/lib/` server helpers (`supabase.ts`, `session.ts`, `stock.ts` RPC client, validation) and the client `api.ts`.
- `frontend/src/components/` `app/` (shell, palette, avatar, icons), `auth/`, `brand/`, `providers/` (theme, query client, display currency), `ui/` primitives (Sheet, TextField, Meter, StatusBadge, SegmentedControl, Card). Design tokens are in `globals.css` (light default, dark, WCAG contrast test in `tests/theme-contrast.test.ts`).
- `supabase/migrations/0000-0014` hand-run, idempotent, numbered; `supabase/rollback/` manual rollback.

## Rules
- Stock changes only through the Postgres functions (`apply_stock_movement`, `approve_reorder`, `update_location`, `delete_product`, `delete_inventory`). No direct writes to `inventory`/`transactions` from route handlers.
- New schema change = new numbered, idempotent migration plus a SQL test. Apply to production before deploying code that needs it.
- The UI is English only (owner decision 2026-10-26). Do not add translations or a language switch. Format dates, numbers and money through `src/lib/format.ts`; words for movements and statuses come from `src/lib/labels.ts`.
- Client data fetching goes through TanStack Query (decided 2026-10-26, added with the M3 foundation): query keys `[feature, resource, params]`, mutations invalidate what they change, no `setInterval` polling, errors shown from the API's own message. Do not add new `useEffect` + axios fetching. See PLAN.md "Architecture assessment".
- Production (Supabase `hdvalaxaujjyqcejhyqb`, Vercel) is read-only for agents unless the user approves each write: migrations, deploys, data changes.
- Local verification uses the Docker stack, never the production database.
- Branches `feat/`, `fix/`, `chore/`; Conventional Commits. Do not commit, push, merge or deploy unless the user asks. Ask before adding dependencies.

## Gotchas
- Locations and stock rows reference locations by name, not id.
- From migration 0012 an ADJUST stores the signed change in `quantity` and every movement records `stock_after`; ADJUST rows with `stock_after IS NULL` are older and hold the target level. PO numbers / reference codes are unique per tenant. 0012 and 0013 are applied on production (2026-10-26).
- Reviewer demo (0014, applied on production 2026-10-27): the login button calls `POST /api/auth/demo` -> `create_demo_account()` (service_role only), a throw-away `demo-xxxx@demo.invalid` ADMIN with mock data, `users.demo_expires_at` = +48 h, purged by the next creation (no cron), at most 50 live, 6 per hour per IP. `/api/auth/me` returns `is_demo`; the guide (`features/tour`) is shown only then. Do not give demo accounts real data or e-mail.
- `0008` redefines `apply_stock_movement` without the `deleted_at` check; re-running `0008` alone after `0010` drops the soft-delete guard. Always apply the full sequence.
- The session cookie is `__Host-session` (`session` in development) and needs HTTPS outside localhost.
- Env var names are in `frontend/.env.example`; never put values in files or chat.
- CI runs Node 20 (npm 10). A `package-lock.json` written by a newer local npm can fail `npm ci` in CI (it dropped a nested `@swc/helpers`). Generate or update the lockfile with `npx -y npm@10 install --package-lock-only`, and check `npx -y npm@10 ci --dry-run`. Do not run `npm audit fix --omit=dev`, and diff `package.json` after `next build` (it can rewrite `@types/node`).
