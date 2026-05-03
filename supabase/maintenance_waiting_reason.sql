-- =========================================================
-- maintenance_requests.waiting_reason (optional context for waiting)
-- =========================================================

ALTER TABLE IF EXISTS maintenance_requests
ADD COLUMN IF NOT EXISTS waiting_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'maintenance_requests_waiting_reason_check'
      AND conrelid = 'maintenance_requests'::regclass
  ) THEN
    ALTER TABLE maintenance_requests
    ADD CONSTRAINT maintenance_requests_waiting_reason_check
    CHECK (
      waiting_reason IS NULL
      OR waiting_reason IN (
        'tenant_response',
        'contractor_schedule',
        'parts_ordered',
        'landlord_approval'
      )
    );
  END IF;
END
$$;

