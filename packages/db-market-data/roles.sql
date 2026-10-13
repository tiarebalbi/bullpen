-- Run once, as the database admin role, after creating the role market_data_owner in the
-- provider's console. It holds no password: the console generates it.
-- A role created in some consoles also joins neon_superuser, which can read
-- and write every schema. The runtime role must not, so it is revoked here.
GRANT market_data_owner TO CURRENT_USER;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neon_superuser') THEN
    REVOKE neon_superuser FROM market_data_owner;
  END IF;
END
$$;
