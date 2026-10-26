-- Tests for 0009_update_location.sql. Run against a database with all migrations applied:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/update_location.sql
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
SELECT alice, 'P1', 'P1', 5, 9, 3 FROM ids UNION ALL SELECT bob, 'P1', 'P1', 1, 2, 0 FROM ids;
-- Bob also has a location called A1: a rename of Alice's A1 must not touch it
INSERT INTO public.locations (owner_id, name, capacity)
SELECT alice, 'A1', 20 FROM ids UNION ALL SELECT alice, 'A2', 100 FROM ids
    UNION ALL SELECT bob, 'A1', 50 FROM ids;
CREATE TEMP TABLE fx AS
SELECT (SELECT id FROM public.products p, ids WHERE p.owner_id = ids.alice) AS pa,
       (SELECT id FROM public.products p, ids WHERE p.owner_id = ids.bob)   AS pb,
       (SELECT id FROM public.locations l, ids WHERE l.owner_id = ids.alice AND l.name = 'A1') AS la1,
       (SELECT id FROM public.locations l, ids WHERE l.owner_id = ids.bob   AND l.name = 'A1') AS lb1;

DO $$
DECLARE a int := (SELECT alice FROM ids); b int := (SELECT bob FROM ids);
        pa int := (SELECT pa FROM fx); pb int := (SELECT pb FROM fx);
BEGIN
    PERFORM public.apply_stock_movement(a, pa, 'A1', 'INBOUND', 8);
    PERFORM public.apply_stock_movement(b, pb, 'A1', 'INBOUND', 3);
END $$;

-- a rename cascades to this tenant's stock and history only
DO $$
DECLARE a int := (SELECT alice FROM ids); b int := (SELECT bob FROM ids);
        pa int := (SELECT pa FROM fx); pb int := (SELECT pb FROM fx); la1 int := (SELECT la1 FROM fx);
        r jsonb;
BEGIN
    r := public.update_location(a, la1, '{"name": "  Zone 1  ", "capacity": 30}');
    ASSERT r ->> 'name' = 'Zone 1' AND (r ->> 'capacity')::int = 30, 'name is trimmed, capacity updated';
    ASSERT (SELECT quantity FROM public.inventory WHERE product_id = pa AND location = 'Zone 1') = 8, 'stock followed the rename';
    ASSERT NOT EXISTS (SELECT 1 FROM public.inventory WHERE product_id = pa AND location = 'A1'), 'no stock left under the old name';
    ASSERT (SELECT count(*) FROM public.transactions WHERE product_id = pa AND location = 'Zone 1') = 1, 'history followed the rename';
    ASSERT (SELECT count(*) FROM public.transactions WHERE product_id = pa AND location = 'A1') = 0, 'no history under the old name';
    ASSERT (SELECT quantity FROM public.inventory WHERE product_id = pb AND location = 'A1') = 3, 'other tenant stock untouched';
    ASSERT (SELECT count(*) FROM public.transactions WHERE product_id = pb AND location = 'A1') = 1, 'other tenant history untouched';
    ASSERT (SELECT name FROM public.locations WHERE owner_id = b) = 'A1', 'other tenant location untouched';

    -- stock movements keep working under the new name
    PERFORM public.apply_stock_movement(a, pa, 'Zone 1', 'OUTBOUND', 2);
    ASSERT (SELECT quantity FROM public.inventory WHERE product_id = pa AND location = 'Zone 1') = 6, 'movement under the new name';
END $$;

-- partial updates
DO $$
DECLARE a int := (SELECT alice FROM ids); la1 int := (SELECT la1 FROM fx); r jsonb;
BEGIN
    r := public.update_location(a, la1, '{"description": "cold room"}');
    ASSERT r ->> 'description' = 'cold room' AND r ->> 'name' = 'Zone 1' AND (r ->> 'capacity')::int = 30, 'only the description changed';
    r := public.update_location(a, la1, '{"description": null}');
    ASSERT r ->> 'description' IS NULL, 'description can be cleared';
END $$;

-- refusals change nothing
DO $$
DECLARE a int := (SELECT alice FROM ids); b int := (SELECT bob FROM ids);
        pa int := (SELECT pa FROM fx); la1 int := (SELECT la1 FROM fx); lb1 int := (SELECT lb1 FROM fx);
BEGIN
    -- the name is already used by another of Alice's locations: unique violation (HTTP 409), all rolled back
    PERFORM pg_temp.expect_error(format('SELECT public.update_location(%s, %s, ''{"name": "A2"}'')', a, la1), '23505');
    ASSERT (SELECT name FROM public.locations WHERE id = la1) = 'Zone 1', 'name unchanged after the refusal';
    ASSERT (SELECT quantity FROM public.inventory WHERE product_id = pa AND location = 'Zone 1') = 6, 'stock unchanged after the refusal';

    -- somebody else's location, and one that does not exist, look the same
    PERFORM pg_temp.expect_error(format('SELECT public.update_location(%s, %s, ''{"name": "x"}'')', b, la1), 'PT404', 'Location not found');
    PERFORM pg_temp.expect_error(format('SELECT public.update_location(%s, %s, ''{"name": "x"}'')', a, lb1), 'PT404', 'Location not found');
    PERFORM pg_temp.expect_error(format('SELECT public.update_location(%s, 999999, ''{"name": "x"}'')', a), 'PT404', 'Location not found');

    PERFORM pg_temp.expect_error(format('SELECT public.update_location(%s, %s, ''{}'')', a, la1), 'PT422', 'No editable fields provided');
    PERFORM pg_temp.expect_error(format('SELECT public.update_location(%s, %s, ''{"name": "   "}'')', a, la1), 'PT422', 'name must be 1-50 characters');
    PERFORM pg_temp.expect_error(format('SELECT public.update_location(%s, %s, ''{"name": 5}'')', a, la1), 'PT422', 'name must be 1-50 characters');
    PERFORM pg_temp.expect_error(format('SELECT public.update_location(%s, %s, ''{"capacity": -1}'')', a, la1), 'PT422', 'capacity must be a non-negative integer');
    PERFORM pg_temp.expect_error(format('SELECT public.update_location(%s, %s, ''{"capacity": 1.5}'')', a, la1), 'PT422', 'capacity must be a non-negative integer');
    PERFORM pg_temp.expect_error(format('SELECT public.update_location(%s, %s, ''{"capacity": "9"}'')', a, la1), 'PT422', 'capacity must be a non-negative integer');
END $$;

-- privileges: only the service role may call it
DO $$
DECLARE r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        ASSERT NOT has_function_privilege(r, 'public.update_location(integer, integer, jsonb)', 'EXECUTE'), r || ' must not execute update_location';
    END LOOP;
    ASSERT has_function_privilege('service_role', 'public.update_location(integer, integer, jsonb)', 'EXECUTE'), 'service_role must';
END $$;

ROLLBACK;
\echo update_location.sql: all checks passed
