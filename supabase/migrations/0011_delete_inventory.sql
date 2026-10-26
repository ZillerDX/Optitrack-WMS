-- Delete a stock row without losing the record of the stock that was on it.
--
-- DELETE /api/inventory/{id} used to remove the row directly, so units disappeared with no
-- transaction to explain them. delete_inventory runs in ONE transaction: it takes the same locks
-- as a stock movement (product, then location, then the stock row), and if the row still holds
-- stock it first records an ADJUST to 0 through apply_stock_movement, then removes the row. The
-- quantity is read only after the locks are held, so a movement that lands at the same moment is
-- either counted in the adjustment or waits for the delete; it can never be deleted unrecorded.
--
-- Called only by the server with the service-role key; p_user_id comes from the session. Errors use
-- PT4xx like 0008.

CREATE OR REPLACE FUNCTION public.delete_inventory(p_user_id integer, p_inventory_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row      public.inventory%ROWTYPE;
    v_quantity integer;
BEGIN
    -- Which product and location? (not locked yet; re-checked below once the locks are held)
    SELECT i.* INTO v_row
    FROM public.inventory i
    JOIN public.products p ON p.id = i.product_id
    WHERE i.id = p_inventory_id AND p.owner_id = p_user_id AND p.deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory record not found' USING ERRCODE = 'PT404';
    END IF;

    -- Same lock order as apply_stock_movement: product, location, stock row.
    PERFORM 1 FROM public.products
    WHERE id = v_row.product_id AND owner_id = p_user_id AND deleted_at IS NULL
    FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory record not found' USING ERRCODE = 'PT404';
    END IF;
    PERFORM 1 FROM public.locations WHERE owner_id = p_user_id AND name = v_row.location FOR UPDATE;

    SELECT quantity INTO v_quantity FROM public.inventory WHERE id = p_inventory_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory record not found' USING ERRCODE = 'PT404';  -- deleted while we waited
    END IF;

    IF v_quantity > 0 THEN
        PERFORM public.apply_stock_movement(p_user_id, v_row.product_id, v_row.location, 'ADJUST', 0,
                                            'Inventory record deleted', NULL, NULL);
    END IF;
    DELETE FROM public.inventory WHERE id = p_inventory_id;

    RETURN jsonb_build_object('id', p_inventory_id, 'product_id', v_row.product_id,
                              'location', v_row.location, 'removed_quantity', v_quantity);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_inventory(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_inventory(integer, integer) TO service_role;
