-- Dashboard figures computed in the database (PLAN.md M2, S8b).
--
-- The dashboard added up rows in the browser. The lists it read were cut at 1000 rows without a sign,
-- so totals were wrong for a bigger warehouse, and ADJUST rows (which used to hold a target level) were
-- counted as movement and value. This function computes everything over ALL rows of the caller, in one
-- query, and returns one JSON document:
--
--   totals        units, cost basis, market value, number of products (in the chosen scope)
--   stock_status  products out of stock / below their minimum / healthy (below = stock < minimum, the
--                 same rule as the stock status and the AI endpoints)
--   locations     used vs capacity per location (pct is null when the capacity is 0)
--   movement      one entry per local day of the window, zero days included: INBOUND and OUTBOUND units
--                 and value. ADJUST is NOT counted here
--   adjustments   ADJUST rows of the window: how many, the net change (0012 rows only; older rows, with
--                 stock_after IS NULL, hold a target level, are counted as `legacy`, not summed)
--   by_category   units, market value and cost basis per category
--   top_movers    the five products with the most OUTBOUND units in the window
--
-- p_location NULL or 'ALL' means every location. p_days is 1-366 and p_tz an IANA time zone name
-- (days are cut in that zone). Called only by the server with the service-role key; p_user_id comes
-- from the session. Errors use PT4xx like 0008.

CREATE OR REPLACE FUNCTION public.dashboard_summary(
    p_user_id  integer,
    p_location text    DEFAULT NULL,
    p_days     integer DEFAULT 30,
    p_tz       text    DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_loc     text := NULLIF(NULLIF(btrim(p_location), ''), 'ALL');
    v_today   date;
    v_from    date;
    v_from_ts timestamptz;
    v_to_ts   timestamptz;
BEGIN
    IF p_days IS NULL OR p_days < 1 OR p_days > 366 THEN
        RAISE EXCEPTION 'days must be from 1 to 366' USING ERRCODE = 'PT400';
    END IF;
    IF p_tz IS NULL OR btrim(p_tz) = '' THEN
        RAISE EXCEPTION 'unknown time zone' USING ERRCODE = 'PT400';
    END IF;
    BEGIN
        v_today := (now() AT TIME ZONE p_tz)::date;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'unknown time zone' USING ERRCODE = 'PT400';
    END;
    IF v_loc IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.locations WHERE owner_id = p_user_id AND name = v_loc) THEN
        RAISE EXCEPTION 'Location not found' USING ERRCODE = 'PT404';
    END IF;

    v_from    := v_today - (p_days - 1);
    v_from_ts := v_from::timestamp AT TIME ZONE p_tz;            -- start of the first local day
    v_to_ts   := (v_today + 1)::timestamp AT TIME ZONE p_tz;     -- start of tomorrow, local

    RETURN (
        WITH
        stock AS (          -- every product of the caller with its stock in the chosen scope
            SELECT p.id AS product_id, p.sku, p.name, COALESCE(p.category, 'General') AS category,
                   p.cost_price, p.sell_price, p.min_stock_level,
                   COALESCE(SUM(i.quantity), 0)::bigint AS qty,
                   count(i.id) AS stock_rows
            FROM public.products p
            LEFT JOIN public.inventory i ON i.product_id = p.id AND (v_loc IS NULL OR i.location = v_loc)
            WHERE p.owner_id = p_user_id AND p.deleted_at IS NULL
            GROUP BY p.id
        ),
        scoped AS (         -- for one location: only the products that have a stock row there
            SELECT * FROM stock WHERE v_loc IS NULL OR stock_rows > 0
        ),
        totals AS (
            SELECT COALESCE(SUM(qty), 0)::bigint AS units,
                   COALESCE(SUM(qty * cost_price), 0) AS cost_basis,
                   COALESCE(SUM(qty * sell_price), 0) AS market_value,
                   count(*) AS products,
                   count(*) FILTER (WHERE qty > 0) AS products_with_stock
            FROM scoped
        ),
        status AS (
            SELECT count(*) FILTER (WHERE qty <= 0) AS out_of_stock,
                   count(*) FILTER (WHERE qty > 0 AND qty < min_stock_level) AS low_stock,
                   count(*) FILTER (WHERE qty > 0 AND qty >= min_stock_level) AS healthy
            FROM scoped
        ),
        used AS (
            SELECT i.location, SUM(i.quantity)::bigint AS units
            FROM public.inventory i
            JOIN public.products p ON p.id = i.product_id AND p.owner_id = p_user_id AND p.deleted_at IS NULL
            GROUP BY i.location
        ),
        locs AS (
            SELECT l.name, l.capacity, COALESCE(u.units, 0) AS used
            FROM public.locations l
            LEFT JOIN used u ON u.location = l.name
            WHERE l.owner_id = p_user_id AND (v_loc IS NULL OR l.name = v_loc)
        ),
        cats AS (
            SELECT category, SUM(qty)::bigint AS units, SUM(qty * sell_price) AS market_value, SUM(qty * cost_price) AS cost_basis
            FROM scoped WHERE qty > 0
            GROUP BY category
        ),
        days AS (
            SELECT d::date AS day FROM generate_series(v_from::timestamp, v_today::timestamp, interval '1 day') d
        ),
        tx AS (
            SELECT (t.created_at AT TIME ZONE p_tz)::date AS day, t.type, t.quantity, t.total_price, t.stock_after, t.product_id
            FROM public.transactions t
            WHERE t.user_id = p_user_id
              AND t.created_at >= v_from_ts AND t.created_at < v_to_ts
              AND (v_loc IS NULL OR t.location = v_loc)
        ),
        series AS (
            SELECT d.day,
                   COALESCE(SUM(tx.quantity)    FILTER (WHERE tx.type = 'INBOUND'), 0)::bigint  AS inbound_units,
                   COALESCE(SUM(tx.quantity)    FILTER (WHERE tx.type = 'OUTBOUND'), 0)::bigint AS outbound_units,
                   COALESCE(SUM(tx.total_price) FILTER (WHERE tx.type = 'INBOUND'), 0)          AS inbound_value,
                   COALESCE(SUM(tx.total_price) FILTER (WHERE tx.type = 'OUTBOUND'), 0)         AS outbound_value
            FROM days d LEFT JOIN tx ON tx.day = d.day
            GROUP BY d.day
        ),
        adj AS (
            SELECT count(*) FILTER (WHERE type = 'ADJUST' AND stock_after IS NOT NULL) AS count,
                   COALESCE(SUM(quantity) FILTER (WHERE type = 'ADJUST' AND stock_after IS NOT NULL), 0)::bigint AS net_units,
                   count(*) FILTER (WHERE type = 'ADJUST' AND stock_after IS NULL) AS legacy
            FROM tx
        ),
        movers AS (
            SELECT p.id AS product_id, p.sku, p.name, SUM(tx.quantity)::bigint AS units
            FROM tx JOIN public.products p ON p.id = tx.product_id
            WHERE tx.type = 'OUTBOUND'
            GROUP BY p.id
            ORDER BY SUM(tx.quantity) DESC, p.id
            LIMIT 5
        )
        SELECT jsonb_build_object(
            'generated_at', now(),
            'window', jsonb_build_object('days', p_days, 'tz', p_tz, 'from', v_from, 'to', v_today),
            'location', v_loc,
            'totals', (SELECT to_jsonb(totals) FROM totals),
            'stock_status', (SELECT to_jsonb(status) FROM status),
            'locations', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'name', name, 'capacity', capacity, 'used', used,
                    'pct', CASE WHEN capacity > 0 THEN LEAST(100, round(used * 100.0 / capacity)) END,
                    'over', used > capacity) ORDER BY name)
                FROM locs), '[]'::jsonb),
            'movement', COALESCE((SELECT jsonb_agg(to_jsonb(series) ORDER BY day) FROM series), '[]'::jsonb),
            'adjustments', (SELECT to_jsonb(adj) FROM adj),
            'by_category', COALESCE((SELECT jsonb_agg(to_jsonb(cats) ORDER BY market_value DESC, category) FROM cats), '[]'::jsonb),
            'top_movers', COALESCE((SELECT jsonb_agg(to_jsonb(movers) ORDER BY units DESC, product_id) FROM movers), '[]'::jsonb)
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_summary(integer, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_summary(integer, text, integer, text) TO service_role;
