-- Tests for 0008_stock_movements.sql. Run against a database with all migrations applied:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/stock_movements.sql
-- Everything runs inside one transaction that is rolled back, so nothing is left behind.
-- A failed ASSERT aborts the script with a message naming the check.

BEGIN;

-- expect_error(sql, sqlstate, message_like): the statement must raise that error, and (because
-- it runs in its own subtransaction) leave no trace.
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

CREATE FUNCTION pg_temp.qty(p_product int, p_location text) RETURNS int LANGUAGE sql AS
$$ SELECT quantity FROM public.inventory WHERE product_id = p_product AND location = p_location $$;

CREATE FUNCTION pg_temp.tx_count() RETURNS int LANGUAGE sql AS $$ SELECT count(*)::int FROM public.transactions $$;

-- Fixtures: two tenants. Alice's product costs 5 / sells 9 and has a minimum of 3.
INSERT INTO public.users (email, password_hash, first_name, last_name, role, is_active) VALUES
    ('alice@test', 'x', 'A', 'A', 'ADMIN', true),
    ('bob@test',   'x', 'B', 'B', 'ADMIN', true);
CREATE TEMP TABLE ids AS
SELECT (SELECT id FROM public.users WHERE email = 'alice@test') AS alice,
       (SELECT id FROM public.users WHERE email = 'bob@test')   AS bob;
INSERT INTO public.products (owner_id, sku, name, cost_price, sell_price, min_stock_level)
SELECT alice, 'P1', 'P1', 5, 9, 3 FROM ids UNION ALL SELECT bob, 'P1', 'P1', 1, 2, 0 FROM ids;
INSERT INTO public.locations (owner_id, name, capacity)
SELECT alice, 'A1', 20 FROM ids UNION ALL SELECT alice, 'A2', 100 FROM ids UNION ALL SELECT alice, 'A3', 5 FROM ids
    UNION ALL SELECT bob, 'B1', 100 FROM ids;
CREATE TEMP TABLE prod AS
SELECT (SELECT id FROM public.products p, ids WHERE p.owner_id = ids.alice) AS alice,
       (SELECT id FROM public.products p, ids WHERE p.owner_id = ids.bob)   AS bob;

-- ---------------------------------------------------------------------------------------
DO $$
DECLARE a int := (SELECT alice FROM ids); pa int := (SELECT alice FROM prod); r jsonb;
BEGIN
    -- INBOUND into a location with no stock row creates it, priced at cost
    r := public.apply_stock_movement(a, pa, 'A1', 'INBOUND', 8);
    ASSERT pg_temp.qty(pa, 'A1') = 8, 'inbound creates the stock row';
    ASSERT (r -> 'transaction' ->> 'unit_price')::numeric = 5 AND (r -> 'transaction' ->> 'total_price')::numeric = 40, 'inbound priced at cost';
    ASSERT r -> 'transaction' ->> 'status' = 'COMPLETED', 'status is server side';
    ASSERT r -> 'transaction' ->> 'ref_code' ~ '^TXN-[0-9]{8}-[0-9A-F]{6}$', 'generated reference: ' || (r -> 'transaction' ->> 'ref_code');
    ASSERT (r -> 'inventory' ->> 'status') = 'IN_STOCK', 'inbound 8 with minimum 3 is in stock';

    -- OUTBOUND is priced at the sell price and moves the status through LOW_STOCK to OUT_OF_STOCK
    r := public.apply_stock_movement(a, pa, 'A1', 'OUTBOUND', 6);
    ASSERT pg_temp.qty(pa, 'A1') = 2, 'outbound decreases';
    ASSERT (r -> 'transaction' ->> 'unit_price')::numeric = 9, 'outbound priced at the sell price';
    ASSERT (r -> 'inventory' ->> 'status') = 'LOW_STOCK', '2 < minimum 3 is low stock';
    r := public.apply_stock_movement(a, pa, 'A1', 'OUTBOUND', 2);
    ASSERT (r -> 'inventory' ->> 'status') = 'OUT_OF_STOCK', 'zero is out of stock';

    -- INBOUND back above the minimum
    r := public.apply_stock_movement(a, pa, 'A1', 'INBOUND', 10);
    ASSERT (r -> 'inventory' ->> 'status') = 'IN_STOCK' AND pg_temp.qty(pa, 'A1') = 10, 'restocked';

    -- ADJUST sets the quantity and is priced at cost
    r := public.apply_stock_movement(a, pa, 'A1', 'ADJUST', 4);
    ASSERT pg_temp.qty(pa, 'A1') = 4 AND (r -> 'transaction' ->> 'unit_price')::numeric = 5, 'adjust sets the quantity';

    -- ADJUST to 0 empties the shelf; 0 is not a valid amount for INBOUND / OUTBOUND
    r := public.apply_stock_movement(a, pa, 'A1', 'ADJUST', 0);
    ASSERT pg_temp.qty(pa, 'A1') = 0 AND (r -> 'inventory' ->> 'status') = 'OUT_OF_STOCK', 'adjust to zero';
    PERFORM pg_temp.expect_error(format('SELECT public.apply_stock_movement(%s, %s, ''A1'', ''INBOUND'', 0)', a, pa), 'PT400', 'quantity must be a positive integer');
    PERFORM pg_temp.expect_error(format('SELECT public.apply_stock_movement(%s, %s, ''A1'', ''OUTBOUND'', 0)', a, pa), 'PT400', 'quantity must be a positive integer');
    PERFORM public.apply_stock_movement(a, pa, 'A1', 'ADJUST', 4);

    -- created_at and notes are stored
    r := public.apply_stock_movement(a, pa, 'A2', 'INBOUND', 1, 'cycle count', '2024-01-02 03:04:05+00');
    ASSERT (r -> 'transaction' ->> 'notes') = 'cycle count', 'notes stored';
    ASSERT (r -> 'transaction' ->> 'created_at')::timestamptz = '2024-01-02 03:04:05+00', 'created_at honoured';
END $$;

-- ---------------------------------------------------------------------------------------
-- Rules: nothing is changed when a movement is refused
DO $$
DECLARE a int := (SELECT alice FROM ids); pa int := (SELECT alice FROM prod);
        before_qty int; before_tx int;
BEGIN
    PERFORM public.apply_stock_movement(a, pa, 'A1', 'ADJUST', 8);
    before_qty := pg_temp.qty(pa, 'A1'); before_tx := pg_temp.tx_count();

    -- OUTBOUND beyond stock is refused, never clamped to zero
    PERFORM pg_temp.expect_error(format('SELECT public.apply_stock_movement(%s, %s, ''A1'', ''OUTBOUND'', 9)', a, pa), 'PT400', 'Insufficient stock. Available: 8, Requested: 9');
    -- OUTBOUND where no stock row exists
    PERFORM pg_temp.expect_error(format('SELECT public.apply_stock_movement(%s, %s, ''A3'', ''OUTBOUND'', 1)', a, pa), 'PT400', 'No inventory found at location ''A3'' for this product');
    ASSERT pg_temp.qty(pa, 'A1') = before_qty AND pg_temp.tx_count() = before_tx, 'refused outbound changed nothing';
END $$;

DO $$
DECLARE a int := (SELECT alice FROM ids); pa int := (SELECT alice FROM prod);
BEGIN
    -- capacity of A1 is 20 and it holds 8: +13 is over, +12 is exactly full
    PERFORM pg_temp.expect_error(format('SELECT public.apply_stock_movement(%s, %s, ''A1'', ''INBOUND'', 13)', a, pa), 'PT400', 'Location ''A1'' capacity exceeded. Capacity: 20, Current stock: 8, Projected stock: 21');
    PERFORM pg_temp.expect_error(format('SELECT public.apply_stock_movement(%s, %s, ''A1'', ''ADJUST'', 21)', a, pa), 'PT400', '%capacity exceeded%');
    PERFORM public.apply_stock_movement(a, pa, 'A1', 'INBOUND', 12);
    ASSERT pg_temp.qty(pa, 'A1') = 20, 'a full location accepts exactly its capacity';
    PERFORM pg_temp.expect_error(format('SELECT public.apply_stock_movement(%s, %s, ''A1'', ''INBOUND'', 1)', a, pa), 'PT400', '%capacity exceeded%');
END $$;

DO $$
DECLARE a int := (SELECT alice FROM ids); b int := (SELECT bob FROM ids);
        pa int := (SELECT alice FROM prod); pb int := (SELECT bob FROM prod);
        before_tx int := pg_temp.tx_count();
BEGIN
    -- the product must be the caller's own
    PERFORM pg_temp.expect_error(format('SELECT public.apply_stock_movement(%s, %s, ''A1'', ''INBOUND'', 1)', a, pb), 'PT404', '%not found or access denied');
    PERFORM pg_temp.expect_error(format('SELECT public.apply_stock_movement(%s, %s, ''B1'', ''INBOUND'', 1)', b, pa), 'PT404', '%not found or access denied');
    PERFORM pg_temp.expect_error(format('SELECT public.apply_stock_movement(%s, 999999, ''A1'', ''INBOUND'', 1)', a), 'PT404');
    -- ... and so must the location
    PERFORM pg_temp.expect_error(format('SELECT public.apply_stock_movement(%s, %s, ''B1'', ''INBOUND'', 1)', a, pa), 'PT400', 'Location ''B1'' not found%');
    PERFORM pg_temp.expect_error(format('SELECT public.apply_stock_movement(%s, %s, ''nowhere'', ''INBOUND'', 1)', a, pa), 'PT400', 'Location ''nowhere'' not found%');
    ASSERT pg_temp.tx_count() = before_tx, 'refused movements record nothing';
    ASSERT pg_temp.qty(pb, 'B1') IS NULL, 'the other tenant received nothing';
END $$;

DO $$
DECLARE a int := (SELECT alice FROM ids); pa int := (SELECT alice FROM prod);
BEGIN
    PERFORM pg_temp.expect_error(format('SELECT public.apply_stock_movement(%s, %s, ''A1'', ''SELL'', 1)', a, pa), 'PT400', 'type must be%');
    PERFORM pg_temp.expect_error(format('SELECT public.apply_stock_movement(%s, %s, ''A1'', NULL, 1)', a, pa), 'PT400');
    PERFORM pg_temp.expect_error(format('SELECT public.apply_stock_movement(%s, %s, ''A1'', ''INBOUND'', 0)', a, pa), 'PT400', 'quantity must be%');
    PERFORM pg_temp.expect_error(format('SELECT public.apply_stock_movement(%s, %s, ''A1'', ''INBOUND'', -5)', a, pa), 'PT400', 'quantity must be%');
    PERFORM pg_temp.expect_error(format('SELECT public.apply_stock_movement(%s, %s, ''A1'', ''INBOUND'', NULL)', a, pa), 'PT400');
    PERFORM pg_temp.expect_error(format('SELECT public.apply_stock_movement(%s, %s, '''', ''INBOUND'', 1)', a, pa), 'PT400', 'location is required%');
    PERFORM pg_temp.expect_error(format('SELECT public.apply_stock_movement(%s, %s, %L, ''INBOUND'', 1)', a, pa, repeat('x', 51)), 'PT400', 'location is required%');
    PERFORM pg_temp.expect_error(format('SELECT public.apply_stock_movement(%s, %s, ''A1'', ''INBOUND'', 1, %L)', a, pa, repeat('n', 501)), 'PT400', 'notes must be%');
END $$;

-- ---------------------------------------------------------------------------------------
-- Atomicity: a failure after the stock was changed leaves the stock unchanged
DO $$
DECLARE a int := (SELECT alice FROM ids); pa int := (SELECT alice FROM prod); before_qty int;
BEGIN
    PERFORM public.apply_stock_movement(a, pa, 'A2', 'ADJUST', 10, NULL, NULL, 'REF-ONCE');
    before_qty := pg_temp.qty(pa, 'A2');
    -- the same reference again: the inventory UPDATE has already happened when the INSERT
    -- into transactions hits the unique index, so this proves the whole movement rolls back
    PERFORM pg_temp.expect_error(format('SELECT public.apply_stock_movement(%s, %s, ''A2'', ''INBOUND'', 5, NULL, NULL, ''REF-ONCE'')', a, pa), '23505');
    ASSERT pg_temp.qty(pa, 'A2') = before_qty, 'a failed movement must not change stock (got ' || pg_temp.qty(pa, 'A2') || ')';
    ASSERT (SELECT count(*) FROM public.transactions WHERE ref_code = 'REF-ONCE') = 1, 'and must not add a second transaction';
END $$;

-- ---------------------------------------------------------------------------------------
-- Purchase-order approval: stock + transaction + PO together
DO $$
DECLARE a int := (SELECT alice FROM ids); pa int := (SELECT alice FROM prod); pb int := (SELECT bob FROM prod);
        r jsonb; before_qty int; before_tx int;
BEGIN
    PERFORM public.apply_stock_movement(a, pa, 'A2', 'ADJUST', 1);
    before_qty := pg_temp.qty(pa, 'A2');

    r := public.approve_reorder(a, pa, 'A2', 3, 'PO-100', 'Acme', 'Widget', 'P1', NULL);
    ASSERT pg_temp.qty(pa, 'A2') = before_qty + 3, 'stock received';
    ASSERT (r -> 'transaction' ->> 'ref_code') = 'PO-100' AND (r -> 'transaction' ->> 'type') = 'INBOUND', 'transaction carries the PO number';
    ASSERT (r -> 'transaction' ->> 'unit_price')::numeric = 5, 'received at the product cost, not a caller supplied cost';
    ASSERT (r -> 'purchase_order' ->> 'total_amount')::numeric = 15 AND (r -> 'purchase_order' ->> 'status') = 'APPROVED', 'PO total and status';
    ASSERT (r -> 'purchase_order' -> 'items' -> 0 ->> 'sku') = 'P1' AND (r -> 'purchase_order' ->> 'supplier') = 'Acme', 'PO items';
    ASSERT (r -> 'purchase_order' ->> 'user_id')::int = a, 'PO belongs to the caller';

    -- default supplier and note
    r := public.approve_reorder(a, pa, 'A2', 1, 'PO-101');
    ASSERT (r -> 'purchase_order' ->> 'supplier') = 'Vendor', 'default supplier';

    -- an existing PO number rolls the whole approval back (the receipt too)
    before_qty := pg_temp.qty(pa, 'A2'); before_tx := pg_temp.tx_count();
    PERFORM pg_temp.expect_error(format('SELECT public.approve_reorder(%s, %s, ''A2'', 2, ''PO-100'')', a, pa), '23505');
    ASSERT pg_temp.qty(pa, 'A2') = before_qty AND pg_temp.tx_count() = before_tx, 'duplicate PO number changes nothing';

    -- a foreign product creates neither stock nor a PO
    PERFORM pg_temp.expect_error(format('SELECT public.approve_reorder(%s, %s, ''A2'', 2, ''PO-200'')', a, pb), 'PT404');
    ASSERT NOT EXISTS (SELECT 1 FROM public.purchase_orders WHERE po_number = 'PO-200'), 'no PO for a refused receipt';

    PERFORM pg_temp.expect_error(format('SELECT public.approve_reorder(%s, %s, ''A2'', 2, '''')', a, pa), 'PT400', 'po_number must be%');
    PERFORM pg_temp.expect_error(format('SELECT public.approve_reorder(%s, %s, ''A2'', 0, ''PO-300'')', a, pa), 'PT400', 'quantity must be%');
    ASSERT NOT EXISTS (SELECT 1 FROM public.purchase_orders WHERE po_number = 'PO-300'), 'no PO for invalid input';
END $$;

-- ---------------------------------------------------------------------------------------
-- Privileges: the caller supplies p_user_id, so only the server (service_role) may call these
DO $$
DECLARE a int := (SELECT alice FROM ids); pa int := (SELECT alice FROM prod);
BEGIN
    -- (inline handlers: after SET ROLE the caller may not use pg_temp objects)
    SET LOCAL ROLE anon;
    BEGIN
        PERFORM public.apply_stock_movement(a, pa, 'A1', 'INBOUND', 1);
        RESET ROLE; RAISE EXCEPTION 'anon must not be able to move stock';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
        PERFORM public.approve_reorder(a, pa, 'A1', 1, 'PO-X');
        RESET ROLE; RAISE EXCEPTION 'anon must not be able to approve reorders';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    RESET ROLE;

    SET LOCAL ROLE authenticated;
    BEGIN
        PERFORM public.apply_stock_movement(a, pa, 'A1', 'INBOUND', 1);
        RESET ROLE; RAISE EXCEPTION 'authenticated must not be able to move stock';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    RESET ROLE;

    SET LOCAL ROLE service_role;
    PERFORM public.apply_stock_movement(a, pa, 'A2', 'INBOUND', 1);
    RESET ROLE;
END $$;

ROLLBACK;
\echo stock_movements.sql: all checks passed
