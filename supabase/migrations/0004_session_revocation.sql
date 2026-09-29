-- Session revocation: bump users.token_version to invalidate every issued token
-- (password reset and logout do this). Tokens issued before this column existed
-- carry no version and are treated as version 0, so existing sessions keep working
-- until the first bump.
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;
