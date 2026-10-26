-- Soft delete for products.
--
-- Deleting a product used to delete its whole transaction history (ON DELETE CASCADE). Now a
-- delete only marks the product (deleted_at) and takes its stock to zero through ADJUST
-- movements, so the history and the ledger stay intact and the shelf capacity is freed.
--
--   * The product keeps its name/category/prices, so old transactions still show what it was.
--   * Its SKU is renamed to "<sku>-deleted<id>", so the SKU can be reused while the
--     (owner_id, sku) unique constraint stays exactly as it was.
--   * Its stock rows are removed after being zeroed; nothing else references them.
--   * apply_stock_movement treats a deleted product as not found (re-created below with that
--     two changes: the product lookup, and the capacity check now applies only when stock increases;
--     everything else is identical to 0008).
--
-- Called only by the server with the service-role key; p_user_id comes from the session.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

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
    v_tx        public.transactions%ROWTYPE;
BEGIN
    IF p_type IS NULL OR p_type NOT IN ('INBOUND', 'OUTBOUND', 'ADJUST') THEN
        RAISE EXCEPTION 'type must be INBOUND, OUTBOUND or ADJUST' USING ERRCODE = 'PT400';
    END IF;
    -- ADJUST sets the quantity, so 0 is a valid target (empty the shelf); the others move a positive amount.
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

    -- 1. The product must belong to the caller.
    --    A deleted product is treated as missing. FOR SHARE makes a movement wait for a delete in
    --    progress (and the delete wait for movements in flight), so no stock can appear after it.
    SELECT * INTO v_product
    FROM public.products
    WHERE id = p_product_id AND owner_id = p_user_id AND deleted_at IS NULL
    FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product with ID % not found or access denied', p_product_id USING ERRCODE = 'PT404';
    END IF;

    -- 2. The location must belong to the caller. Locking its row serialises every movement at
    --    this location: the capacity rule spans all products there, so two movements must not
    --    both read the old total. Every movement takes this lock first, so they cannot deadlock.
    SELECT * INTO v_location
    FROM public.locations
    WHERE owner_id = p_user_id AND name = p_location
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Location ''%'' not found. Please create it first.', p_location USING ERRCODE = 'PT400';
    END IF;

    -- 3. Current stock of this product here (locked, so nothing else can change it meanwhile).
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
        v_new := p_quantity; -- ADJUST sets the quantity
    END IF;

    -- 4. Capacity: only movements that add stock (an ADJUST that lowers stock is always allowed,
    --    even in a location that is already over capacity, e.g. after its capacity was reduced).
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

    IF v_has_inv THEN
        UPDATE public.inventory SET quantity = v_new, status = v_status WHERE id = v_inv.id
        RETURNING * INTO v_inv;
    ELSE
        INSERT INTO public.inventory (product_id, location, quantity, status)
        VALUES (p_product_id, p_location, v_new, v_status)
        RETURNING * INTO v_inv;
    END IF;

    INSERT INTO public.transactions (ref_code, type, quantity, unit_price, total_price, status,
                                     location, notes, user_id, product_id, created_at)
    VALUES (v_ref, p_type::public.transactiontype, p_quantity, v_price, v_price * p_quantity,
            'COMPLETED', p_location, p_notes, p_user_id, p_product_id, COALESCE(p_created_at, now()))
    RETURNING * INTO v_tx;

    RETURN jsonb_build_object('transaction', to_jsonb(v_tx), 'inventory', to_jsonb(v_inv));
END;
$$;


CREATE OR REPLACE FUNCTION public.delete_product(p_user_id integer, p_product_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_product public.products%ROWTYPE;
    v_inv     record;
BEGIN
    -- Same lock order as a stock movement: the product first.
    SELECT * INTO v_product
    FROM public.products
    WHERE id = p_product_id AND owner_id = p_user_id AND deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product with ID % not found or access denied', p_product_id USING ERRCODE = 'PT404';
    END IF;

    -- Take every shelf to zero through the normal movement path, so the history explains it.
    FOR v_inv IN
        SELECT location FROM public.inventory
        WHERE product_id = p_product_id AND quantity > 0
        ORDER BY location
    LOOP
        PERFORM public.apply_stock_movement(p_user_id, p_product_id, v_inv.location, 'ADJUST', 0,
                                            'Product deleted', NULL, NULL);
    END LOOP;
    DELETE FROM public.inventory WHERE product_id = p_product_id;

    UPDATE public.products
    SET deleted_at = now(),
        sku = left(sku, 100 - length('-deleted' || id::text)) || '-deleted' || id::text
    WHERE id = p_product_id
    RETURNING * INTO v_product;

    RETURN jsonb_build_object('id', v_product.id, 'deleted_at', v_product.deleted_at);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_stock_movement(integer, integer, text, text, integer, text, timestamptz, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stock_movement(integer, integer, text, text, integer, text, timestamptz, text)
    TO service_role;
REVOKE ALL ON FUNCTION public.delete_product(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_product(integer, integer) TO service_role;
