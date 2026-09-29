-- One SKU per owner.
--
-- Products cannot be merged automatically: each may already have inventory and
-- transaction history attached. So duplicates are NOT deleted. Every duplicate
-- after the first (lowest id) is renamed to "<sku>-dup<id>" (truncated to fit
-- varchar(100)) and keeps all of its stock and history, then the constraint is added.
-- Afterwards review the renamed rows and merge or rename them by hand:
--
--   SELECT id, owner_id, sku, name FROM public.products WHERE sku ~ '-dup[0-9]+$';
--
-- Preview before running:
--
--   SELECT owner_id, sku, count(*) FROM public.products GROUP BY 1, 2 HAVING count(*) > 1;

BEGIN;

UPDATE public.products p
SET sku = left(p.sku, 100 - length('-dup' || p.id::text)) || '-dup' || p.id::text
WHERE p.id NOT IN (SELECT min(id) FROM public.products GROUP BY owner_id, sku);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_products_owner_sku') THEN
        ALTER TABLE public.products
            ADD CONSTRAINT uq_products_owner_sku UNIQUE (owner_id, sku);
    END IF;
END
$$;

COMMIT;
