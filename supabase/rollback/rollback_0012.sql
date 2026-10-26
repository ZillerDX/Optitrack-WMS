-- Manual rollback of migration 0012_server_fixes.sql. NOT a migration: run by hand only if needed.
-- Deploy the previous application version first (the new code calls delete_location and expects signed
-- ADJUST rows), then:
--   1. re-run 0010_soft_delete_products.sql (CREATE OR REPLACE puts back the old apply_stock_movement and
--      delete_product, which do not write stock_after),
--   2. run this file.
-- Data changes: ADJUST rows written since 0012 go back to the old meaning (quantity = the level after the
-- adjustment). Restoring the global uniqueness FAILS if two tenants already share a PO number or reference
-- code; fix those rows first (rename one) and run it again.

BEGIN;

UPDATE public.transactions
SET quantity = stock_after, total_price = unit_price * stock_after
WHERE type = 'ADJUST' AND stock_after IS NOT NULL;

DROP FUNCTION IF EXISTS public.delete_location(integer, integer);
ALTER TABLE public.transactions DROP COLUMN IF EXISTS stock_after;

DROP INDEX IF EXISTS public.uq_transactions_user_ref_code;
DROP INDEX IF EXISTS public.ix_transactions_ref_code;
CREATE UNIQUE INDEX IF NOT EXISTS ix_transactions_ref_code ON public.transactions (ref_code);

DROP INDEX IF EXISTS public.uq_purchase_orders_user_po_number;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_po_number_key UNIQUE (po_number);

COMMIT;
