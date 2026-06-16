-- =========================================================
-- STORAGE POLICIES: work-order-attachments
-- Purpose: allow read/sign for assigned contractors + account members,
-- upload for assigned contractors + account managers, and delete only for
-- account managers.
-- Path format expected:
--   account/<account_id>/work_orders/<work_order_id>/<file>
-- =========================================================

-- NOTE:
-- createSignedUrl() checks SELECT policy on storage.objects.
-- Without SELECT permission, Supabase often returns "Object not found" / 400.

create or replace function public.can_view_work_order_attachment(
  p_account_id uuid,
  p_work_order_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.work_orders wo
    where wo.id = p_work_order_id
      and wo.account_id = p_account_id
      and (
        exists (
          select 1
          from public.account_members am
          where am.account_id = wo.account_id
            and am.user_id = auth.uid()
        )
        or wo.contractor_user_id = auth.uid()
      )
  );
$$;

create or replace function public.can_manage_work_order_attachment(
  p_account_id uuid,
  p_work_order_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.work_orders wo
    where wo.id = p_work_order_id
      and wo.account_id = p_account_id
      and public.user_can_manage_account(wo.account_id)
  );
$$;

revoke all on function public.can_view_work_order_attachment(uuid, uuid) from public;
revoke all on function public.can_manage_work_order_attachment(uuid, uuid) from public;
revoke all on function public.safe_uuid(text) from public;
revoke execute on function public.can_view_work_order_attachment(uuid, uuid) from anon;
revoke execute on function public.can_manage_work_order_attachment(uuid, uuid) from anon;
revoke execute on function public.safe_uuid(text) from anon;
grant execute on function public.can_view_work_order_attachment(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_manage_work_order_attachment(uuid, uuid) to authenticated, service_role;
grant execute on function public.safe_uuid(text) to authenticated, service_role;

drop policy if exists "wo_attach_select_members_or_assigned_contractor" on storage.objects;
drop policy if exists "wo_attach_insert_members_or_assigned_contractor" on storage.objects;
drop policy if exists "wo_attach_delete_members_or_assigned_contractor" on storage.objects;

create policy "wo_attach_select_members_or_assigned_contractor"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'work-order-attachments'
  and split_part(name, '/', 1) = 'account'
  and split_part(name, '/', 3) = 'work_orders'
  and public.safe_uuid(split_part(name, '/', 2)) is not null
  and public.safe_uuid(split_part(name, '/', 4)) is not null
  and public.can_view_work_order_attachment(
    public.safe_uuid(split_part(name, '/', 2)),
    public.safe_uuid(split_part(name, '/', 4))
  )
);

create policy "wo_attach_insert_members_or_assigned_contractor"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'work-order-attachments'
  and split_part(name, '/', 1) = 'account'
  and split_part(name, '/', 3) = 'work_orders'
  and public.safe_uuid(split_part(name, '/', 2)) is not null
  and public.safe_uuid(split_part(name, '/', 4)) is not null
  and public.can_view_work_order_attachment(
    public.safe_uuid(split_part(name, '/', 2)),
    public.safe_uuid(split_part(name, '/', 4))
  )
);

create policy "wo_attach_delete_members_or_assigned_contractor"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'work-order-attachments'
  and split_part(name, '/', 1) = 'account'
  and split_part(name, '/', 3) = 'work_orders'
  and public.safe_uuid(split_part(name, '/', 2)) is not null
  and public.safe_uuid(split_part(name, '/', 4)) is not null
  and public.can_manage_work_order_attachment(
    public.safe_uuid(split_part(name, '/', 2)),
    public.safe_uuid(split_part(name, '/', 4))
  )
);
