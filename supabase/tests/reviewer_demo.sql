-- Tests for 0014_reviewer_demo.sql. Run against a database with all migrations applied:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/reviewer_demo.sql
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

-- a real tenant that must never be touched by the demo functions
INSERT INTO public.users (email, password_hash, first_name, last_name, role, is_active)
VALUES ('real@test', 'x', 'Real', 'Person', 'ADMIN', true);
INSERT INTO public.locations (owner_id, name, capacity)
SELECT id, 'Real-1', 100 FROM public.users WHERE email = 'real@test';

DO $$
DECLARE
    d1 jsonb;
    d2 jsonb;
    a  integer;
    b  integer;
    r  record;
    v_real integer := (SELECT id FROM public.users WHERE email = 'real@test');
BEGIN
    d1 := public.create_demo_account('hash-1', 50);
    a  := (d1 ->> 'id')::integer;

    -- the account
    ASSERT (d1 ->> 'email') LIKE 'demo-%@demo.invalid', 'a demo email that cannot be a real address';
    ASSERT d1 ->> 'first_name' = 'Reviewer' AND d1 ->> 'role' = 'ADMIN' AND (d1 ->> 'is_active')::boolean, 'an active admin';
    ASSERT (d1 ->> 'demo_expires_at')::timestamptz > now() + interval '47 hours', 'lives about 48 hours';
    ASSERT (SELECT demo_expires_at FROM public.users WHERE id = a) IS NOT NULL, 'marked as a demo in the table';

    -- the mock data
    ASSERT (SELECT count(*) FROM public.locations  WHERE owner_id = a) = 3,  'three zones';
    ASSERT (SELECT count(*) FROM public.categories WHERE owner_id = a) = 4,  'four categories';
    ASSERT (SELECT count(*) FROM public.products   WHERE owner_id = a) = 10, 'ten products';
    ASSERT (SELECT count(*) FROM public.transactions WHERE user_id = a) BETWEEN 60 AND 120, 'a month of history';
    ASSERT (SELECT count(DISTINCT type) FROM public.transactions WHERE user_id = a) = 3, 'received, shipped and adjusted';
    ASSERT (SELECT min(created_at) FROM public.transactions WHERE user_id = a) < now() - interval '15 days', 'history reaches back';
    ASSERT (SELECT max(created_at) FROM public.transactions WHERE user_id = a) <= now(), 'nothing in the future';
    ASSERT (SELECT count(*) FROM public.transactions WHERE user_id = a AND type = 'ADJUST' AND stock_after IS NOT NULL) = 2, 'two adjustments with stock_after';

    -- every location is inside its capacity, and the stock adds up to the history
    FOR r IN
        SELECT l.name, l.capacity, COALESCE(sum(i.quantity), 0) AS used
        FROM public.locations l
        LEFT JOIN public.inventory i ON i.location = l.name AND i.product_id IN (SELECT id FROM public.products WHERE owner_id = a)
        WHERE l.owner_id = a GROUP BY l.name, l.capacity
    LOOP
        ASSERT r.used <= r.capacity, format('%s over capacity (%s of %s)', r.name, r.used, r.capacity);
    END LOOP;
    ASSERT (SELECT sum(quantity) FROM public.inventory WHERE product_id IN (SELECT id FROM public.products WHERE owner_id = a))
         = (SELECT sum(CASE WHEN type = 'OUTBOUND' THEN -quantity ELSE quantity END) FROM public.transactions WHERE user_id = a),
           'the stock equals the sum of the history';

    -- a demo that shows every status
    ASSERT (SELECT count(*) FROM public.inventory i JOIN public.products p ON p.id = i.product_id
            WHERE p.owner_id = a AND i.quantity = 0) = 1, 'exactly one product is out of stock';
    ASSERT (SELECT count(*) FROM public.inventory i JOIN public.products p ON p.id = i.product_id
            WHERE p.owner_id = a AND i.quantity > 0 AND i.quantity < p.min_stock_level) >= 1, 'at least one product is below its minimum';
    ASSERT (SELECT count(*) FROM public.inventory i JOIN public.products p ON p.id = i.product_id
            WHERE p.owner_id = a AND i.quantity >= p.min_stock_level) >= 5, 'most products are fine';

    -- two demos never share anything
    d2 := public.create_demo_account('hash-2', 50);
    b  := (d2 ->> 'id')::integer;
    ASSERT a <> b AND d1 ->> 'email' <> d2 ->> 'email', 'two different accounts';
    ASSERT (SELECT count(*) FROM public.products WHERE owner_id = b) = 10 AND (SELECT count(*) FROM public.products WHERE owner_id = a) = 10, 'each has its own ten';

    -- the cap: with 2 active and a cap of 2, a third is refused with a message to show
    PERFORM pg_temp.expect_error($q$SELECT public.create_demo_account('hash-3', 2)$q$, 'PT429', '%busy%');
    PERFORM pg_temp.expect_error($q$SELECT public.create_demo_account('', 10)$q$, 'PT400');
    PERFORM pg_temp.expect_error($q$SELECT public.create_demo_account('h', 0)$q$, 'PT400');

    -- expiry: an expired demo is removed with everything it owns, a live one and a real tenant are not
    UPDATE public.users SET demo_expires_at = now() - interval '1 minute' WHERE id = a;
    ASSERT public.purge_expired_demo_accounts() = 1, 'one account purged';
    ASSERT NOT EXISTS (SELECT 1 FROM public.users WHERE id = a), 'the user is gone';
    ASSERT NOT EXISTS (SELECT 1 FROM public.products WHERE owner_id = a) AND NOT EXISTS (SELECT 1 FROM public.transactions WHERE user_id = a)
       AND NOT EXISTS (SELECT 1 FROM public.locations WHERE owner_id = a) AND NOT EXISTS (SELECT 1 FROM public.categories WHERE owner_id = a)
       AND NOT EXISTS (SELECT 1 FROM public.inventory WHERE product_id NOT IN (SELECT id FROM public.products)), 'nothing is left behind';
    ASSERT (SELECT count(*) FROM public.products WHERE owner_id = b) = 10, 'the live demo is untouched';
    ASSERT EXISTS (SELECT 1 FROM public.users WHERE id = v_real) AND EXISTS (SELECT 1 FROM public.locations WHERE owner_id = v_real), 'the real tenant is untouched';
    ASSERT public.purge_expired_demo_accounts() = 0, 'nothing more to purge';

    -- creating a demo also cleans up (so no cron is needed) and an expired demo does not count against the cap
    UPDATE public.users SET demo_expires_at = now() - interval '1 second' WHERE id = b;
    d1 := public.create_demo_account('hash-4', 1);
    ASSERT NOT EXISTS (SELECT 1 FROM public.users WHERE id = b), 'the expired demo went when a new one was made';

    -- privileges: only the server (service_role) may call these
    ASSERT NOT has_function_privilege('anon', 'public.create_demo_account(text, integer, interval)', 'EXECUTE'), 'anon cannot create demos';
    ASSERT NOT has_function_privilege('authenticated', 'public.create_demo_account(text, integer, interval)', 'EXECUTE'), 'authenticated cannot create demos';
    ASSERT has_function_privilege('service_role', 'public.create_demo_account(text, integer, interval)', 'EXECUTE'), 'service_role can';
    ASSERT NOT has_function_privilege('anon', 'public.purge_expired_demo_accounts()', 'EXECUTE'), 'anon cannot purge';
    ASSERT has_function_privilege('service_role', 'public.purge_expired_demo_accounts()', 'EXECUTE'), 'service_role can purge';

    RAISE NOTICE 'reviewer_demo: all assertions passed';
END $$;

ROLLBACK;
