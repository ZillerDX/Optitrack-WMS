# Manual test checklist (PR #1 + #2)

Run on a staging deployment (Vercel preview + a Supabase project with migrations 0000-0010 applied).
Use two separate admin accounts, A and B, in two browser profiles, to test tenant isolation.

## 0. Before testing
- [ ] Migrations `0000`...`0010` applied in order on the target project (see the "Supabase state" note in the PR).
- [ ] Env set: `SECRET_KEY` (>= 32 chars), `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `APP_URL`.
- [ ] Optional: `NEXT_PUBLIC_GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_ID`, SMTP_*, `SIGNUP_ALLOWED_DOMAINS`.
- [ ] Site is served over HTTPS (the `__Host-session` cookie is `Secure`).

## 1. Session and login
- [ ] Register with email + password; you land in the app.
- [ ] DevTools > Application > Cookies: `__Host-session` exists, HttpOnly, Secure, SameSite=Lax, Path=/.
- [ ] `document.cookie` in the console does NOT show the session; localStorage has no token.
- [ ] Login response body has no `access_token`.
- [ ] Reload: still signed in. Logout: cookie cleared, protected pages redirect to login.
- [ ] After logout, replay an old request (copy as cURL from before logout): 401.
- [ ] Wrong password 6+ times quickly: 429 with Retry-After; correct password works after the window.
- [ ] Google sign-in works (or shows a clear "not configured" message when no client id is set).
- [ ] With `SIGNUP_ALLOWED_DOMAINS=example.com`: sign-up with another domain is refused (password and Google).

## 2. CSRF / cross-origin
- [ ] From another origin (e.g. a local html page with fetch to your site, `credentials: 'include'`) a POST/PUT/DELETE is refused (403).
- [ ] Same-site normal usage still works everywhere (no unexpected 403 in the network tab).

## 3. Password reset
- [ ] Forgot password: the response is the same for existing and unknown emails.
- [ ] Email arrives; link host equals `APP_URL`.
- [ ] Reset works once; using the same link again fails.
- [ ] After reset, an already-open session on another browser is signed out.
- [ ] A reset link older than its expiry fails.

## 4. Tenant isolation (A vs B)
- [ ] A creates product / location / category. B cannot see them in any list.
- [ ] From B, request A's ids directly (`/api/products/<A id>`, inventory, locations, categories, transactions): 404, never A's data.
- [ ] B cannot record a transaction on A's product or location (404/403).
- [ ] Dashboard and AI assistant for B show only B's data.

## 5. Products, locations, categories
- [ ] Create a product with a duplicate SKU: refused (409 / clear message).
- [ ] Create a duplicate location name and a duplicate category name: refused.
- [ ] Invalid input (negative price, huge quantity, empty name, overlong text): clear 4xx, no 500.
- [ ] Rename a location that holds stock: the stock and its transaction history appear under the new name, nothing is left under the old one, and INBOUND/OUTBOUND still work there.
- [ ] Rename a location onto another location's name: refused (409), nothing changes.
- [ ] Another account with a location of the same old name is unaffected (use accounts A and B).
- [ ] Delete a product that has stock: it disappears from products/inventory/dashboard/AI, its transactions REMAIN (Transactions page still shows its name), and an ADJUST-to-0 row is added per shelf; the shelf capacity is freed.
- [ ] Create a new product with the deleted product's SKU: allowed.
- [ ] A deleted product cannot receive a transaction (404) or be edited.
- [ ] Avatar upload: png/jpg works; an .html or .svg renamed to .png is rejected; > size limit rejected.

## 6. Stock movements (PR #2)
Setup: location L1 capacity 100, product P (min stock 10), starting stock 0.
- [ ] INBOUND 50 -> stock 50, one transaction row, price = product cost.
- [ ] OUTBOUND 20 -> stock 30, price = product sell price.
- [ ] OUTBOUND 31 -> refused with a message, stock still 30, no transaction row added.
- [ ] INBOUND that would exceed capacity (e.g. 80 more) -> refused; capacity counts ALL products in L1.
- [ ] ADJUST to a value within capacity -> stock set; ADJUST above capacity refused.
- [ ] OUTBOUND down to <= min stock -> status shows low stock; to 0 -> out of stock.
- [ ] Client-supplied price / status / user id in the request body is ignored (try in DevTools).
- [ ] Two tabs: press OUTBOUND of the last units in both at the same moment -> only one succeeds, stock never negative.
- [ ] Manual stock correction (`PUT /api/inventory/{id}` with `{quantity}`): stock changes, an ADJUST row is added, the status follows the quantity, above capacity is refused. Sending `status` or `location` is refused (400).
- [ ] Sum of transactions per product/location equals the stock shown.
- [ ] Reference number reuse -> "reference number is already in use" (409).

## 7. AI reorder approval
- [ ] Approve a reorder: stock increases, a purchase order row and an INBOUND transaction exist.
- [ ] Approve the same PO number again: refused and stock does NOT change a second time.
- [ ] Approval that exceeds capacity: refused, no PO row created.
- [ ] Assistant answers without API keys (built-in fallback); rate limit responds 429 when spammed.

## 8. Rate limits and headers
- [ ] Login, register, forgot-password, upload and AI endpoints return 429 when hammered.
- [ ] Response headers include CSP, X-Frame-Options / frame-ancestors, X-Content-Type-Options, HSTS (on HTTPS).
- [ ] Images from `*.googleusercontent.com` load; other remote hosts are refused by the image optimizer.

## 9. Direct database access (anon key)
Using the project's public anon key against `https://<project>.supabase.co/rest/v1/`:
- [ ] `GET /users`, `/products`, `/inventory`, `/transactions`... -> empty array or 401/403, never data.
- [ ] `POST /rpc/apply_stock_movement`, `/rpc/approve_reorder`, `/rpc/update_location`, `/rpc/rate_limit_hit` with the anon key -> 401/403/404 (permission denied).

## 10. PWA / UI smoke
- [ ] Install prompt / offline page works; service worker does not cache `/api` responses with private data.
- [ ] Main screens load without console errors: dashboard, products, inventory, locations, transactions, settings, language switch.
