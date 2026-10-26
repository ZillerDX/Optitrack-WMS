-- ============================================================
-- Supabase Security Patch: Enable Row Level Security (RLS)
-- Project: optitrack-wms-db (hdvalaxaujjyqcejhyqb)
-- Resolves Supabase Alert: rls_disabled_in_public
-- ============================================================

-- 1. Enable RLS on all tables in public schema
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.purchase_orders ENABLE ROW LEVEL SECURITY;

-- 2. Drop any existing insecure public policies if any exist
DROP POLICY IF EXISTS "Allow anon all" ON public.users;
DROP POLICY IF EXISTS "Allow anon all" ON public.products;
DROP POLICY IF EXISTS "Allow anon all" ON public.inventory;
DROP POLICY IF EXISTS "Allow anon all" ON public.transactions;
DROP POLICY IF EXISTS "Allow anon all" ON public.locations;
DROP POLICY IF EXISTS "Allow anon all" ON public.categories;
DROP POLICY IF EXISTS "Allow anon all" ON public.purchase_orders;

-- 3. Explicitly deny all direct operations from the public anon role
-- All valid application requests must pass through the Next.js API server
-- using the secret SUPABASE_SERVICE_ROLE_KEY (which bypasses RLS safely).
REVOKE ALL ON TABLE public.users FROM anon;
REVOKE ALL ON TABLE public.products FROM anon;
REVOKE ALL ON TABLE public.inventory FROM anon;
REVOKE ALL ON TABLE public.transactions FROM anon;
REVOKE ALL ON TABLE public.locations FROM anon;
REVOKE ALL ON TABLE public.categories FROM anon;
REVOKE ALL ON TABLE public.purchase_orders FROM anon;

-- Note: The `service_role` role used by your Next.js backend retains full access automatically.
