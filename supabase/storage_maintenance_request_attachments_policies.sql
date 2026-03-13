-- =========================================================
-- STORAGE POLICIES: maintenance-request-attachments
-- Purpose: tenant can upload for own requests, members can view/manage,
-- and assigned contractor can view once work order is assigned.
-- Path format expected:
--   account/<account_id>/maintenance_requests/<maintenance_request_id>/<file>
-- =========================================================

DROP POLICY IF EXISTS "mr_attach_select_access" ON storage.objects;
DROP POLICY IF EXISTS "mr_attach_insert_tenant_or_member" ON storage.objects;
DROP POLICY IF EXISTS "mr_attach_delete_tenant_or_member" ON storage.objects;

CREATE POLICY "mr_attach_select_access"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'maintenance-request-attachments'
  AND split_part(name, '/', 1) = 'account'
  AND split_part(name, '/', 3) = 'maintenance_requests'
  AND split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  AND split_part(name, '/', 4) ~* '^[0-9a-f-]{36}$'
  AND (
    -- members in this account (owner/admin/staff/...)
    EXISTS (
      SELECT 1
      FROM account_members am
      WHERE am.user_id = auth.uid()
        AND am.account_id = split_part(name, '/', 2)::uuid
    )
    OR
    -- tenant who reported this maintenance request
    EXISTS (
      SELECT 1
      FROM maintenance_requests mr
      JOIN tenants t ON t.id = mr.reported_by_tenant_id
      WHERE mr.id = split_part(name, '/', 4)::uuid
        AND mr.account_id = split_part(name, '/', 2)::uuid
        AND t.account_id = mr.account_id
        AND t.user_id = auth.uid()
    )
    OR
    -- assigned contractor on any linked work order
    EXISTS (
      SELECT 1
      FROM work_orders wo
      WHERE wo.maintenance_request_id = split_part(name, '/', 4)::uuid
        AND wo.account_id = split_part(name, '/', 2)::uuid
        AND wo.contractor_user_id = auth.uid()
    )
  )
);

CREATE POLICY "mr_attach_insert_tenant_or_member"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'maintenance-request-attachments'
  AND split_part(name, '/', 1) = 'account'
  AND split_part(name, '/', 3) = 'maintenance_requests'
  AND split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  AND split_part(name, '/', 4) ~* '^[0-9a-f-]{36}$'
  AND (
    EXISTS (
      SELECT 1
      FROM account_members am
      WHERE am.user_id = auth.uid()
        AND am.account_id = split_part(name, '/', 2)::uuid
    )
    OR
    EXISTS (
      SELECT 1
      FROM maintenance_requests mr
      JOIN tenants t ON t.id = mr.reported_by_tenant_id
      WHERE mr.id = split_part(name, '/', 4)::uuid
        AND mr.account_id = split_part(name, '/', 2)::uuid
        AND t.account_id = mr.account_id
        AND t.user_id = auth.uid()
    )
  )
  AND EXISTS (
    SELECT 1
    FROM maintenance_requests mr
    WHERE mr.id = split_part(name, '/', 4)::uuid
      AND mr.account_id = split_part(name, '/', 2)::uuid
      AND lower(coalesce(mr.status, '')) <> 'closed'
  )
);

CREATE POLICY "mr_attach_delete_tenant_or_member"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'maintenance-request-attachments'
  AND split_part(name, '/', 1) = 'account'
  AND split_part(name, '/', 3) = 'maintenance_requests'
  AND split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  AND split_part(name, '/', 4) ~* '^[0-9a-f-]{36}$'
  AND (
    EXISTS (
      SELECT 1
      FROM account_members am
      WHERE am.user_id = auth.uid()
        AND am.account_id = split_part(name, '/', 2)::uuid
    )
    OR
    EXISTS (
      SELECT 1
      FROM maintenance_requests mr
      JOIN tenants t ON t.id = mr.reported_by_tenant_id
      WHERE mr.id = split_part(name, '/', 4)::uuid
        AND mr.account_id = split_part(name, '/', 2)::uuid
        AND t.account_id = mr.account_id
        AND t.user_id = auth.uid()
    )
  )
);
