-- Rollback of 0015: the 6-character suffix again (the function as 0012 defines it).

CREATE OR REPLACE FUNCTION public.apply_stock_movement(
    p_user_id    integer,
    p_product_id integer,
    p_location   text,
    p_type       text,
    p_quantity   integer,
    p_notes      text        DEFAULT NULL,
    p_created_at timestamptz DEFAULT NULL,
    p_ref_code   text        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_product   public.products%ROWTYPE;
    v_location  public.locations%ROWTYPE;
    v_inv       public.inventory%ROWTYPE;
    v_has_inv   boolean;
    v_current   integer;
    v_new       integer;
    v_total     bigint;
    v_price     numeric(10, 2);
    v_status    public.inventorystatus;
    v_ref       text;
    v_stored    integer;
    v_tx        public.transactions%ROWTYPE;
BEGIN
    IF p_type IS NULL OR p_type NOT IN ('INBOUND', 'OUTBOUND', 'ADJUST') THEN
        RAISE EXCEPTION 'type must be INBOUND, OUTBOUND or ADJUST' USING ERRCODE = 'PT400';
    END IF;
    -- For ADJUST p_quantity is the TARGET level (0 empties the shelf); the others move a positive amount.
    IF p_quantity IS NULL OR p_quantity < 0 OR (p_quantity = 0 AND p_type <> 'ADJUST') THEN
        RAISE EXCEPTION 'quantity must be a positive integer' USING ERRCODE = 'PT400';
    END IF;
    IF p_location IS NULL OR length(btrim(p_location)) = 0 OR length(p_location) > 50 THEN
        RAISE EXCEPTION 'location is required (max 50 characters)' USING ERRCODE = 'PT400';
    END IF;
    IF p_notes IS NOT NULL AND length(p_notes) > 500 THEN
        RAISE EXCEPTION 'notes must be at most 500 characters' USING ERRCODE = 'PT400';
    END IF;
    IF p_ref_code IS NOT NULL AND (length(btrim(p_ref_code)) = 0 OR length(p_ref_code) > 100) THEN
        RAISE EXCEPTION 'reference code must be 1-100 characters' USING ERRCODE = 'PT400';
    END IF;

    -- 1. The product must belong to the caller and not be deleted. FOR SHARE makes a movement wait
    --    for a delete in progress (and the delete wait for movements in flight).
    SELECT * INTO v_product
    FROM public.products
    WHERE id = p_product_id AND owner_id = p_user_id AND deleted_at IS NULL
    FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product with ID % not found or access denied', p_product_id USING ERRCODE = 'PT404';
    END IF;

    -- 2. The location must belong to the caller. Locking its row serialises every movement at this
    --    location (the capacity rule spans all products there). Every movement takes this lock first.
    SELECT * INTO v_location
    FROM public.locations
    WHERE owner_id = p_user_id AND name = p_location
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Location ''%'' not found. Please create it first.', p_location USING ERRCODE = 'PT400';
    END IF;

    -- 3. Current stock of this product here (locked).
    SELECT * INTO v_inv
    FROM public.inventory
    WHERE product_id = p_product_id AND location = p_location
    FOR UPDATE;
    v_has_inv := FOUND;
    v_current := CASE WHEN v_has_inv THEN v_inv.quantity ELSE 0 END;

    IF p_type = 'INBOUND' THEN
        v_new := v_current + p_quantity;
    ELSIF p_type = 'OUTBOUND' THEN
        IF NOT v_has_inv THEN
            RAISE EXCEPTION 'No inventory found at location ''%'' for this product', p_location USING ERRCODE = 'PT400';
        END IF;
        IF v_current < p_quantity THEN
            RAISE EXCEPTION 'Insufficient stock. Available: %, Requested: %', v_current, p_quantity USING ERRCODE = 'PT400';
        END IF;
        v_new := v_current - p_quantity;
    ELSE
        v_new := p_quantity; -- ADJUST sets the level
    END IF;

    -- 4. Capacity: only movements that add stock (lowering stock is always allowed, even in a location
    --    that is already over capacity).
    IF v_new > v_current THEN
        SELECT COALESCE(SUM(i.quantity), 0) INTO v_total
        FROM public.inventory i
        JOIN public.products p ON p.id = i.product_id
        WHERE i.location = p_location AND p.owner_id = p_user_id;

        IF v_total - v_current + v_new > v_location.capacity THEN
            RAISE EXCEPTION 'Location ''%'' capacity exceeded. Capacity: %, Current stock: %, Projected stock: %',
                p_location, v_location.capacity, v_total, v_total - v_current + v_new USING ERRCODE = 'PT400';
        END IF;
    END IF;

    -- 5. Write. Price comes from the product, never from the caller.
    v_status := CASE
        WHEN v_new = 0 THEN 'OUT_OF_STOCK'
        WHEN v_new < v_product.min_stock_level THEN 'LOW_STOCK'
        ELSE 'IN_STOCK'
    END;
    v_price := CASE WHEN p_type = 'OUTBOUND' THEN v_product.sell_price ELSE v_product.cost_price END;
    v_ref := COALESCE(
        p_ref_code,
        'TXN-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6))
    );
    -- What the history stores: the amount moved; for ADJUST the signed change (new level - old level).
    v_stored := CASE WHEN p_type = 'ADJUST' THEN v_new - v_current ELSE p_quantity END;

    IF v_has_inv THEN
        UPDATE public.inventory SET quantity = v_new, status = v_status WHERE id = v_inv.id
        RETURNING * INTO v_inv;
    ELSE
        INSERT INTO public.inventory (product_id, location, quantity, status)
        VALUES (p_product_id, p_location, v_new, v_status)
        RETURNING * INTO v_inv;
    END IF;

    INSERT INTO public.transactions (ref_code, type, quantity, unit_price, total_price, status,
                                     location, notes, user_id, product_id, created_at, stock_after)
    VALUES (v_ref, p_type::public.transactiontype, v_stored, v_price, v_price * abs(v_stored),
            'COMPLETED', p_location, p_notes, p_user_id, p_product_id, COALESCE(p_created_at, now()), v_new)
    RETURNING * INTO v_tx;

    RETURN jsonb_build_object('transaction', to_jsonb(v_tx), 'inventory', to_jsonb(v_inv));
END;
$$;

REVOKE ALL ON FUNCTION public.apply_stock_movement(integer, integer, text, text, integer, text, timestamptz, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stock_movement(integer, integer, text, text, integer, text, timestamptz, text)
    TO service_role;
