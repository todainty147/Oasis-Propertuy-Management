-- Ensure all authenticated users can call notification RPCs
-- (especially tenant/contractor clients that need to trigger notifications).

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
