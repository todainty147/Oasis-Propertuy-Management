-- Adds assigned_at, acknowledged_at, acknowledgement_due_at, and
-- acknowledgement_status to work_orders_with_flags.
-- These columns were added to the work_orders table after the view was
-- created and were never projected through it, causing 42703 errors on
-- any query that selected them via the view.
--
-- CREATE OR REPLACE VIEW cannot insert columns mid-list (42P16), so we
-- drop the dependent view first, drop the main view, then recreate both.

DROP VIEW IF EXISTS public.work_orders_pending_cancellation;
DROP VIEW IF EXISTS public.work_orders_with_flags;

CREATE VIEW public.work_orders_with_flags AS
WITH last_req AS (
  SELECT DISTINCT ON (al.work_order_id)
    al.work_order_id,
    al.created_at    AS last_cancel_request_at,
    al.actor_user_id AS last_cancel_request_by
  FROM public.work_order_audit_log al
  WHERE al.action = 'tenant_cancellation_requested'
  ORDER BY al.work_order_id, al.created_at DESC
),
last_res AS (
  SELECT DISTINCT ON (al.work_order_id)
    al.work_order_id,
    al.created_at    AS last_cancel_resolution_at,
    al.action        AS last_cancel_resolution_action,
    al.actor_user_id AS last_cancel_resolution_by
  FROM public.work_order_audit_log al
  WHERE al.action = ANY (ARRAY[
    'tenant_cancellation_approved'::text,
    'tenant_cancellation_denied'::text
  ])
  ORDER BY al.work_order_id, al.created_at DESC
)
SELECT
  wo.id,
  wo.account_id,
  wo.property_id,
  wo.maintenance_request_id,
  wo.contractor_user_id,
  wo.contractor_name,
  wo.contractor_phone,
  wo.status,
  wo.scheduled_at,
  wo.notes,
  wo.quote_amount,
  wo.invoice_amount,
  wo.created_by,
  wo.created_at,
  wo.updated_at,
  wo.assigned_at,
  wo.acknowledged_at,
  wo.acknowledgement_due_at,
  wo.acknowledgement_status,
  lr.last_cancel_request_at,
  lr.last_cancel_request_by,
  ls.last_cancel_resolution_at,
  ls.last_cancel_resolution_action,
  ls.last_cancel_resolution_by,
  (
    COALESCE(lr.last_cancel_request_at, '-infinity'::timestamptz)
    > COALESCE(ls.last_cancel_resolution_at, '-infinity'::timestamptz)
  ) AS pending_cancel_request
FROM public.work_orders wo
LEFT JOIN last_req lr ON lr.work_order_id = wo.id
LEFT JOIN last_res ls ON ls.work_order_id = wo.id;

ALTER VIEW public.work_orders_with_flags OWNER TO postgres;

GRANT SELECT ON public.work_orders_with_flags TO anon;
GRANT SELECT ON public.work_orders_with_flags TO authenticated;
GRANT ALL   ON public.work_orders_with_flags TO service_role;

-- Recreate the dependent view that filters to rows with an open cancel request.
CREATE VIEW public.work_orders_pending_cancellation AS
SELECT
  id,
  account_id,
  property_id,
  maintenance_request_id,
  contractor_user_id,
  contractor_name,
  contractor_phone,
  status,
  scheduled_at,
  notes,
  quote_amount,
  invoice_amount,
  created_by,
  created_at,
  updated_at,
  last_cancel_request_at,
  last_cancel_request_by,
  last_cancel_resolution_at,
  last_cancel_resolution_action,
  last_cancel_resolution_by,
  pending_cancel_request
FROM public.work_orders_with_flags
WHERE pending_cancel_request = true;

ALTER VIEW public.work_orders_pending_cancellation OWNER TO postgres;

GRANT SELECT ON public.work_orders_pending_cancellation TO anon;
GRANT SELECT ON public.work_orders_pending_cancellation TO authenticated;
GRANT ALL   ON public.work_orders_pending_cancellation TO service_role;
