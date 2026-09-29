-- Shared fixed-window rate limiter for the Next.js API (serverless instances share no memory).
-- Called only by the server with the service-role key via POST /rest/v1/rpc/rate_limit_hit.

CREATE TABLE IF NOT EXISTS public.rate_limits (
    key          text PRIMARY KEY,
    count        integer     NOT NULL,
    window_start timestamptz NOT NULL
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limits FROM anon, authenticated;

-- Atomically count one hit. Returns whether it is allowed and, if not, how many
-- seconds until the window resets.
CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_key text, p_window_seconds integer, p_max integer)
RETURNS TABLE (allowed boolean, retry_after integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
    v_start timestamptz;
BEGIN
    INSERT INTO public.rate_limits AS r (key, count, window_start)
    VALUES (p_key, 1, now())
    ON CONFLICT (key) DO UPDATE
        SET count = CASE
                WHEN r.window_start <= now() - make_interval(secs => p_window_seconds) THEN 1
                ELSE r.count + 1
            END,
            window_start = CASE
                WHEN r.window_start <= now() - make_interval(secs => p_window_seconds) THEN now()
                ELSE r.window_start
            END
    RETURNING r.count, r.window_start INTO v_count, v_start;

    -- Opportunistic cleanup (about 1% of calls) so the table stays small.
    IF random() < 0.01 THEN
        DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 day';
    END IF;

    allowed := v_count <= p_max;
    retry_after := CASE
        WHEN allowed THEN 0
        ELSE GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_start + make_interval(secs => p_window_seconds) - now())))::integer)
    END;
    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, integer, integer) TO service_role;
