-- run-as: migrator
-- The schema and its owner. Idempotent; assumes handles_owner exists (roles.sql).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'handles_owner') THEN
    RAISE EXCEPTION 'role handles_owner does not exist: create it first, then run roles.sql as the admin role';
  END IF;
  IF NOT pg_has_role(current_user, 'handles_owner', 'MEMBER') THEN
    RAISE EXCEPTION 'the migrator is not a member of handles_owner: run roles.sql as the admin role';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'handles_owner' AND (rolsuper OR rolbypassrls))
     OR EXISTS (
       SELECT 1 FROM pg_auth_members m
       JOIN pg_roles granted ON granted.oid = m.roleid
       JOIN pg_roles member ON member.oid = m.member
       WHERE member.rolname = 'handles_owner'
         AND granted.rolname IN ('neon_superuser', 'pg_read_all_data', 'pg_write_all_data')
     ) THEN
    RAISE EXCEPTION 'role handles_owner can read or write every schema (superuser, bypassrls, neon_superuser or pg_*_all_data): run roles.sql to revoke it';
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS handles AUTHORIZATION handles_owner;
REVOKE ALL ON SCHEMA handles FROM PUBLIC;
