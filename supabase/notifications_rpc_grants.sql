-- Ensure authenticated users can call notification RPCs.
--
-- IMPORTANT:
-- - This grant assumes public.create_notifications performs its own
--   server-side authorization and recipient/account validation.
-- - The create_notifications function body is not stored in this repository,
--   so its live implementation must be reviewed directly in Supabase before
--   the notification write path can be considered fully remediated.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, p.proname, oidvectortypes(p.proargtypes) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_notifications'
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated',
      r.schema_name, r.proname, r.args
    );
  END LOOP;
END $$;
