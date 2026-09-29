-- Update a location in ONE transaction, including a rename.
--
-- Inventory and transactions reference a location by NAME, so renaming a location used to
-- leave its stock and history pointing at a name that no longer exists (the stock became
-- invisible and could not be moved). This function renames the location and the rows that
-- reference it together; if anything fails, nothing changes.
--
-- p_patch holds only the fields to change: name (1-50 chars), capacity (integer >= 0),
-- description (text <= 255 or null). Called only by the server with the service-role key
-- (p_user_id comes from the session). Errors use PT4xx like 0008; a name that is already
-- taken is a unique violation and surfaces as HTTP 409.

CREATE OR REPLACE FUNCTION public.update_location(
    p_user_id     integer,
    p_location_id integer,
    p_patch       jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_loc      public.locations%ROWTYPE;
    v_old_name text;
    v_name     text;
    v_capacity integer;
    v_desc     text;
BEGIN
    IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb THEN
        RAISE EXCEPTION 'No editable fields provided' USING ERRCODE = 'PT422';
    END IF;

    -- Lock the location first, the same order stock movements use, so a rename and a
    -- movement at this location cannot interleave.
    SELECT * INTO v_loc FROM public.locations
    WHERE id = p_location_id AND owner_id = p_user_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Location not found' USING ERRCODE = 'PT404';
    END IF;

    v_old_name := v_loc.name;
    v_name := v_loc.name;
    v_capacity := v_loc.capacity;
    v_desc := v_loc.description;

    IF p_patch ? 'name' THEN
        IF jsonb_typeof(p_patch -> 'name') <> 'string' OR length(btrim(p_patch ->> 'name')) = 0
           OR length(btrim(p_patch ->> 'name')) > 50 THEN
            RAISE EXCEPTION 'name must be 1-50 characters' USING ERRCODE = 'PT422';
        END IF;
        v_name := btrim(p_patch ->> 'name');
    END IF;
    IF p_patch ? 'capacity' THEN
        IF jsonb_typeof(p_patch -> 'capacity') <> 'number' OR (p_patch ->> 'capacity') !~ '^[0-9]{1,9}$' THEN
            RAISE EXCEPTION 'capacity must be a non-negative integer' USING ERRCODE = 'PT422';
        END IF;
        v_capacity := (p_patch ->> 'capacity')::integer;
    END IF;
    IF p_patch ? 'description' THEN
        IF jsonb_typeof(p_patch -> 'description') = 'null' THEN
            v_desc := NULL;
        ELSIF jsonb_typeof(p_patch -> 'description') = 'string' AND length(p_patch ->> 'description') <= 255 THEN
            v_desc := NULLIF(btrim(p_patch ->> 'description'), '');
        ELSE
            RAISE EXCEPTION 'description must be at most 255 characters' USING ERRCODE = 'PT422';
        END IF;
    END IF;

    UPDATE public.locations
    SET name = v_name, capacity = v_capacity, description = v_desc
    WHERE id = v_loc.id
    RETURNING * INTO v_loc;

    IF v_name <> v_old_name THEN
        UPDATE public.inventory i
        SET location = v_name
        FROM public.products p
        WHERE i.product_id = p.id AND p.owner_id = p_user_id AND i.location = v_old_name;

        UPDATE public.transactions t
        SET location = v_name
        FROM public.products p
        WHERE t.product_id = p.id AND p.owner_id = p_user_id AND t.location = v_old_name;
    END IF;

    RETURN to_jsonb(v_loc);
END;
$$;

REVOKE ALL ON FUNCTION public.update_location(integer, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_location(integer, integer, jsonb) TO service_role;
