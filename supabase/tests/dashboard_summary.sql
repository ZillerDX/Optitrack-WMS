-- Tests for 0013_dashboard_summary.sql. Run against a database with all migrations applied:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/dashboard_summary.sql
-- Runs inside one transaction that is rolled back.

BEGIN;

CREATE FUNCTION pg_temp.expect_error(p_sql text, p_state text, p_msg_like text DEFAULT '%')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN OTHERS THEN
        ASSERT SQLSTATE = p_state, format('expected SQLSTATE %s but got %s (%s) for: %s', p_state, SQLSTATE, SQLERRM, p_sql);
        ASSERT SQLERRM LIKE p_msg_like, format('expected message like %L but got %L for: %s', p_msg_like, SQLERRM, p_sql);
        RETURN;
    END;
    RAISE EXCEPTION 'expected an error (%) but the statement succeeded: %', p_state, p_sql;
END $$;

INSERT INTO public.users (email, password_hash, first_name, last_name, role, is_active) VALUES
    ('alice@test', 'x', 'A', 'A', 'ADMIN', true),
    ('bob@test',   'x', 'B', 'B', 'ADMIN', true);
CREATE TEMP TABLE ids AS
SELECT (SELECT id FROM public.users WHERE email = 'alice@test') AS alice,
       (SELECT id FROM public.users WHERE email = 'bob@test')   AS bob;

-- Alice: 1,200 products (more than the 1000 rows a list is cut at), each with 2 units at W1 (cost 3, price 5);
-- every 10th has a minimum of 5 (so it is "low"), the others 1.
INSERT INTO public.locations (owner_id, name, capacity)
SELECT alice, 'W1', 100000 FROM ids UNION ALL SELECT alice, 'W2', 50 FROM ids UNION ALL SELECT alice, 'W0', 0 FROM ids
UNION ALL SELECT bob, 'W1', 1000 FROM ids;
INSERT INTO public.products (owner_id, sku, name, category, cost_price, sell_price, min_stock_level)
SELECT alice, 'A' || n, 'Alice ' || n, CASE WHEN n % 2 = 0 THEN 'Even' ELSE NULL END, 3, 5, CASE WHEN n % 10 = 0 THEN 5 ELSE 1 END
FROM ids, generate_series(1, 1200) n;
INSERT INTO public.inventory (product_id, location, quantity, status)
SELECT p.id, 'W1', 2, 'IN_STOCK' FROM public.products p, ids WHERE p.owner_id = ids.alice;
-- two more products: one empty (no stock row), one deleted
INSERT INTO public.products (owner_id, sku, name, cost_price, sell_price, min_stock_level)
SELECT alice, 'EMPTY', 'Empty', 1, 1, 0 FROM ids;
INSERT INTO public.products (owner_id, sku, name, cost_price, sell_price, min_stock_level, deleted_at)
SELECT alice, 'GONE', 'Gone', 100, 100, 0, now() FROM ids;
INSERT INTO public.inventory (product_id, location, quantity, status)
SELECT p.id, 'W1', 7, 'IN_STOCK' FROM public.products p WHERE p.sku = 'GONE';
-- Bob: one product with 1,000 units that must never show up for Alice
INSERT INTO public.products (owner_id, sku, name, cost_price, sell_price, min_stock_level)
SELECT bob, 'B1', 'Bobs', 10, 20, 0 FROM ids;
INSERT INTO public.inventory (product_id, location, quantity, status)
SELECT p.id, 'W1', 1000, 'IN_STOCK' FROM public.products p, ids WHERE p.owner_id = ids.bob;

-- 1,500 INBOUND receipts of Alice's product A1 over the last 20 days at W1 (1 unit, cost 3): value 3 each
CREATE TEMP TABLE pid AS SELECT (SELECT p.id FROM public.products p, ids WHERE p.owner_id = ids.alice AND p.sku = 'A1') AS a1,
                                (SELECT p.id FROM public.products p, ids WHERE p.owner_id = ids.alice AND p.sku = 'A2') AS a2,
                                (SELECT p.id FROM public.products p, ids WHERE p.owner_id = ids.bob   AND p.sku = 'B1') AS b1;
INSERT INTO public.transactions (ref_code, type, quantity, unit_price, total_price, status, location, user_id, product_id, created_at, stock_after)
SELECT 'IN-' || n, 'INBOUND', 1, 3, 3, 'COMPLETED', 'W1', ids.alice, pid.a1, now() - ((n % 20) || ' days')::interval - interval '1 hour', NULL
FROM ids, pid, generate_series(1, 1500) n;
-- a receipt of Bob's the same days (must not count)
INSERT INTO public.transactions (ref_code, type, quantity, unit_price, total_price, status, location, user_id, product_id, created_at)
SELECT 'BOB-IN', 'INBOUND', 500, 10, 5000, 'COMPLETED', 'W1', ids.bob, pid.b1, now() - interval '1 hour' FROM ids, pid;

DO $$
DECLARE a int := (SELECT alice FROM ids); b int := (SELECT bob FROM ids);
        a1 int := (SELECT a1 FROM pid); a2 int := (SELECT a2 FROM pid);
        r jsonb; m jsonb; n int; tot bigint;
BEGIN
    ---------------------------------------------------------------------------------------------
    -- totals over more than 1000 rows, other tenant and deleted product excluded
    ---------------------------------------------------------------------------------------------
    r := public.dashboard_summary(a);
    ASSERT (r -> 'totals' ->> 'units')::bigint = 2400, format('units over all 1200 rows, got %s', r -> 'totals' ->> 'units');
    ASSERT (r -> 'totals' ->> 'cost_basis')::numeric = 7200 AND (r -> 'totals' ->> 'market_value')::numeric = 12000, 'values';
    ASSERT (r -> 'totals' ->> 'products')::int = 1201, 'active products incl. the empty one, not the deleted one';
    ASSERT (r -> 'totals' ->> 'products_with_stock')::int = 1200, 'products with stock';

    -- status: 120 products have stock 2 < minimum 5 (low), 1080 are healthy, 1 is empty
    ASSERT (r -> 'stock_status' ->> 'low_stock')::int = 120, 'low = stock below the minimum';
    ASSERT (r -> 'stock_status' ->> 'healthy')::int = 1080, 'healthy';
    ASSERT (r -> 'stock_status' ->> 'out_of_stock')::int = 1, 'out of stock';

    -- categories: NULL becomes General; 600 even, 600 odd
    ASSERT (SELECT (c ->> 'units')::int FROM jsonb_array_elements(r -> 'by_category') c WHERE c ->> 'category' = 'Even') = 1200, 'category Even';
    ASSERT (SELECT (c ->> 'units')::int FROM jsonb_array_elements(r -> 'by_category') c WHERE c ->> 'category' = 'General') = 1200, 'category General';

    -- locations: W1 used 2400 of 100000, W2 empty, W0 capacity 0 has no percentage; Bob's W1 is not Alice's
    ASSERT (SELECT (l ->> 'used')::int FROM jsonb_array_elements(r -> 'locations') l WHERE l ->> 'name' = 'W1') = 2400, 'W1 used (no deleted product, no other tenant)';
    ASSERT (SELECT (l ->> 'pct')::int FROM jsonb_array_elements(r -> 'locations') l WHERE l ->> 'name' = 'W1') = 2, 'W1 pct';
    ASSERT (SELECT l -> 'pct' FROM jsonb_array_elements(r -> 'locations') l WHERE l ->> 'name' = 'W0') = 'null'::jsonb, 'capacity 0 has no percentage';
    ASSERT jsonb_array_length(r -> 'locations') = 3, 'three locations';

    ---------------------------------------------------------------------------------------------
    -- movement: all 1500 receipts, zero-filled days, exact sums
    ---------------------------------------------------------------------------------------------
    r := public.dashboard_summary(a, NULL, 30, 'UTC');
    ASSERT jsonb_array_length(r -> 'movement') = 30, 'one entry per day, quiet days included';
    SELECT sum((e ->> 'inbound_units')::bigint) INTO tot FROM jsonb_array_elements(r -> 'movement') e;
    ASSERT tot = 1500, format('inbound units over all days, got %s', tot);
    ASSERT (SELECT sum((e ->> 'inbound_value')::numeric) FROM jsonb_array_elements(r -> 'movement') e) = 4500, 'inbound value';
    ASSERT (SELECT sum((e ->> 'outbound_units')::bigint) FROM jsonb_array_elements(r -> 'movement') e) = 0, 'no outbound yet';
    ASSERT (SELECT count(*) FROM jsonb_array_elements(r -> 'movement') e WHERE (e ->> 'inbound_units')::int = 0) >= 9, 'days without movement are present with zero';
    -- a shorter window sees fewer days of data
    r := public.dashboard_summary(a, NULL, 5);
    ASSERT jsonb_array_length(r -> 'movement') = 5, 'five days';
    SELECT sum((e ->> 'inbound_units')::bigint) INTO tot FROM jsonb_array_elements(r -> 'movement') e;
    ASSERT tot < 1500 AND tot > 0, 'only the last days';

    ---------------------------------------------------------------------------------------------
    -- ADJUST is not volume or value; legacy ADJUST rows are counted, not summed
    ---------------------------------------------------------------------------------------------
    PERFORM public.apply_stock_movement(a, a1, 'W1', 'ADJUST', 10);          -- 2 -> 10: +8, stock_after 10
    PERFORM public.apply_stock_movement(a, a2, 'W1', 'ADJUST', 0);           -- 2 -> 0 : -2
    INSERT INTO public.transactions (ref_code, type, quantity, unit_price, total_price, status, location, user_id, product_id, created_at)
    VALUES ('OLD-ADJ', 'ADJUST', 999, 3, 2997, 'COMPLETED', 'W1', a, a1, now() - interval '2 hours');   -- before 0012: target level, no stock_after
    r := public.dashboard_summary(a, NULL, 30, 'UTC');
    ASSERT (r -> 'adjustments' ->> 'count')::int = 2 AND (r -> 'adjustments' ->> 'net_units')::int = 6 AND (r -> 'adjustments' ->> 'legacy')::int = 1,
        format('adjustments %s', r -> 'adjustments');
    SELECT sum((e ->> 'inbound_units')::bigint) INTO tot FROM jsonb_array_elements(r -> 'movement') e;
    ASSERT tot = 1500, 'ADJUST did not change the inbound volume';
    ASSERT (SELECT sum((e ->> 'outbound_units')::bigint) FROM jsonb_array_elements(r -> 'movement') e) = 0, 'or the outbound volume';
    -- stock now: A1 = 10, A2 = 0 (empty) -> units 2400 + 8 - 2
    r := public.dashboard_summary(a);
    ASSERT (r -> 'totals' ->> 'units')::bigint = 2406, 'totals follow the adjustments';
    ASSERT (r -> 'stock_status' ->> 'out_of_stock')::int = 2, 'A2 is now out of stock too';

    ---------------------------------------------------------------------------------------------
    -- the day is cut in the caller's time zone
    ---------------------------------------------------------------------------------------------
    -- an OUTBOUND at 20:30 UTC yesterday is 03:30 on the current UTC date in Bangkok (UTC+7) and 12:30 yesterday in Los Angeles
    INSERT INTO public.transactions (ref_code, type, quantity, unit_price, total_price, status, location, user_id, product_id, created_at)
    VALUES ('TZ-OUT', 'OUTBOUND', 4, 5, 20, 'COMPLETED', 'W1', a, a2,
            date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '3 hours 30 minutes');
    m := (public.dashboard_summary(a, NULL, 3, 'UTC') -> 'movement');
    ASSERT (SELECT e ->> 'day' FROM jsonb_array_elements(m) e WHERE (e ->> 'outbound_units')::int = 4)::date = (now() AT TIME ZONE 'UTC')::date - 1, 'UTC day: yesterday';
    m := (public.dashboard_summary(a, NULL, 3, 'Asia/Bangkok') -> 'movement');
    ASSERT (SELECT e ->> 'day' FROM jsonb_array_elements(m) e WHERE (e ->> 'outbound_units')::int = 4)::date = (now() AT TIME ZONE 'UTC')::date,
        'Bangkok day follows the local clock';
    m := (public.dashboard_summary(a, NULL, 3, 'America/Los_Angeles') -> 'movement');
    ASSERT (SELECT sum((e ->> 'outbound_units')::int) FROM jsonb_array_elements(m) e) = 4, 'the receipt is inside the window in every zone';
    -- top movers
    r := public.dashboard_summary(a, NULL, 30, 'UTC');
    ASSERT (r -> 'top_movers' -> 0 ->> 'sku') = 'A2' AND (r -> 'top_movers' -> 0 ->> 'units')::int = 4, 'top mover';

    ---------------------------------------------------------------------------------------------
    -- one location
    ---------------------------------------------------------------------------------------------
    r := public.dashboard_summary(a, 'W2');
    ASSERT (r -> 'totals' ->> 'units')::bigint = 0 AND (r -> 'totals' ->> 'products')::int = 0, 'W2 holds nothing';
    ASSERT jsonb_array_length(r -> 'locations') = 1 AND (r -> 'locations' -> 0 ->> 'capacity')::int = 50, 'only W2';
    ASSERT (SELECT sum((e ->> 'inbound_units')::int) FROM jsonb_array_elements(r -> 'movement') e) = 0, 'no movement at W2';
    r := public.dashboard_summary(a, 'W1');
    ASSERT (r -> 'totals' ->> 'units')::bigint = 2406, 'W1 holds everything';
    ASSERT public.dashboard_summary(a, 'ALL') -> 'totals' = public.dashboard_summary(a) -> 'totals', 'ALL = no filter';

    ---------------------------------------------------------------------------------------------
    -- another tenant, and bad input
    ---------------------------------------------------------------------------------------------
    r := public.dashboard_summary(b);
    ASSERT (r -> 'totals' ->> 'units')::bigint = 1000 AND (r -> 'totals' ->> 'products')::int = 1, 'Bob sees only his own';
    ASSERT (SELECT sum((e ->> 'inbound_units')::int) FROM jsonb_array_elements(r -> 'movement') e) = 500, 'and his own receipts';
    PERFORM pg_temp.expect_error(format('SELECT public.dashboard_summary(%s, ''W2'')', b), 'PT404');   -- Alice's location
    PERFORM pg_temp.expect_error(format('SELECT public.dashboard_summary(%s, NULL, 0)', a), 'PT400', '%days%');
    PERFORM pg_temp.expect_error(format('SELECT public.dashboard_summary(%s, NULL, 367)', a), 'PT400', '%days%');
    PERFORM pg_temp.expect_error(format('SELECT public.dashboard_summary(%s, NULL, 30, ''Mars/Olympus'')', a), 'PT400', '%time zone%');
    PERFORM pg_temp.expect_error(format('SELECT public.dashboard_summary(%s, NULL, 30, '''')', a), 'PT400', '%time zone%');

    -- a user without any data gets zeros, not an error
    r := public.dashboard_summary(0);
    ASSERT (r -> 'totals' ->> 'units')::int = 0 AND r -> 'locations' = '[]'::jsonb AND r -> 'by_category' = '[]'::jsonb AND r -> 'top_movers' = '[]'::jsonb, 'empty tenant';

    ---------------------------------------------------------------------------------------------
    -- privileges
    ---------------------------------------------------------------------------------------------
    ASSERT NOT has_function_privilege('anon', 'public.dashboard_summary(integer, text, integer, text)', 'EXECUTE'), 'anon cannot execute';
    ASSERT NOT has_function_privilege('authenticated', 'public.dashboard_summary(integer, text, integer, text)', 'EXECUTE'), 'authenticated cannot execute';
    ASSERT has_function_privilege('service_role', 'public.dashboard_summary(integer, text, integer, text)', 'EXECUTE'), 'service_role can';

    RAISE NOTICE 'dashboard_summary: all assertions passed';
END $$;

ROLLBACK;
