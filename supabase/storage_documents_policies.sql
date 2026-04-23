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
        public.account_member_effective_role(d.account_id, auth.uid()) = any (array['owner','admin'])
        or (
          public.account_member_effective_role(d.account_id, auth.uid()) = 'staff'
          and d.visibility <> 'owner_admin'
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
        or exists (
          select 1
          from public.document_request_uploads dru
          join public.document_requests dr on dr.id = dru.request_id
          where dru.document_id = d.id
            and public.is_document_request_target(dr.id, auth.uid())
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
  and public.account_member_has_permission(
    split_part(name, '/', 1)::uuid,
    'documents.upload',
    auth.uid()
  )
);

create policy "documents_storage_delete_owner_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'documents'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and public.account_member_effective_role(split_part(name, '/', 1)::uuid, auth.uid()) = any (array['owner','admin'])
);
