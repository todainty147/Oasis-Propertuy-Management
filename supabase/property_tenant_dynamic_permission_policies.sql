-- Align direct table RLS for property and tenant surfaces with the dynamic
-- role_permissions model. Legacy owner/admin/staff permissions are still
-- supplied by account_member_has_permission() fallbacks.

drop policy if exists properties_delete_owner_only on public.properties;
create policy properties_delete_owner_only
on public.properties
for delete
to authenticated
using (public.account_member_has_permission(account_id, 'properties.delete'));

drop policy if exists properties_insert_owner_admin on public.properties;
create policy properties_insert_owner_admin
on public.properties
for insert
to authenticated
with check (public.account_member_has_permission(account_id, 'properties.create'));

drop policy if exists properties_select_member on public.properties;
create policy properties_select_member
on public.properties
for select
to authenticated
using (
  public.user_can_manage_account(account_id)
  or public.account_member_has_permission(account_id, 'properties.read')
);

drop policy if exists properties_update_owner_admin on public.properties;
create policy properties_update_owner_admin
on public.properties
for update
to authenticated
using (public.account_member_has_permission(account_id, 'properties.update'))
with check (public.account_member_has_permission(account_id, 'properties.update'));

drop policy if exists tenants_delete_owner_only on public.tenants;
create policy tenants_delete_owner_only
on public.tenants
for delete
to authenticated
using (public.account_member_has_permission(account_id, 'tenants.delete'));

drop policy if exists tenants_insert_owner_admin on public.tenants;
create policy tenants_insert_owner_admin
on public.tenants
for insert
to authenticated
with check (public.account_member_has_permission(account_id, 'tenants.create'));

drop policy if exists tenants_select_member on public.tenants;
create policy tenants_select_member
on public.tenants
for select
to authenticated
using (
  public.user_can_manage_account(account_id)
  or public.account_member_has_permission(account_id, 'tenants.read')
);

drop policy if exists tenants_update_owner_admin on public.tenants;
create policy tenants_update_owner_admin
on public.tenants
for update
to authenticated
using (public.account_member_has_permission(account_id, 'tenants.update'))
with check (public.account_member_has_permission(account_id, 'tenants.update'));
