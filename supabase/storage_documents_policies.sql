-- =========================================================
-- STORAGE POLICIES: documents
-- Purpose: keep document object access aligned with documents table RLS.
-- Path format expected:
--   <account_id>/<document_id>/<file>
-- =========================================================

create or replace function public.can_access_document_storage(
  p_account_id uuid,
  p_document_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.documents d
    where d.id = p_document_id
      and d.account_id = p_account_id
      and (
        exists (
          select 1
          from public.account_members am
          where am.account_id = d.account_id
            and am.user_id = auth.uid()
            and (
              lower(am.role::text) = any (array['owner','admin'])
              or (
                lower(am.role::text) = 'staff'
                and d.visibility <> 'owner_admin'
              )
            )
        )
        or (
          d.visibility = 'tenant'
          and exists (
            select 1
            from public.tenants t
            where t.account_id = d.account_id
              and t.user_id = auth.uid()
              and t.archived_at is null
              and t.id = d.tenant_id
          )
        )
      )
  );
$$;

drop policy if exists "documents_storage_select_scoped" on storage.objects;
drop policy if exists "documents_storage_insert_member_stub" on storage.objects;
drop policy if exists "documents_storage_delete_owner_admin" on storage.objects;

create policy "documents_storage_select_scoped"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  and public.can_access_document_storage(
    split_part(name, '/', 1)::uuid,
    split_part(name, '/', 2)::uuid
  )
);

create policy "documents_storage_insert_member_stub"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  and exists (
    select 1
    from public.account_members am
    where am.user_id = auth.uid()
      and am.account_id = split_part(name, '/', 1)::uuid
      and lower(am.role::text) = any (array['owner','admin','staff'])
  )
);

create policy "documents_storage_delete_owner_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'documents'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and public.account_role_for(split_part(name, '/', 1)::uuid) = any (array['owner','admin'])
);
