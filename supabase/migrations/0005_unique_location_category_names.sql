-- Enforce one location / category name per owner.
--
-- Until now uniqueness was only checked in application code, which loses races
-- (e.g. two first-load requests both auto-seeding the default zones/categories).
--
-- DATA CHANGE: existing duplicates are merged before the constraint is added.
--   * locations: the row with the lowest id is kept and takes the largest
--     capacity of its duplicates. Inventory and transactions reference a location
--     by name, so nothing that points at it is lost.
--   * categories: the row with the lowest id is kept (products reference the
--     category by name too).
-- Review with the SELECTs below before running this on production data.
--
--   SELECT owner_id, name, count(*) FROM public.locations  GROUP BY 1, 2 HAVING count(*) > 1;
--   SELECT owner_id, name, count(*) FROM public.categories GROUP BY 1, 2 HAVING count(*) > 1;

BEGIN;

UPDATE public.locations l
SET capacity = m.max_capacity
FROM (
    SELECT min(id) AS keep_id, max(capacity) AS max_capacity
    FROM public.locations
    GROUP BY owner_id, name
    HAVING count(*) > 1
) m
WHERE l.id = m.keep_id;

DELETE FROM public.locations
WHERE id NOT IN (SELECT min(id) FROM public.locations GROUP BY owner_id, name);

DELETE FROM public.categories
WHERE id NOT IN (SELECT min(id) FROM public.categories GROUP BY owner_id, name);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_locations_owner_name') THEN
        ALTER TABLE public.locations
            ADD CONSTRAINT uq_locations_owner_name UNIQUE (owner_id, name);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_categories_owner_name') THEN
        ALTER TABLE public.categories
            ADD CONSTRAINT uq_categories_owner_name UNIQUE (owner_id, name);
    END IF;
END
$$;

COMMIT;
