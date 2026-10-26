-- Single-role system: every account is an ADMIN of its own tenant.
-- Normalise legacy rows so the application's one-value UserRole enum can load them.
UPDATE public.users SET role = 'ADMIN' WHERE role <> 'ADMIN';
