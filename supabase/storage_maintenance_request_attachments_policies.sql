-- =========================================================
-- STORAGE POLICIES: maintenance-request-attachments
-- Purpose: tenant can upload for own requests, members can view/manage,
-- and assigned contractor can view once work order is assigned.
-- Path format expected:
--   account/<account_id>/maintenance_requests/<maintenance_request_id>/<file>
-- =========================================================

create or replace function public.can_view_maintenance_request_attachment(
  p_account_id uuid,
  p_maintenance_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.maintenance_requests mr
    where mr.id = p_maintenance_request_id
      and mr.account_id = p_account_id
      and (
        exists (
          select 1
          from public.account_members am
          where am.account_id = mr.account_id
            and am.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.tenants t
          where t.id = mr.reported_by_tenant_id
            and t.account_id = mr.account_id
            and t.user_id = auth.uid()
            and t.archived_at is null
            and t.status in ('active', 'accepted_pending_signing')
        )
        or exists (
          select 1
          from public.work_orders wo
          where wo.maintenance_request_id = mr.id
            and wo.account_id = mr.account_id
            and wo.contractor_user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.can_manage_maintenance_request_attachment(
  p_account_id uuid,
  p_maintenance_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.maintenance_requests mr
    where mr.id = p_maintenance_request_id
      and mr.account_id = p_account_id
      and (
        exists (
          select 1
          from public.account_members am
          where am.account_id = mr.account_id
            and am.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.tenants t
          where t.id = mr.reported_by_tenant_id
            and t.account_id = mr.account_id
            and t.user_id = auth.uid()
            and t.archived_at is null
            and t.status in ('active', 'accepted_pending_signing')
        )
      )
  );
$$;

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
  AND public.safe_uuid(split_part(name, '/', 2)) IS NOT NULL
  AND public.safe_uuid(split_part(name, '/', 4)) IS NOT NULL
  AND public.can_view_maintenance_request_attachment(
    public.safe_uuid(split_part(name, '/', 2)),
    public.safe_uuid(split_part(name, '/', 4))
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
  AND public.safe_uuid(split_part(name, '/', 2)) IS NOT NULL
  AND public.safe_uuid(split_part(name, '/', 4)) IS NOT NULL
  AND public.can_manage_maintenance_request_attachment(
    public.safe_uuid(split_part(name, '/', 2)),
    public.safe_uuid(split_part(name, '/', 4))
  )
  AND EXISTS (
    SELECT 1
    FROM maintenance_requests mr
    WHERE mr.id = public.safe_uuid(split_part(name, '/', 4))
      AND mr.account_id = public.safe_uuid(split_part(name, '/', 2))
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
  AND public.safe_uuid(split_part(name, '/', 2)) IS NOT NULL
  AND public.safe_uuid(split_part(name, '/', 4)) IS NOT NULL
  AND public.can_manage_maintenance_request_attachment(
    public.safe_uuid(split_part(name, '/', 2)),
    public.safe_uuid(split_part(name, '/', 4))
  )
);
