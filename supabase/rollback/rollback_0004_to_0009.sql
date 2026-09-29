-- Manual rollback of migrations 0004-0009. NOT a migration: run by hand only if needed.
-- Everything here removes objects the migrations added; no application data is touched
-- except rate_limits (counters only) and the token_version column (session revocation counters).
-- Deploy the previous application version first, otherwise the new code will answer 503 for stock changes.

BEGIN;

-- 0009
DROP FUNCTION IF EXISTS public.update_location(integer, integer, jsonb);

-- 0008
DROP FUNCTION IF EXISTS public.approve_reorder(integer, integer, text, integer, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.apply_stock_movement(integer, integer, text, text, integer, text, timestamptz, text);

-- 0007
DROP FUNCTION IF EXISTS public.rate_limit_hit(text, integer, integer);
DROP TABLE IF EXISTS public.rate_limits;

-- 0006
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS uq_products_owner_sku;

-- 0005
ALTER TABLE public.locations  DROP CONSTRAINT IF EXISTS uq_locations_owner_name;
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS uq_categories_owner_name;

-- 0004
ALTER TABLE public.users DROP COLUMN IF EXISTS token_version;

COMMIT;
