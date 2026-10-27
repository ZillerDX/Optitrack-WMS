-- Tests for 0015_ref_code_length.sql. Run against a database with all migrations applied:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/ref_code_0015.sql
-- Runs inside one transaction that is rolled back.

BEGIN;

INSERT INTO public.users (email, password_hash, first_name, last_name, role, is_active)
VALUES ('refs@test', 'x', 'Ref', 'Codes', 'ADMIN', true);
INSERT INTO public.locations (owner_id, name, capacity)
SELECT id, 'R-1', 100000 FROM public.users WHERE email = 'refs@test';
INSERT INTO public.products (owner_id, sku, name, cost_price, sell_price, min_stock_level, unit)
SELECT id, 'REF-1', 'Ref product', 1, 2, 0, 'pcs' FROM public.users WHERE email = 'refs@test';

DO $$
DECLARE
    u integer := (SELECT id FROM public.users WHERE email = 'refs@test');
    p integer := (SELECT id FROM public.products WHERE sku = 'REF-1');
    i integer;
    n integer;
BEGIN
    -- 3000 movements in one day for one tenant: with 6 characters a collision (HTTP 409) is likely
    -- at this volume (about 25 percent); with 12 characters none is expected
    FOR i IN 1..3000 LOOP
        PERFORM public.apply_stock_movement(u, p, 'R-1', 'INBOUND', 1);
    END LOOP;

    SELECT count(DISTINCT ref_code) INTO n FROM public.transactions WHERE user_id = u;
    ASSERT n = 3000, 'every generated reference is distinct: ' || n;

    ASSERT NOT EXISTS (SELECT 1 FROM public.transactions WHERE user_id = u AND ref_code !~ '^TXN-[0-9]{8}-[0-9A-F]{12}$'),
        'generated references are TXN-YYYYMMDD- plus 12 hex characters';

    -- a reference given by the caller is still stored as sent
    ASSERT (public.apply_stock_movement(u, p, 'R-1', 'INBOUND', 1, NULL, NULL, 'MINE-1') -> 'transaction' ->> 'ref_code') = 'MINE-1';
END $$;

ROLLBACK;
