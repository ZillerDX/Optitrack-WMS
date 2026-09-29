-- Tests for 0010_soft_delete_products.sql. Run against a database with all migrations applied:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/soft_delete_products.sql
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
-- Alice: P1 (kept) and P2 (deleted below); Bob has a P1 too
INSERT INTO public.products (owner_id, sku, name, cost_price, sell_price, min_stock_level)
SELECT alice, 'P1', 'Kept', 5, 9, 3 FROM ids
UNION ALL SELECT alice, 'P2', 'Doomed', 2, 4, 0 FROM ids
UNION ALL SELECT bob, 'P2', 'Bobs', 1, 2, 0 FROM ids;
INSERT INTO public.locations (owner_id, name, capacity)
SELECT alice, 'A1', 20 FROM ids UNION ALL SELECT alice, 'A2', 20 FROM ids UNION ALL SELECT bob, 'B1', 100 FROM ids;
CREATE TEMP TABLE fx AS
SELECT (SELECT p.id FROM public.products p, ids WHERE p.owner_id = ids.alice AND p.sku = 'P1') AS keep,
       (SELECT p.id FROM public.products p, ids WHERE p.owner_id = ids.alice AND p.sku = 'P2') AS doomed,
       (SELECT p.id FROM public.products p, ids WHERE p.owner_id = ids.bob   AND p.sku = 'P2') AS bobs;

DO $$
DECLARE a int := (SELECT alice FROM ids); b int := (SELECT bob FROM ids);
        keep int := (SELECT keep FROM fx); doomed int := (SELECT doomed FROM fx); bobs int := (SELECT bobs FROM fx);
        r jsonb; free_a1 int;
BEGIN
    PERFORM public.apply_stock_movement(a, keep,   'A1', 'INBOUND', 5);
    PERFORM public.apply_stock_movement(a, doomed, 'A1', 'INBOUND', 7);
    PERFORM public.apply_stock_movement(a, doomed, 'A2', 'INBOUND', 4);
    PERFORM public.apply_stock_movement(b, bobs,   'B1', 'INBOUND', 9);

    r := public.delete_product(a, doomed);
    ASSERT (r ->> 'id')::int = doomed AND r ->> 'deleted_at' IS NOT NULL, 'returns the id and the time';

    -- the product row stays (history), marked deleted, with its SKU freed
    ASSERT (SELECT deleted_at IS NOT NULL FROM public.products WHERE id = doomed), 'marked deleted';
    ASSERT (SELECT name FROM public.products WHERE id = doomed) = 'Doomed', 'name kept for the history';
    ASSERT (SELECT sku FROM public.products WHERE id = doomed) = 'P2-deleted' || doomed, 'sku renamed to free it';
    INSERT INTO public.products (owner_id, sku, name, cost_price, sell_price, min_stock_level) VALUES (a, 'P2', 'Reused', 1, 1, 0);

    -- its history survives: the original receipts plus one ADJUST-to-0 per shelf that held stock
    ASSERT (SELECT count(*) FROM public.transactions WHERE product_id = doomed AND type = 'INBOUND') = 2, 'inbound history kept';
    ASSERT (SELECT count(*) FROM public.transactions WHERE product_id = doomed AND type = 'ADJUST' AND quantity = 0
            AND notes = 'Product deleted') = 2, 'one zeroing adjustment per shelf';
    ASSERT NOT EXISTS (SELECT 1 FROM public.inventory WHERE product_id = doomed), 'stock rows removed';

    -- the freed capacity is really free (A1 holds only the other product's 5 units now)
    free_a1 := 20 - 5;
    PERFORM public.apply_stock_movement(a, keep, 'A1', 'INBOUND', free_a1);

    -- other products and tenants are untouched
    ASSERT (SELECT quantity FROM public.inventory WHERE product_id = keep AND location = 'A1') = 20, 'other product untouched';
    ASSERT (SELECT deleted_at IS NULL FROM public.products WHERE id = bobs), 'other tenant product untouched';
    ASSERT (SELECT quantity FROM public.inventory WHERE product_id = bobs) = 9, 'other tenant stock untouched';
END $$;

DO $$
DECLARE a int := (SELECT alice FROM ids); b int := (SELECT bob FROM ids);
        doomed int := (SELECT doomed FROM fx); bobs int := (SELECT bobs FROM fx);
BEGIN
    -- a deleted product cannot be moved (or deleted twice); somebody else's product looks the same
    PERFORM pg_temp.expect_error(format('SELECT public.apply_stock_movement(%s, %s, ''A1'', ''INBOUND'', 1)', a, doomed), 'PT404', 'Product with ID % not found or access denied');
    PERFORM pg_temp.expect_error(format('SELECT public.apply_stock_movement(%s, %s, ''A1'', ''ADJUST'', 0)', a, doomed), 'PT404');
    PERFORM pg_temp.expect_error(format('SELECT public.delete_product(%s, %s)', a, doomed), 'PT404');
    PERFORM pg_temp.expect_error(format('SELECT public.delete_product(%s, %s)', a, bobs), 'PT404');
    PERFORM pg_temp.expect_error(format('SELECT public.delete_product(%s, %s)', b, (SELECT keep FROM fx)), 'PT404');
    PERFORM pg_temp.expect_error(format('SELECT public.delete_product(%s, 999999)', a), 'PT404');
    ASSERT (SELECT deleted_at IS NULL FROM public.products WHERE id = bobs), 'refused delete changed nothing';
END $$;

-- an ADJUST that lowers stock is allowed even where the location is over capacity
DO $$
DECLARE a int := (SELECT alice FROM ids); keep int := (SELECT keep FROM fx);
BEGIN
    UPDATE public.locations SET capacity = 3 WHERE owner_id = a AND name = 'A1';   -- holds 20 now
    PERFORM pg_temp.expect_error(format('SELECT public.apply_stock_movement(%s, %s, ''A1'', ''INBOUND'', 1)', a, keep), 'PT400', '%capacity exceeded%');
    PERFORM pg_temp.expect_error(format('SELECT public.apply_stock_movement(%s, %s, ''A1'', ''ADJUST'', 21)', a, keep), 'PT400', '%capacity exceeded%');
    PERFORM public.apply_stock_movement(a, keep, 'A1', 'ADJUST', 10);
    ASSERT (SELECT quantity FROM public.inventory WHERE product_id = keep AND location = 'A1') = 10, 'lowering stock is allowed';
    PERFORM public.apply_stock_movement(a, keep, 'A1', 'OUTBOUND', 10);
END $$;

-- privileges
DO $$
DECLARE r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        ASSERT NOT has_function_privilege(r, 'public.delete_product(integer, integer)', 'EXECUTE'), r || ' must not execute delete_product';
        ASSERT NOT has_function_privilege(r, 'public.apply_stock_movement(integer, integer, text, text, integer, text, timestamptz, text)', 'EXECUTE'),
            r || ' must not execute apply_stock_movement';
    END LOOP;
    ASSERT has_function_privilege('service_role', 'public.delete_product(integer, integer)', 'EXECUTE'), 'service_role must';
END $$;

ROLLBACK;
\echo soft_delete_products.sql: all checks passed
