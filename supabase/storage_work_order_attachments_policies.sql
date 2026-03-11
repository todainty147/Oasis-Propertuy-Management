-- =========================================================
-- STORAGE POLICIES: work-order-attachments
-- Purpose: allow read/sign for assigned contractors + account members
-- Path format expected:
--   account/<account_id>/work_orders/<work_order_id>/<file>
-- =========================================================

-- NOTE:
-- createSignedUrl() checks SELECT policy on storage.objects.
-- Without SELECT permission, Supabase often returns "Object not found" / 400.

DROP POLICY IF EXISTS "wo_attach_select_members_or_assigned_contractor" ON storage.objects;

CREATE POLICY "wo_attach_select_members_or_assigned_contractor"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'work-order-attachments'
  AND split_part(name, '/', 1) = 'account'
  AND split_part(name, '/', 3) = 'work_orders'
  AND split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  AND split_part(name, '/', 4) ~* '^[0-9a-f-]{36}$'
  AND (
    -- owner/admin/staff/etc via account membership
    EXISTS (
      SELECT 1
      FROM account_members am
      WHERE am.user_id = auth.uid()
        AND am.account_id = split_part(name, '/', 2)::uuid
    )
    OR
    -- assigned contractor for this work order
    EXISTS (
      SELECT 1
      FROM work_orders wo
      WHERE wo.id = split_part(name, '/', 4)::uuid
        AND wo.account_id = split_part(name, '/', 2)::uuid
        AND wo.contractor_user_id = auth.uid()
    )
  )
);

