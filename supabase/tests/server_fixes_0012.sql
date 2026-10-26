-- Tests for 0012_server_fixes.sql. Run against a database with all migrations applied:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/server_fixes_0012.sql
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
-- Both tenants use the same SKU, location name and PO number on purpose.
INSERT INTO public.products (owner_id, sku, name, cost_price, sell_price, min_stock_level)
SELECT alice, 'SKU001', 'Hammer', 10, 15, 2 FROM ids
UNION ALL SELECT bob, 'SKU001', 'Drill', 50, 80, 2 FROM ids;
INSERT INTO public.locations (owner_id, name, capacity)
SELECT alice, 'Z1', 100 FROM ids UNION ALL SELECT alice, 'Z2', 100 FROM ids
UNION ALL SELECT bob, 'Z1', 100 FROM ids;
CREATE TEMP TABLE fx AS
SELECT (SELECT p.id FROM public.products p, ids WHERE p.owner_id = ids.alice) AS pa,
       (SELECT p.id FROM public.products p, ids WHERE p.owner_id = ids.bob)   AS pb;

DO $$
DECLARE a int := (SELECT alice FROM ids); b int := (SELECT bob FROM ids);
        pa int := (SELECT pa FROM fx); pb int := (SELECT pb FROM fx);
        r jsonb; z1 int; ledger bigint; n int;
BEGIN
    ---------------------------------------------------------------------------------------------
    -- S2: PO numbers and reference codes are unique per tenant, not across tenants
    ---------------------------------------------------------------------------------------------
    PERFORM public.approve_reorder(a, pa, 'Z1', 5, 'PO-20261026-SKU001');
    PERFORM public.approve_reorder(b, pb, 'Z1', 5, 'PO-20261026-SKU001');  -- same number, other tenant: fine
    ASSERT (SELECT count(*) FROM public.purchase_orders WHERE po_number = 'PO-20261026-SKU001') = 2, 'both tenants keep their PO';
    ASSERT (SELECT count(*) FROM public.transactions WHERE ref_code = 'PO-20261026-SKU001') = 2, 'and their receipt';
    -- within one tenant the number is still unique, and the failed receipt rolls back
    PERFORM pg_temp.expect_error(format('SELECT public.approve_reorder(%s, %s, ''Z1'', 5, ''PO-20261026-SKU001'')', a, pa), '23505');
    ASSERT (SELECT quantity FROM public.inventory WHERE product_id = pa AND location = 'Z1') = 5, 'a repeated PO number receives nothing';
    PERFORM pg_temp.expect_error(
        format('SELECT public.apply_stock_movement(%s, %s, ''Z1'', ''INBOUND'', 1, NULL, NULL, ''PO-20261026-SKU001'')', a, pa), '23505');

    ---------------------------------------------------------------------------------------------
    -- S4: the history adds up to the stock; an ADJUST stores the signed change
    ---------------------------------------------------------------------------------------------
    PERFORM public.apply_stock_movement(a, pa, 'Z2', 'INBOUND', 20);
    r := public.apply_stock_movement(a, pa, 'Z2', 'ADJUST', 8);   -- 20 -> 8
    ASSERT (r -> 'transaction' ->> 'quantity')::int = -12, 'down-adjust stores -12';
    ASSERT (r -> 'transaction' ->> 'stock_after')::int = 8, 'and the level left behind';
    ASSERT (r -> 'transaction' ->> 'total_price')::numeric = 120, 'valued at cost on the size of the change (12 x 10)';
    r := public.apply_stock_movement(a, pa, 'Z2', 'ADJUST', 11);  -- 8 -> 11
    ASSERT (r -> 'transaction' ->> 'quantity')::int = 3 AND (r -> 'transaction' ->> 'stock_after')::int = 11, 'up-adjust stores +3';
    r := public.apply_stock_movement(a, pa, 'Z2', 'ADJUST', 11);  -- no change
    ASSERT (r -> 'transaction' ->> 'quantity')::int = 0, 'adjusting to the same level stores 0';
    r := public.apply_stock_movement(a, pa, 'Z2', 'OUTBOUND', 4);
    ASSERT (r -> 'transaction' ->> 'quantity')::int = 4 AND (r -> 'transaction' ->> 'stock_after')::int = 7, 'outbound keeps its positive amount';
    SELECT COALESCE(sum(CASE type WHEN 'OUTBOUND' THEN -quantity ELSE quantity END), 0) INTO ledger
    FROM public.transactions WHERE product_id = pa AND location = 'Z2';
    ASSERT ledger = 7 AND ledger = (SELECT quantity FROM public.inventory WHERE product_id = pa AND location = 'Z2'),
        'the ledger adds up to the shelf';

    ---------------------------------------------------------------------------------------------
    -- S1: a location with stock cannot be deleted; an empty one can
    ---------------------------------------------------------------------------------------------
    z1 := (SELECT id FROM public.locations WHERE owner_id = a AND name = 'Z1');
    PERFORM pg_temp.expect_error(format('SELECT public.delete_location(%s, %s)', a, z1), 'PT409', '%still holds 5 units%');
    ASSERT EXISTS (SELECT 1 FROM public.locations WHERE id = z1), 'location kept';
    ASSERT (SELECT quantity FROM public.inventory WHERE product_id = pa AND location = 'Z1') = 5, 'stock kept';
    -- another tenant cannot delete it, and cannot tell it exists
    PERFORM pg_temp.expect_error(format('SELECT public.delete_location(%s, %s)', b, z1), 'PT404');
    -- after the stock is taken to zero the location can go; its history keeps the name
    PERFORM public.apply_stock_movement(a, pa, 'Z1', 'ADJUST', 0);
    r := public.delete_location(a, z1);
    ASSERT r ->> 'name' = 'Z1', 'returns the name';
    ASSERT NOT EXISTS (SELECT 1 FROM public.locations WHERE id = z1), 'location removed';
    ASSERT NOT EXISTS (SELECT 1 FROM public.inventory WHERE product_id = pa AND location = 'Z1'), 'empty stock row removed';
    ASSERT (SELECT count(*) FROM public.transactions WHERE product_id = pa AND location = 'Z1') = 2, 'history keeps the location name';
    -- recreating the name does not bring stock back
    INSERT INTO public.locations (owner_id, name, capacity) VALUES (a, 'Z1', 100);
    ASSERT NOT EXISTS (SELECT 1 FROM public.inventory WHERE product_id = pa AND location = 'Z1'), 'a new Z1 starts empty';
    -- the other tenant's Z1 is untouched
    ASSERT (SELECT quantity FROM public.inventory WHERE product_id = pb AND location = 'Z1') = 5, 'other tenant untouched';
    PERFORM pg_temp.expect_error(format('SELECT public.delete_location(%s, 0)', a), 'PT404');

    ---------------------------------------------------------------------------------------------
    -- S10: deleting a product works even if "<sku>-deleted<id>" is already taken
    ---------------------------------------------------------------------------------------------
    INSERT INTO public.products (owner_id, sku, name, cost_price, sell_price, min_stock_level)
    VALUES (a, 'SKU001-deleted' || pa, 'Squatter', 1, 1, 0);
    r := public.delete_product(a, pa);
    ASSERT r ->> 'deleted_at' IS NOT NULL, 'delete succeeds';
    ASSERT (SELECT sku FROM public.products WHERE id = pa) = 'SKU001-deleted' || pa || '-1', 'sku gets a counter';
    SELECT count(*) INTO n FROM public.products WHERE owner_id = a AND sku LIKE 'SKU001%';
    ASSERT n = 2, 'the squatter and the deleted product both exist';
    INSERT INTO public.products (owner_id, sku, name, cost_price, sell_price, min_stock_level) VALUES (a, 'SKU001', 'Reused', 1, 1, 0);

    RAISE NOTICE 'server_fixes_0012: all assertions passed';
END $$;

ROLLBACK;
