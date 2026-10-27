-- Manual rollback of migration 0014_reviewer_demo.sql. NOT a migration: run by hand only if needed.
-- Deploy the previous application version first: POST /api/auth/demo calls create_demo_account and answers
-- 503 without it. This deletes any demo accounts with their data, removes the two functions, then the column.

DO $$
DECLARE v_ids integer[];
BEGIN
    SELECT COALESCE(array_agg(id), ARRAY[]::integer[]) INTO v_ids FROM public.users WHERE demo_expires_at IS NOT NULL;
    DELETE FROM public.transactions WHERE user_id = ANY (v_ids);
    DELETE FROM public.products     WHERE owner_id = ANY (v_ids);
    DELETE FROM public.locations    WHERE owner_id = ANY (v_ids);
    DELETE FROM public.categories   WHERE owner_id = ANY (v_ids);
    DELETE FROM public.users        WHERE id = ANY (v_ids);
END $$;

DROP FUNCTION IF EXISTS public.create_demo_account(text, integer, interval);
DROP FUNCTION IF EXISTS public.purge_expired_demo_accounts();
DROP INDEX IF EXISTS public.ix_users_demo_expires;
ALTER TABLE public.users DROP COLUMN IF EXISTS demo_expires_at;
