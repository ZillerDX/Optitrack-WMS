# OptiTrack WMS: stabilise, then redesign (PLAN)

Status: **approved 2026-10-21** with the default answers to Q1-Q4. Order agreed with the owner: merge the PR stack, fix the server bugs, then redesign every page.

Change 2026-10-26 (owner): **English only.** No Thai and no language switch; next-intl and the `[locale]` route segment are removed in M3 (see decision 4).

## 1. Analysis

### Goal
A warehouse user can do the daily jobs (receive stock, ship stock, correct a count, find a product, see what to reorder) in fewer steps, on a calm and readable English UI, with numbers they can trust.

### Success criteria (measurable)
- Production runs the code of PRs #1-#6 with migrations 0000-0011 (and later 0012) applied; no 5xx on the core pages.
- Every server bug in M2 has a failing-then-passing test (unit, SQL or integration).
- Record a movement (receive / ship / adjust) in at most **3 interactions** from any page: open the form, pick a product, confirm. Today: navigate to Transactions, open the modal, fill 6 fields.
- Every page in consistent English (one terminology list: Receive / Ship / Adjust, Stock, Location, SKU); dates and numbers formatted with one `en-US` formatter, in the user's local time zone.
- Light and dark theme, WCAG AA contrast, usable at 375 px width; Lighthouse accessibility >= 95 on the main pages.
- Charts: one shared palette and chart style, readable in both themes, with a table/number fallback and an empty state.

### Users and main jobs
Warehouse staff (receive, ship, count) on phone or tablet; managers/owners (dashboard, reorder, value) on desktop. One account = one tenant (owner); no roles beyond admin today.

### Current state (verified 2026-10-21)
- Branch stack: PRs #1-#6 open, stacked, all CI green; `main` still has the old code (no `supabase/migrations/`).
- Production DB (`hdvalaxaujjyqcejhyqb`): only the baseline tables plus `purchase_orders`; **no** migrations 0002-0011 functions/columns (`token_version`, `deleted_at`, `rate_limits`, stock functions are missing). RLS is on for all 7 tables with no policies (intended deny-by-default). Data: 4 users, 3 products, 9 transactions.
- Vercel: production runs `88910bf` (= `origin/main`), verified from GitHub deployment statuses; the Vercel MCP connection still has no access to team `zillerdxs-projects`, so env vars are unchecked.
- On the stack branch: lint, `tsc`, 214 unit tests and `next build` pass.
- i18n: next-intl is installed but limited to `en` (`middleware.ts`, `i18n.ts`); `th.json` is never loaded; almost all UI text is hardcoded English. With English only, next-intl is dead weight.
- UI: hard-wired dark theme (`<html class="dark">`, literal `slate-950` classes); pages are 900-1100 line files; charts (Recharts) only on dashboard and transactions with hardcoded colours.

### Bugs found (code review 2026-10-21; server items are fixed in M2, UI items are fixed by the rewrite in M4-M9 and covered by tests there)
Server / DB:
- S1 Deleting a location (`api/locations/[id]` DELETE) leaves its stock rows and history pointing at a missing name; recreating the name revives the stock. Also returns raw PostgREST text.
- S2 `purchase_orders.po_number` and `transactions.ref_code` are unique across all tenants; predictable `PO-YYYYMMDD-SKU` numbers collide between tenants and leak SKU existence via 409; approve accepts a client `po_number`.
- S3 `POST /api/inventory` inserts stock with no transaction and a racy capacity check.
- S4 ADJUST stores the target level as `quantity` and `price*target` as `total_price`; the ledger cannot be summed back to stock; dashboards count it as movement and value.
- S5 AI routes: no timeouts on Gemini/Groq/Google tokeninfo; a failed read is treated as empty data (everything "critical", draft POs generated); unbounded prompt size; `err.message` returned in 500s; velocity from only the last 25/50 transactions; `find` counts one location; min-stock default differs (5 vs 10) and `0` becomes 5/10.
- S6 `POST /api/transactions` accepts any `created_at` (1970, 9999).
- S7 `total_price` NUMERIC(12,2) overflows for large price x qty and returns a generic 500; location capacity has no upper bound on POST.
- S8 Lists are unpaginated and silently cut at 1000 rows (PostgREST max-rows); dashboard totals then wrong. Capacity 0 shown as "Unlimited" but rejects all stock.
- S9 Login returns 500 for non-string email/password; register has no 72-byte password cap, no email check, and reveals "Email already registered".
- S10 (low) `delete_product` fails if `<sku>-deleted<id>` already exists; delete during a rename gives a confusing "location not found".

UI (rewritten pages must not reintroduce them):
- U1 Inbound modal reopens every 30 s and after submit (URL params never cleared) -> duplicate receipts.
- U2 Transaction date saved as UTC midnight (`new Date('yyyy-MM-dd')`), shown as 07:00 in Thailand; off-by-one in DatePicker for UTC- zones.
- U3 ADJUST drawn as outbound; no ADJUST filter.
- U4 Location edits wiped on window focus; description cannot be cleared.
- U5 Editing a product rewrites its USD price through the live FX rate even when price was not touched.
- U6 Command menu quick actions do nothing (`?action=outbound`, `?action=new`, `?search=`).
- U7 Low-stock KPI and banner disagree (`<` vs `<=`, OUT_OF_STOCK, `|| 5`).
- U8 Server error messages hidden ("Failed to create transaction"); errors shown as empty data; fetch races when switching location.
- U9 CSV export: no quote escaping, `#` truncates the file, no BOM (non-ASCII names garbled in Excel).
- U10 Currency store reads localStorage at module load (hydration mismatch); profile changes do not refresh the shell.

### Design decisions (recommendations; owner may override)
1. **Keep the stack** (Next 15, Tailwind 3, Radix, Recharts, lucide). No new UI framework. Any new dependency is asked first.
2. **Information architecture (5 items)**: Dashboard, Stock (stock by location + the movement form), Products, History (all movements, export), Settings. AI assistant becomes one side panel reachable from the header, not a floating widget plus two modals. Mobile: bottom navigation; desktop: slim sidebar.
3. **One movement form** ("Receive / Ship / Adjust" segmented control) used everywhere: from a product row, a low-stock card, the command menu, or the global "+" button. Product search by name/SKU/barcode, location preselected, quantity with current stock and capacity shown, server error shown inline.
4. **Language: English only** (owner, 2026-10-26). Remove next-intl, `src/i18n.ts`, `src/messages/`, `lib/translations.ts`, the locale middleware and the `[locale]` route segment (routes stay the same: `/dashboard`, `/inventory`, ...). Strings live in the components; shared labels (movement types, statuses) in one `src/lib/labels.ts`. Dates and numbers through one `src/lib/format.ts` (`Intl`, `en-US`, user's local time zone). Trade-off: adding another language later means reintroducing an i18n library and extracting strings; accepted.
5. **Theme**: light by default, dark optional (Settings: Light / Dark / System). Tokens in `globals.css` (HSL variables) only; no literal `slate-*` colours in pages. One Latin UI font via `next/font` (self-hosted at build; confirm choice in M3).
6. **Charts**: one chart module (`components/charts/`) wrapping Recharts with shared palette, axis, tooltip and empty/loading states. Dashboard: KPI tiles with 30-day sparkline, inbound vs outbound by day (bars), stock value by category (horizontal bars, not a donut), zone utilisation (meters), reorder list. Aggregation moves to the server (`/api/dashboard/*`) so it is correct beyond 1000 rows.
7. **Currency** stays a display preference; prices are stored as entered, and the edit form only converts the fields the user changed (fixes U5).
8. Rewrite page by page behind the same routes, so every milestone is shippable on its own.

### Risks
- Applying migrations to production changes data (0005/0006 merge duplicate locations/categories, rename duplicate SKUs) and logs everyone out (cookie sessions). Mitigation: backup first, tiny dataset, owner approves each step, rollback script `supabase/rollback/rollback_0004_to_0011.sql`.
- Vercel deploys on every merge to `main`; intermediate merges of the stack deploy code whose migrations must already be there. Mitigation: apply all migrations before the first merge (they are additive for the old code; verify in M1).
- ADJUST semantics change (S4) touches history already written; old rows need a one-off backfill or a marker.
- Large rewrite of 4000+ lines of page code: done one page per milestone with e2e coverage, not a big bang.

### Architecture assessment (2026-10-26)
- Backend: a **monolith deployed as serverless functions** (Next.js route handlers on Vercel), loosely **layered** (handler -> `lib/` -> PostgREST -> Postgres functions). Stock rules live in Postgres functions because stateless functions cannot hold locks; rate limiting is a Postgres counter because instances share no memory. Not microservices, event-driven, CQRS or hexagonal. Direction: **modular monolith**: domain modules in `lib/` (`stock`, `products`, `locations`, `ai`) that handlers call instead of `supabaseRest()` directly (fold into M2 if the owner agrees); fix S4 so `transactions` is a ledger that sums to stock.
- Frontend: a **client-rendered SPA inside the App Router**: every page `"use client"`, 900-1100 line page components (14-21 `useState` each), axios + hand-written `useEffect` fetching + 30 s `setInterval` polling, no cache/abort, zustand for small UI state, auth guard reads `localStorage.user` on the client. This causes U1, U4, U8, U10 and the load flash. Direction for M3+: **feature folders** `src/features/{stock,products,history,dashboard,ai}/` (components, api, hooks), thin `page.tsx`; auth redirect in `middleware.ts` from the session cookie; Server Components for layout/read-only shells, client components for tables/forms/charts; zustand only for UI prefs.
- **Decided 2026-10-26 (owner): TanStack Query v5 is the client data layer** (React 19 compatible: peer `react ^18 || ^19`; SWR and an in-house hook were considered and rejected: the app's core is "a movement changes stock, history, dashboard and low-stock counts at once", which needs query keys + invalidation; the review bugs U1, U4, U8, U10 came from hand-written fetching). Conventions for M3+: one `QueryClientProvider` in the root layout (client component), defaults `staleTime` 30 s, `refetchOnWindowFocus` on, **no `setInterval` polling**, retry once and not on 4xx; query keys are arrays `[feature, resource, params]` defined next to the feature's `api.ts` in `src/features/<feature>/`; every mutation invalidates the keys it changes (a stock movement: `stock`, `history`, `dashboard`, `products`); the page-size/offset and `X-Total-Count` of S8 map to the key params; server errors are shown from `error.message` (the API already returns user-facing text), never swallowed; ErrorBoundary + inline retry for failed reads (never "empty" for an error). The dependency is added with the first code that uses it (M3 foundation), lockfile with npm 10, one PR.

### Decisions taken (2026-10-21, 2026-10-26)
- Q1/Q2 (language, Buddhist year): superseded, the app is English only.
- Q3 Products and Stock stay separate pages, linked to each other.
- Q4 Google sign-in and the AI assistant stay in scope.
- Q5 (2026-10-26) client data layer: TanStack Query (see Architecture assessment).

## 2. Milestones

### M0. Plan and agent docs `[x]`
- [x] `AGENTS.md`, `CLAUDE.md`, this `PLAN.md` on branch `chore/plan-redesign` (commit `7298c85`).
- [x] Owner approved the plan 2026-10-21.

### M1. Production migrations and merge of PRs #1-#6 `[ ]` (in progress)
- [x] Which commit production runs: `88910bf` (= `origin/main`), read from GitHub deployment statuses (`gh api repos/ZillerDX/Optitrack-WMS/deployments`). **Three** Vercel projects deploy this repo to production on every push to `main`: `optitrack-wms` (prj_XgL1MIcO1QBsM4jud2P0xs9bByta), `optitrack`, `optitrackwms`, all in team `zillerdxs-projects` (team_qs2ZqqU5jeMBaUjY8ZMECfUP). Which one serves https://optitrack-wms.vercel.app and whether the other two should be deleted: ask the owner.
- [ ] Vercel MCP access: still 403 for team `zillerdxs-projects` (owner must grant the connection access to that team). No `vercel` CLI installed.
- [x] Production DB state (read-only checks 2026-10-21): only baseline tables + `purchase_orders`; RLS on, no policies (= 0002 done); no functions, no `token_version`/`deleted_at`, no `rate_limits`. Rows: users 4, locations 9, categories 13, products 3, inventory 3, transactions 9, purchase_orders 0. No non-ADMIN users, no duplicate location/category names, no duplicate SKUs, no negative stock, so 0003/0005/0006 change no rows.
  - Schema differences vs `0000_baseline.sql` (harmless, verified): owner FKs are `ON DELETE CASCADE`; `users.image_url` is `text`; uniqueness via constraints `transactions_ref_code_key`, `users_email_key` (plain indexes `ix_transactions_ref_code`, `ix_users_email`); no `ix_*_id` indexes; no `uq_locations_owner_name`/`uq_categories_owner_name` yet (0005 adds them).
- [x] Rehearsal: local DB `rehearse` (container `wms-itest-db`) built from 0000-0002, altered to match the production differences above, sample data added, then 0000-0011 applied **twice**: no errors, rows kept, 6 functions + 2 columns present, `apply_stock_movement` OUTBOUND works.
- [~] Old `main` code against the new schema: not run end to end. Static check: 0004-0011 are additive only (new columns with defaults, new table, new functions; no DROP/REVOKE of anything old code uses). Worktree `../wms-main` (origin/main) now has `node_modules` (`npm ci` succeeded on 2026-10-26); a local smoke test would need a PostgREST on the `rehearse` DB (optional, the owner can instead log in on the live site).
- [x] **Production migrated 2026-10-26** (owner approved in chat). Backup schema `backup_20261021` created first (row counts matched: users 4, locations 9, categories 13, products 3, inventory 3, transactions 9, purchase_orders 0; it holds password hashes, keep it private and drop it once no longer needed). Then 0000-0011 applied in order through Supabase MCP `execute_sql` with no errors (`BEGIN`/`COMMIT` of 0005/0006 omitted: one call is one implicit transaction). Verified afterwards: 6 functions, `users.token_version`, `products.deleted_at`, table `rate_limits`, `uq_locations_owner_name`/`uq_categories_owner_name`/`uq_products_owner_sku`, row counts unchanged, total stock still 390, functions executable only by `service_role` (not anon/authenticated), advisors: only INFO "RLS enabled, no policy" (intended).
  - Rollback if needed: `supabase/rollback/rollback_0004_to_0011.sql` + data in `backup_20261021`.
  - Production is now **old code (`88910bf`) on the new schema**; not yet verified end to end with a real login (needs env/keys or the owner clicking through). Static check says it is compatible. Live site check after the migration: see Next.
- [x] **Merged 2026-10-26** (owner approved): #6 retargeted to `main` (REST API; `gh pr edit` fails on Projects classic) and merged with a merge commit, `main` = `f0021bc`, containing the whole stack. #1, #5, #6 show MERGED. **#2, #3, #4 are still OPEN** (their bases are feature branches, so GitHub did not mark them merged) though their commits are in `main`: close them (an attempt to comment+close was denied by the permission classifier; ask the owner). Rebase `chore/plan-redesign` on `main` still to do.
- [ ] **CI on `main` is red** (run for `f0021bc`): only the step `npm audit --omit=dev --audit-level=high`; lint, tsc, tests, build, SQL, integration and e2e jobs are green. New advisories since the PRs were green: `next` 10.0.0-15.5.27 **critical** (SSG/ISR cache poisoning, unauthenticated RCE in the image optimizer with SVG files), `follow-redirects` 1.16.0 high, `source-map-js` high, `zod` <4.6.6 high (fix is a major bump to zod 4), plus moderate tailwind-chain items.
  - **Done locally 2026-10-26 (owner approved, not pushed):** branch `fix/deps` (from `main` `f0021bc`), commit `2078983`: `next` 15.5.26 -> 15.5.28 (`package.json` now `^15.5.28`), `npm audit fix` (follow-redirects 1.16.2, source-map-js 1.2.2, nodemailer 10.2.1, postcss-selector-parser 6.1.5, @tailwindcss/typography 0.5.20). In `frontend/`: `npm run lint`, `tsc --noEmit`, `npm test` (214) and `npm run build` pass. Not run locally: integration and e2e tests (Docker stack was down); CI runs them.
  - **zod removed (owner approved), commit `a0044c3`:** `zod` was a direct dependency that nothing imports (its advisory needs a major bump). The same commit restores `@types/node` to `^22.20.4`: commit `2078983` had accidentally pinned it to `20.17.6`, written by `next build`'s TypeScript check after an `npm audit fix --omit=dev` pruned dev packages. **Lesson: do not run `npm audit fix --omit=dev`; always diff `package.json` after `next build`.** Lockfile vs `main`: only next 15.5.28 (+ swc binaries), typography 0.5.20, `@types/node` 22.20.5, follow-redirects 1.16.2, nodemailer 10.2.1, postcss-selector-parser 6.1.5, source-map-js 1.2.2, zod removed.
  - **Verified locally on `fix/deps` (HEAD `a0044c3`, 2 commits ahead of `main`, not pushed):** `npm audit --omit=dev --audit-level=high` exit 0 (only 4 moderate, tailwind chain, fixed by Tailwind 4 in the redesign), lint, `tsc --noEmit`, `npm test` (214), `npm run build` all pass. Integration/e2e not run locally; CI runs them.
  - Owner action: tell the agent to push `fix/deps` and open a PR (then merge after CI is green). Merging deploys to production.
- [ ] **Before the first merge**: confirm env vars `SECRET_KEY` (>= 32 chars), `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `APP_URL` are set on every Vercel project that deploys production. The new code has no fallback: a missing one = every API call 500. Merging also signs every user out (bearer token -> `__Host-session` cookie).
- [ ] Confirm Vercel production deploy of the final `main`.
- [ ] Walk `MANUAL_TEST_CHECKLIST.md` on production (sessions, tenant isolation, stock).
- Done when: production shows the stack code, the checklist passes, no new runtime errors in Vercel for 24 h.

### M2. Server bug fixes (`fix/server-bugs`) `[ ]` (first batch done locally)
Branch `fix/server-bugs` (from `main` `f0021bc`, independent of `fix/deps`), commit `1b97e5c`, **not pushed, migration 0012 not applied to production**.
- [x] Migration `0012_server_fixes.sql` (S1, S2, S4, S10): `purchase_orders (user_id, po_number)` and `transactions (user_id, ref_code)` unique per tenant (the plain index keeps the name `ix_transactions_ref_code` so re-running 0000 does not restore global uniqueness); ADJUST stores the **signed change** in `quantity`, every movement records `transactions.stock_after` (old ADJUST rows: `stock_after IS NULL` = old meaning, none exist on production); `delete_location` refuses with 409 while stock remains; `delete_product` copes with a taken `<sku>-deleted<id>`. New SQL test `supabase/tests/server_fixes_0012.sql` (verified red on 0000-0011, green with 0012), added to CI; existing SQL / concurrency (the ledger now sums to the shelf) / unit / integration tests updated; `supabase/rollback/rollback_0012.sql` tested on a scratch DB.
- [x] `POST /api/inventory` with units is an INBOUND movement through `apply_stock_movement` (S3, branch `fix/server-validation`, commit `812e1e9`, see below); quantity 0 still inserts an empty row directly. Two simultaneous creates of the same product/location no longer give 409 for the second: it adds to the first row (both receipts are in the history).
- [x] PO numbers generated server side only (`PO-YYYYMMDD-<8 hex>`); approve ignores client `po_number`; re-approving a draft is a new PO, not a 409. (S2) The UI still shows the draft's number until the AI panel is rewritten (M9); the real number is in the response.
- [x] `DELETE /api/locations/[id]` uses `delete_location`, validates the id, no raw DB text. (S1)
- Verified locally: SQL tests (all 5 files) and `stock_concurrency.sh` against Postgres 16, `npm run lint`, `tsc`, `npm test` (221), `npm run test:integration` (23, real PostgREST), `npm run build`. e2e not run locally (CI runs it).
- [x] AI routes (S5), API only, branch `fix/ai-routes` (from `main`, independent of the other fix branches), commit `cc1c55a`, **not pushed**: `lib/aiData.ts` (one checked read of the warehouse; a table that cannot be read -> 503, not "empty"; velocity from every shipment of the last 30 days; stock over all locations; explicit minimum 0 stays 0; one CRITICAL/WARNING/HEALTHY rule: CRITICAL = nothing on hand or <= 3 days of supply, WARNING = stock **below** the minimum or <= 10 days) and `lib/http.ts` (`fetchWithTimeout`: Gemini/Groq 8 s a call, 20 s for all LLM attempts of one chat request, Google token check 5 s -> 504, SMTP timeouts); the chat prompt carries the 40 riskiest products/shortages; the reorder agent suggests a location that exists (not a hardcoded "Zone A-01") and labels draft PO numbers `DRAFT-...`; 500 responses no longer return server error text. Tests: 12 unit (helpers), 6 route tests (red on the old code), 2 integration (real PostgREST: both locations counted, 40-day-old and other-tenant shipments ignored); lint, tsc, unit (233), integration (23), build pass.
  - Known remaining: the dashboard and AI "low stock" rules still differ from the UI's own counts until M8; the chat still sends the whole snapshot to the model provider (by design); the report text still says "Healthy working capital turnover" unconditionally (static copy, to be rewritten with the AI panel in M9).
- [x] Validation, API only, branch `fix/server-validation` (from `main`), commit `812e1e9`, **merged as PR #9 on 2026-10-26 (`fefce7d`)**: `created_at` within 366 days back / 1 day ahead (S6; wider than the first idea of 30 days because users enter past receipts, and the UI sends the start of the day in UTC); DB numeric overflow (22003) -> clear 400, location capacity on create <= 999,999,999 (S7); login/register answer 400 for non-text input, email shape (<= 254), names <= 100, password <= 72 **bytes** (S9). 22 new unit tests (red without the fix) and 3 integration tests (25 total, real PostgREST); lint, tsc, unit (242), build pass.
  - **Deliberately not done (S9):** register still says "Email already registered" (account enumeration). A generic message would stop sign-up users from knowing why it failed; this is a product decision, ask the owner.
- [x] **S8 done locally** (branch `fix/pagination-dashboard`, commit `b4490a9`, **not pushed, migration 0013 not applied to production**, no PR yet). Pagination (`limit`/`offset` + total) for products, inventory, transactions; dashboard metrics aggregated in SQL. (S8) Result:
  - **Built as planned** (defaults chosen by the owner 2026-10-26: browser time zone, default UTC; array + `X-Total-Count`): `lib/listQuery.ts` (limit 1-1000, offset, filters, escaped + percent-encoded search; `X-Total-Count`, `X-Truncated`), lists wired in `products|inventory|transactions` (transactions ordered by `created_at, id` so paging is stable); migration `0013_dashboard_summary.sql` (`dashboard_summary(user, location, days, tz)`, one JSON: totals, stock status, usage per location, inbound/outbound per local day with zero days, adjustments (signed; legacy counted only), categories, top movers); `GET /api/dashboard/summary?location=&days=&tz=`; `GET /api/dashboard/metrics` now uses it (no 1000-row cut; capacity 0 reads "no capacity set", not "Unlimited"); `rollback_0013.sql`; CI runs `supabase/tests/dashboard_summary.sql`.
  - **Verified locally:** SQL test `dashboard_summary.sql` (1,200 products, 1,500 receipts, two tenants, time zones; **it fails when the function is broken two ways**), all other SQL tests, lint, tsc, 367 unit tests, 34 integration tests against real PostgREST (1,100 products: default cap + `X-Truncated`, paging without gaps, `%`/`_` search literal, dashboard totals exact), `npm run build`. e2e left to CI.
  - **Deploy order (important):** `/api/dashboard/metrics` now needs 0013, so **apply 0013 to production BEFORE merging** (the old dashboard widget would show 0 otherwise). The change is otherwise backward compatible: lists stay arrays, no parameter = same rows as before plus headers.
  - **Still to do for the UI (M5-M9):** use `limit/offset/X-Total-Count` in the tables and `/api/dashboard/summary` in the new dashboard; stop adding rows up in the browser.
  - **Problem (read from the code 2026-10-26):** `GET /api/products|inventory|transactions` send no `limit`, so PostgREST's `max-rows` (Supabase default 1000) cuts the list silently; the pages then add up the rows in the browser, so totals are wrong past 1000 rows without any sign. `GET /api/dashboard/metrics` sums `inventory` rows (same cut) and prints "Unlimited" for capacity 0, while the database refuses all stock at capacity 0.
  - **Order matters:** S8 needs migration 0013 and builds on 0012 (ADJUST is a signed change, `stock_after`), so start it **after PR #8 is merged and 0012 is applied** (branch from `main`), not stacked on #8.
  - **S8a pagination, API only, backward compatible:** optional `limit` (default 1000 = today, max 200 when a page is asked for explicitly via `page_size`... simplest contract: `limit` 1-1000 and `offset`) and server-side filters the redesigned pages need: products `q` (name/SKU/barcode, `ilike`), `category`; transactions `type`, `product_id`, `location`, `from`/`to` (dates, validated like `created_at`). The body stays an array (the current UI keeps working until M5-M7); the total comes in `X-Total-Count` (PostgREST `Prefer: count=exact`) and `X-Truncated: true` when the cap was hit. Without parameters nothing changes except the headers.
  - **S8b dashboard in SQL, migration 0013:** function `dashboard_summary(p_user_id, p_location, p_days, p_tz)` returning one JSON document: totals (units, cost basis, market value), counts of low / out-of-stock products by the same rule as the AI helpers (stock **below** the minimum), per-location used vs capacity, inbound / outbound units per local day (INBOUND and OUTBOUND only; ADJUST shown separately, so it no longer inflates "movement" or "value"), value by category, top movers. Endpoint `GET /api/dashboard/summary?location=&days=&tz=`, `execute` revoked from anon/authenticated like the other functions, `rollback_0013.sql`. `/api/dashboard/metrics` stays; its label fixed ("No limit set" is wrong for capacity 0: show "Full / no capacity" instead). Everything is computed over all rows, never over a cut list.
  - **Tests (red first):** SQL test with 1,500 transactions and 1,200 stock rows (totals exact, tenant isolation, ADJUST excluded from volume, a day boundary in a non-UTC time zone); integration test through PostgREST (header `X-Total-Count`, filters, `X-Truncated`); unit tests for parameter validation (limit/offset bounds, dates, `ilike` characters escaped).
  - **Not in S8:** the new dashboard UI (M8) and list UIs (M5-M7) that will use these endpoints.
  - **Questions for the owner:** (1) time zone for the daily buckets: the browser's (`tz` parameter, default UTC) is assumed; (2) OK to keep arrays + headers instead of a `{items,total}` body (assumed yes, no breaking change)?
- Done when: lint, tsc, unit, integration, SQL and e2e tests pass in CI; migration 0012 applied on production with approval; PR merged.

### M3. Foundation: design system, app shell, Settings `[x]` (PR #13)
- [ ] Visual direction proposal (2 options as screenshots of the shell + dashboard skeleton) for owner choice.
- [x] Remove next-intl and the `[locale]` segment (decision 4): **done locally**, branch `feat/english-only` (from `main`), commit `f6198c4`, **not pushed**, no PR yet. Pages moved to `src/app/*` (same URLs), one root layout `<html lang="en">`, `next-intl` removed from `package.json` (lockfile regenerated with npm 10: only next-intl and its own dependencies leave), `src/i18n.ts`, `src/messages/`, `src/lib/translations.ts` deleted (the 9 inventory labels are local), `middleware.ts` now only redirects old `/en/...` and `/th/...` links. Verified: lint, tsc on a rebuilt `.next/types`, 282 unit tests (14 new for the middleware), 29 integration, build, and the 6 Playwright tests with Chrome (`E2E_CHROME_CHANNEL=chrome`; the Playwright-managed browser version on this machine does not match) against the production build. `src/lib/labels.ts` and `src/lib/format.ts` of the next M3 steps are not written yet.
- [x] **M3 foundation built locally** on branch `feat/m3-foundation` (from `feat/english-only`, which is PR #12), commits `1017f21` + `38f972a`, **not pushed**. Route groups: `(legacy)` keeps the old pages and dark look, `(app)` is the root layout of redesigned pages (Inter, theme, TanStack Query, display currency) with `(shell)` = AppShell (sidebar, bottom nav, user chip, sign out). New: light/dark tokens with a WCAG contrast test, `lib/format.ts`, `lib/labels.ts`, `lib/stockStatus.ts`, `apiFetch`/`queryClient`, Logo, PageHeader, Card, SegmentedControl, real `/settings` (theme Light/Dark/System, currency USD/THB/EUR, account). Verified: lint, tsc (after build), 473 unit tests, full Playwright (9 tests, 3 runs, Chrome channel), screenshots desktop light and phone dark checked. Not done: Lighthouse a11y on /settings (login required), command menu, "+" button, AI slot in the shell.
- Deviation: DataTable, StatCard, StatusBadge, charts and Sheet are built together with their pages in M5-M8, not in M3.
- [ ] Tokens (light/dark), font, spacing, radius; theme switch without flash.
- [ ] `src/lib/format.ts` (dates, numbers, currency) and `src/lib/labels.ts`, with unit tests (time zone cases for U2).
- [ ] New shell: sidebar (desktop), bottom nav (mobile), header with search (command menu), "+" movement button, AI panel slot.
- [ ] Shared components: PageHeader, StatCard, DataTable (sort, paginate, empty/error/loading), FormSheet, Toast, ConfirmDialog, chart module.
- [ ] `/settings`: theme, currency, profile link.
- Done when: switching theme and currency in Settings updates the shell immediately and persists after reload (e2e test); Lighthouse a11y >= 95 on `/settings`.

### M4. Auth pages (login, signup, reset password) `[x]` (PR #13)
- Done when: e2e login/logout/reset flows pass.

### M5. Stock page and the movement form `[x]` (PR #13)
- Stock by location with zone meters; one movement form (Receive / Ship / Adjust); location management. Fixes U1, U2, U4, U8.
- Done when: e2e receive, ship (over-stock refusal message shown), adjust, location rename/delete; 3-interaction target met.

### M6. Products `[x]` (PR #13)
- List with search/filter/pagination, product sheet (create/edit), barcode, soft delete. Fixes U5.
- Done when: e2e create/edit/delete; price unchanged when only the name is edited (test).

### M7. History (transactions) `[x]` (PR #13)
- Filters (type incl. ADJUST, date range, location, product), correct timestamps, CSV with BOM and escaping. Fixes U2, U3, U9.
- Done when: unit test for CSV; e2e filter + export.

### M8. Dashboard and charts `[x]` (PR #13)
- KPI tiles, inbound/outbound, value by category, zone utilisation, reorder list, consistent low-stock rule. Fixes U7, U8.
- Done when: numbers match a seeded fixture (integration test), charts render in both themes, empty states shown for a new tenant.

### M9. AI panel, profile, command menu `[x]` (PR #13 up to M9)
- AI chat, reorder suggestions and report in one panel; profile; working command menu actions. Fixes U6, U10.
- Done when: e2e command menu actions; AI panel works with no keys (fallback).

### M10. Polish and release `[~]` (merged and deployed 2026-10-27 with M3-M9; mobile performance/PWA and package cleanup open)
- Done on `feat/m3-foundation`: legacy UI and its 17 dead files deleted, phone card lists for Stock and Products, Lighthouse headless Chrome signed in on 7 pages: accessibility 100 and best practices 100 (profile 96 before the file-input fix). Not done: performance and PWA scores (mobile), README screenshots, owner walkthrough on a Vercel preview, unused packages (zustand, react-hook-form, @hookform/resolvers, date-fns, react-markdown, remark-gfm, @radix-ui/react-{dropdown-menu,label,select,tabs,toast}) need the owner OK to remove.
- Accessibility pass, Lighthouse (performance, a11y, PWA), screenshots and README update, remove dead code (old modals and widgets replaced by the AI panel).
- Done when: Lighthouse a11y >= 95 and performance >= 85 (mobile) on the main pages; README screenshots updated.

## 3. Local verification
1. `cd frontend && npm ci`
2. Start the local DB: `eval "$(bash ../supabase/tests/integration-stack.sh up)"` (Docker; prints the env vars).
3. Create `frontend/.env.local` from `.env.example` pointing at the local PostgREST (values from step 2) and a local `SECRET_KEY`. Never point local dev at production.
4. `npm run dev`, open http://localhost:3000, sign up a test account, then follow the milestone's "Done when".
5. Before handing over: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run test:integration`, `npm run build`, `npm run test:e2e`.

## 4. Production checklist
- Env vars (names only): `SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`, optional `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_ID`, `SMTP_*`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `SIGNUP_ALLOWED_DOMAINS`.
- Migrations: backup first; apply in number order **before** deploying code that needs them; verify functions/columns after; run Supabase advisors.
- Deploy: merge to `main` -> Vercel production. Each deploy approved by the owner.
- Rollback: Vercel "promote previous deployment"; DB: `supabase/rollback/rollback_0004_to_0011.sql` (and a matching rollback for each new migration), or restore the backup.
- Monitoring: Vercel runtime errors for 24 h after each deploy; Supabase logs and advisors.

## Next
(Overwritten, not appended. State on 2026-10-27, end of day.)

- **Production:** `main` = f4d51a8, Vercel project `optitrack-wms` (https://optitrack-wms.vercel.app), DB at migration **0015** (applied by hand with the owner's approval, verified: 12-character suffix, only `service_role` can execute). Runtime errors in the 30 minutes after the deploy: none.
- **Done since the redesign went live:** reviewer demo (#16, migration 0014, owner signed in with it on production); docs (#15, #17); flaky integration test fixed at its root (#18, migration 0015: generated reference codes had 6 hex characters and could collide, HTTP 409); 11 unused npm packages removed (#19); themed dropdown and date picker replace the browser's `<select>` / `<input type="date">` (#20, no new dependency); stale PRs #2-#4 closed (their work reached `main` through #7-#11). Forgot-password works end to end (Brevo SMTP; `APP_URL` and `SMTP_*` are set on Production).
- **Owner decisions:** free tiers only (Vercel Hobby, Supabase Free, Brevo free): no paid backups; the owner handles the Supabase keep-alive (Free pauses after about a week without use, which would break the demo button for the reviewer) and the Brevo key.
- **Remaining, in order:** (1) Owner, Vercel settings: disconnect Git on the unused projects `optitrack` and `optitrackwms` (they build every push, no env vars, only their default `*.vercel.app` domains, nothing in the repo points to them). (2) Not checked yet: how the new dropdown and date picker look on a real phone and in the dark theme (tested in the app with Playwright and a desktop screenshot only). (3) M10 leftovers: mobile Lighthouse performance and PWA scores. (4) Done 2026-10-28: the race in `e2e/session.spec.ts` ("an unauthenticated visitor is sent to the login page") is fixed by polling the URL instead of waiting for a load (3 of 20 runs failed before, 40 of 40 pass); schema `backup_20261021` was dropped on production with the owner's approval (7 copy tables, nothing depended on it; no other backup of the pre-migration data exists). (5) `SECRET_KEY` is set for Production only: add it for Preview if preview deployments must sign in. (6) Owner housekeeping: delete the env file in Downloads (`optitrack-wms-vercel-brevo.env`), delete the pending `optitrackwms.dev` domain entry in Brevo.
- **Housekeeping (local):** `git worktree remove ../wms-main`; stop the local test DB (`bash supabase/tests/integration-stack.sh down`); delete merged local branches. Working copy lives in C:/w/wms (moved from C:/w/budget-manage); claude-mem history of this work is under project `budget-manage`.
- **Rules that bit us:** generate lockfiles with `npx -y npm@10` (CI runs Node 20); never run `npm audit fix --omit=dev`; diff `package.json` after `next build`; `~/.claude/settings.json` allows Supabase `execute_sql` including writes: ask before every production write; the auto-mode classifier blocks `gh pr merge` unless the user names the PR in chat.
