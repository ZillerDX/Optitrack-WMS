-- Manual rollback of migration 0013_dashboard_summary.sql. NOT a migration: run by hand only if needed.
-- It only removes the function. Deploy the previous application version first: GET /api/dashboard/summary
-- and GET /api/dashboard/metrics call it and answer 503 without it.

DROP FUNCTION IF EXISTS public.dashboard_summary(integer, text, integer, text);
