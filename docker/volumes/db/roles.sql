-- Set passwords for all Supabase internal roles.
-- This script is mounted into /docker-entrypoint-initdb.d/init-scripts/
-- and runs after the image's built-in init scripts create the roles.
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';

-- supabase_functions_admin may not exist in all Postgres image versions
DO $$ BEGIN
  EXECUTE format('ALTER USER supabase_functions_admin WITH PASSWORD %L', current_setting('psqlVariable.pgpass', true));
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- GoTrue (auth) needs to own auth schema functions to run migrations.
-- The Postgres image init creates these functions owned by postgres/supabase_admin,
-- but GoTrue runs as supabase_auth_admin and needs CREATE OR REPLACE permission.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'auth'
  LOOP
    EXECUTE format('ALTER FUNCTION auth.%I(%s) OWNER TO supabase_auth_admin', r.proname, r.args);
  END LOOP;
END
$$;

-- Storage API needs authenticator role membership for RLS SET ROLE
GRANT authenticator TO supabase_storage_admin;
