# Integration tests

These run the real Route Handlers (register, login, products, inventory, transactions, reorder approval, ...)
against a **real PostgreSQL with the migrations applied, behind a real PostgREST** - the parts the unit tests only
imitate: `on_conflict` / `ignore-duplicates`, `!inner` embeds, unique-violation -> 409, `RAISE ... PT4xx` -> HTTP
4xx, missing function -> `PGRST202`, Row Level Security for the public key, and 40 simultaneous requests against
one product.

They are not part of `npm test` (which needs nothing). Docker is required:

```bash
# from the repository root: start Postgres 16 + PostgREST, apply supabase/tests/roles.sql and every migration
eval "$(bash supabase/tests/integration-stack.sh up)"

cd frontend
npm run test:integration

bash ../supabase/tests/integration-stack.sh down
```

`globalSetup.ts` puts a small proxy in front of PostgREST that adds Supabase's `/rest/v1` prefix and signs the
service-role JWT, so the app runs with its normal URLs. Tests wipe all tables before each test: **never point this
at a database you care about** (the script only ever starts throw-away containers).

The stock functions themselves are tested directly in SQL, without the app:
`supabase/tests/stock_movements.sql` (rules, atomicity, privileges) and `supabase/tests/stock_concurrency.sh`
(many simultaneous connections). CI runs all three.
