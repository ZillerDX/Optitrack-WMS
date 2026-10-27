-- Reviewer demo: a throw-away account with mock data, created by one call and removed when it expires.
--
-- Why in the database: the mock data needs ~100 stock movements; as one function it is one round trip
-- (a serverless route that made them one by one would be slow and could time out), it is atomic (a
-- half-built demo never exists) and it goes through apply_stock_movement like every real movement.
--
-- Idempotent: safe to run again. Rollback: supabase/rollback/0014_reviewer_demo_down.sql.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS demo_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS ix_users_demo_expires
    ON public.users (demo_expires_at) WHERE demo_expires_at IS NOT NULL;

-- Removes demo accounts whose time is up, with everything they own. Returns how many accounts went.
CREATE OR REPLACE FUNCTION public.purge_expired_demo_accounts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ids integer[];
BEGIN
    SELECT COALESCE(array_agg(id), ARRAY[]::integer[]) INTO v_ids
    FROM public.users
    WHERE demo_expires_at IS NOT NULL AND demo_expires_at < now();

    IF cardinality(v_ids) = 0 THEN
        RETURN 0;
    END IF;

    -- transactions and inventory of the products go with the products (ON DELETE CASCADE);
    -- purchase orders go with the user. The rest has no cascade, so it is removed here, children first.
    DELETE FROM public.transactions WHERE user_id = ANY (v_ids);
    DELETE FROM public.products     WHERE owner_id = ANY (v_ids);
    DELETE FROM public.locations    WHERE owner_id = ANY (v_ids);
    DELETE FROM public.categories   WHERE owner_id = ANY (v_ids);
    DELETE FROM public.users        WHERE id = ANY (v_ids);

    RETURN cardinality(v_ids);
END
$$;

-- Creates a demo account with mock data and returns the user as the sign-in route needs it.
--   p_password_hash  a hash of a random password nobody knows (the account is entered by session only)
--   p_max_active     how many unexpired demo accounts may exist (keeps a free database from filling up)
--   p_ttl            how long the account lives
CREATE OR REPLACE FUNCTION public.create_demo_account(
    p_password_hash text,
    p_max_active    integer  DEFAULT 50,
    p_ttl           interval DEFAULT interval '48 hours'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user      public.users;
    v_uid       integer;
    v_active    integer;
    v_email     text;
    v_p         record;
    v_pid       integer;
    v_j         integer;
    v_out       integer;
    v_now       timestamptz := now();
    v_current   integer;
BEGIN
    IF p_password_hash IS NULL OR p_password_hash = '' THEN
        RAISE EXCEPTION 'password hash is required' USING ERRCODE = 'PT400';
    END IF;
    IF p_max_active IS NULL OR p_max_active < 1 OR p_max_active > 500 THEN
        RAISE EXCEPTION 'max active demo accounts must be 1-500' USING ERRCODE = 'PT400';
    END IF;

    PERFORM public.purge_expired_demo_accounts();

    -- serialise creators so the cap cannot be overshot by concurrent calls
    PERFORM pg_advisory_xact_lock(hashtext('create_demo_account'));
    SELECT count(*) INTO v_active FROM public.users WHERE demo_expires_at IS NOT NULL AND demo_expires_at >= now();
    IF v_active >= p_max_active THEN
        RAISE EXCEPTION 'The demo is busy right now. Please try again in a few minutes.' USING ERRCODE = 'PT429';
    END IF;

    v_email := 'demo-' || substr(md5(random()::text || clock_timestamp()::text), 1, 12) || '@demo.invalid';
    INSERT INTO public.users (email, password_hash, role, first_name, last_name, is_active, demo_expires_at)
    VALUES (v_email, p_password_hash, 'ADMIN', 'Reviewer', 'Demo', true, v_now + p_ttl)
    RETURNING * INTO v_user;
    v_uid := v_user.id;

    INSERT INTO public.categories (owner_id, name)
    VALUES (v_uid, 'Equipment'), (v_uid, 'Safety'), (v_uid, 'Supplies'), (v_uid, 'Food');

    -- the same three zones a new real account gets on first use
    INSERT INTO public.locations (owner_id, name, description, capacity) VALUES
        (v_uid, 'Zone A-01',          'Main Storage - High Velocity Racks', 500),
        (v_uid, 'Zone B-02',          'Secondary Storage - Heavy Equipment', 300),
        (v_uid, 'Cold Storage C-01',  'Temperature Controlled Zone', 100);

    -- k, name, sku, category, cost, price, minimum, location, first receipt
    FOR v_p IN
        SELECT * FROM (VALUES
            (1,  'Pallet jack',        'DEMO-001', 'Equipment', 120.00, 210.00,  3, 'Zone B-02',         12),
            (2,  'Safety gloves (L)',  'DEMO-002', 'Safety',      2.50,   4.50, 40, 'Zone A-01',        120),
            (3,  'Thermal paper roll', 'DEMO-003', 'Supplies',    1.10,   2.40, 30, 'Zone A-01',         18),
            (4,  'Frozen peas 1kg',    'DEMO-004', 'Food',        1.60,   3.20, 20, 'Cold Storage C-01', 50),
            (5,  'Label printer',      'DEMO-005', 'Equipment',  95.00, 170.00,  4, 'Zone B-02',          9),
            (6,  'Packing tape',       'DEMO-006', 'Supplies',    0.90,   2.20, 50, 'Zone A-01',        110),
            (7,  'Barcode scanner',    'DEMO-007', 'Equipment',  55.00,  98.00,  6, 'Zone B-02',         15),
            (8,  'Cardboard box M',    'DEMO-008', 'Supplies',    0.50,   1.40, 60, 'Zone A-01',         90),
            (9,  'Safety vest',        'DEMO-009', 'Safety',      4.00,   7.50, 25, 'Zone A-01',         60),
            (10, 'Frozen chicken 2kg', 'DEMO-010', 'Food',        6.00,  10.50, 15, 'Cold Storage C-01', 20)
        ) AS t(k, name, sku, category, cost, price, min_stock, location, receipt)
    LOOP
        INSERT INTO public.products (owner_id, sku, name, category, cost_price, sell_price, min_stock_level, unit)
        VALUES (v_uid, v_p.sku, v_p.name, v_p.category, v_p.cost, v_p.price, v_p.min_stock, 'pcs')
        RETURNING id INTO v_pid;

        -- first receipt, 27..18 days ago, one product a day
        PERFORM public.apply_stock_movement(v_uid, v_pid, v_p.location, 'INBOUND', v_p.receipt,
                                            'Opening stock', v_now - ((28 - v_p.k) || ' days')::interval);

        -- five small shipments over the following days; never more than a quarter of the receipt in total
        v_out := greatest(1, v_p.receipt / 25);
        FOR v_j IN 1..5 LOOP
            PERFORM public.apply_stock_movement(v_uid, v_pid, v_p.location, 'OUTBOUND', v_out,
                                                'Customer order', v_now - ((22 - v_j * 4 - (v_p.k % 3)) || ' days')::interval);
        END LOOP;

        -- a restock for the busiest items
        IF v_p.k IN (2, 6, 8) THEN
            PERFORM public.apply_stock_movement(v_uid, v_pid, v_p.location, 'INBOUND', 30,
                                                'Restock from supplier', v_now - ((9 - v_p.k % 3) || ' days')::interval);
        END IF;
    END LOOP;

    -- one stock count that found fewer than the system said (the history shows it as an adjustment)
    SELECT i.quantity INTO v_current
    FROM public.inventory i JOIN public.products p ON p.id = i.product_id
    WHERE p.owner_id = v_uid AND p.sku = 'DEMO-009';
    PERFORM public.apply_stock_movement(v_uid, (SELECT id FROM public.products WHERE owner_id = v_uid AND sku = 'DEMO-009'),
                                        'Zone A-01', 'ADJUST', greatest(0, v_current - 3),
                                        'Cycle count: 3 vests missing', v_now - interval '2 days');

    -- the chicken was all sold or spoiled: counted at zero, so the demo has an out-of-stock product
    PERFORM public.apply_stock_movement(v_uid, (SELECT id FROM public.products WHERE owner_id = v_uid AND sku = 'DEMO-010'),
                                        'Cold Storage C-01', 'ADJUST', 0,
                                        'Spoiled: written off', v_now - interval '1 day');

    RETURN jsonb_build_object(
        'id', v_user.id,
        'email', v_user.email,
        'first_name', v_user.first_name,
        'last_name', v_user.last_name,
        'role', v_user.role,
        'image_url', v_user.image_url,
        'is_active', v_user.is_active,
        'token_version', v_user.token_version,
        'demo_expires_at', v_user.demo_expires_at
    );
END
$$;

REVOKE ALL ON FUNCTION public.purge_expired_demo_accounts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_demo_accounts() TO service_role;
REVOKE ALL ON FUNCTION public.create_demo_account(text, integer, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_demo_account(text, integer, interval) TO service_role;
