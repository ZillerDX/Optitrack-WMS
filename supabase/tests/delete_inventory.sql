-- Tests for 0011_delete_inventory.sql. Run against a database with all migrations applied:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/delete_inventory.sql
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
INSERT INTO public.products (owner_id, sku, name, cost_price, sell_price, min_stock_level)
SELECT alice, 'P1', 'P1', 5, 9, 3 FROM ids UNION ALL SELECT bob, 'P1', 'Bobs', 1, 2, 0 FROM ids;
INSERT INTO public.locations (owner_id, name, capacity)
SELECT alice, 'A1', 20 FROM ids UNION ALL SELECT alice, 'A2', 20 FROM ids UNION ALL SELECT bob, 'B1', 100 FROM ids;
CREATE TEMP TABLE fx AS
SELECT (SELECT p.id FROM public.products p, ids WHERE p.owner_id = ids.alice) AS pa,
       (SELECT p.id FROM public.products p, ids WHERE p.owner_id = ids.bob)   AS pb;

-- a row that holds stock: the units are accounted for by an ADJUST to 0, then the row goes
DO $$
DECLARE a int := (SELECT alice FROM ids); b int := (SELECT bob FROM ids);
        pa int := (SELECT pa FROM fx); pb int := (SELECT pb FROM fx);
        inv int; r jsonb;
BEGIN
    PERFORM public.apply_stock_movement(a, pa, 'A1', 'INBOUND', 12);
    PERFORM public.apply_stock_movement(a, pa, 'A2', 'INBOUND', 4);
    PERFORM public.apply_stock_movement(b, pb, 'B1', 'INBOUND', 9);
    inv := (SELECT id FROM public.inventory WHERE product_id = pa AND location = 'A1');

    r := public.delete_inventory(a, inv);
    ASSERT (r ->> 'removed_quantity')::int = 12 AND r ->> 'location' = 'A1', 'reports what was removed';
    ASSERT NOT EXISTS (SELECT 1 FROM public.inventory WHERE id = inv), 'row removed';
    ASSERT (SELECT count(*) FROM public.transactions WHERE product_id = pa AND location = 'A1' AND type = 'ADJUST'
            AND quantity = 0 AND notes = 'Inventory record deleted') = 1, 'the removal is recorded';
    ASSERT (SELECT count(*) FROM public.transactions WHERE product_id = pa AND location = 'A1' AND type = 'INBOUND') = 1, 'history kept';

    -- neighbours untouched
    ASSERT (SELECT quantity FROM public.inventory WHERE product_id = pa AND location = 'A2') = 4, 'other shelf untouched';
    ASSERT (SELECT quantity FROM public.inventory WHERE product_id = pb) = 9, 'other tenant untouched';

    -- freed capacity is really free
    PERFORM public.apply_stock_movement(a, pa, 'A1', 'INBOUND', 20);
END $$;

-- an empty row is removed without a pointless transaction
DO $$
DECLARE a int := (SELECT alice FROM ids); pa int := (SELECT pa FROM fx); inv int; before_tx int;
BEGIN
    PERFORM public.apply_stock_movement(a, pa, 'A2', 'ADJUST', 0);
    inv := (SELECT id FROM public.inventory WHERE product_id = pa AND location = 'A2');
    before_tx := (SELECT count(*) FROM public.transactions);
    PERFORM public.delete_inventory(a, inv);
    ASSERT NOT EXISTS (SELECT 1 FROM public.inventory WHERE id = inv), 'empty row removed';
    ASSERT (SELECT count(*) FROM public.transactions) = before_tx, 'no transaction for an empty row';
END $$;

-- refusals change nothing
DO $$
DECLARE a int := (SELECT alice FROM ids); b int := (SELECT bob FROM ids);
        pa int := (SELECT pa FROM fx); pb int := (SELECT pb FROM fx);
        mine int := (SELECT id FROM public.inventory WHERE product_id = pa AND location = 'A1');
        bobs int := (SELECT id FROM public.inventory WHERE product_id = pb);
BEGIN
    PERFORM pg_temp.expect_error(format('SELECT public.delete_inventory(%s, %s)', b, mine), 'PT404', 'Inventory record not found');
    PERFORM pg_temp.expect_error(format('SELECT public.delete_inventory(%s, %s)', a, bobs), 'PT404', 'Inventory record not found');
    PERFORM pg_temp.expect_error(format('SELECT public.delete_inventory(%s, 999999)', a), 'PT404', 'Inventory record not found');
    ASSERT (SELECT quantity FROM public.inventory WHERE id = mine) = 20, 'refused delete changed nothing';
    ASSERT (SELECT quantity FROM public.inventory WHERE id = bobs) = 9, 'other tenant row still there';
    -- deleting twice
    PERFORM public.delete_inventory(a, mine);
    PERFORM pg_temp.expect_error(format('SELECT public.delete_inventory(%s, %s)', a, mine), 'PT404', 'Inventory record not found');
END $$;

-- privileges
DO $$
DECLARE r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        ASSERT NOT has_function_privilege(r, 'public.delete_inventory(integer, integer)', 'EXECUTE'), r || ' must not execute delete_inventory';
    END LOOP;
    ASSERT has_function_privilege('service_role', 'public.delete_inventory(integer, integer)', 'EXECUTE'), 'service_role must';
END $$;

ROLLBACK;
\echo delete_inventory.sql: all checks passed
