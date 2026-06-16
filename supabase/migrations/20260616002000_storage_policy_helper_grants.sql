-- Storage policy helper grants after SECURITY DEFINER hardening.
--
-- The linter hardening pass revokes default PUBLIC/anon EXECUTE privileges.
-- Browser storage policies execute as authenticated users and call the helpers
-- below directly from storage.objects policies, so authenticated needs explicit
-- EXECUTE while anon remains denied.

revoke all on function public.can_view_work_order_attachment(uuid, uuid) from public;
revoke all on function public.can_manage_work_order_attachment(uuid, uuid) from public;
revoke all on function public.can_view_maintenance_request_attachment(uuid, uuid) from public;
revoke all on function public.can_manage_maintenance_request_attachment(uuid, uuid) from public;
revoke all on function public.can_access_document_storage(uuid, uuid) from public;
revoke all on function public.can_insert_document_request_upload_storage(uuid, uuid, uuid) from public;
revoke all on function public.can_access_document_template_storage(uuid, uuid) from public;
revoke all on function public.can_insert_document_quarantine_storage(text) from public;
revoke all on function public.user_can_manage_account(uuid) from public;
revoke all on function public.account_has_feature(uuid, text) from public;
revoke all on function public.safe_uuid(text) from public;

revoke execute on function public.can_view_work_order_attachment(uuid, uuid) from anon;
revoke execute on function public.can_manage_work_order_attachment(uuid, uuid) from anon;
revoke execute on function public.can_view_maintenance_request_attachment(uuid, uuid) from anon;
revoke execute on function public.can_manage_maintenance_request_attachment(uuid, uuid) from anon;
revoke execute on function public.can_access_document_storage(uuid, uuid) from anon;
revoke execute on function public.can_insert_document_request_upload_storage(uuid, uuid, uuid) from anon;
revoke execute on function public.can_access_document_template_storage(uuid, uuid) from anon;
revoke execute on function public.can_insert_document_quarantine_storage(text) from anon;
revoke execute on function public.user_can_manage_account(uuid) from anon;
revoke execute on function public.account_has_feature(uuid, text) from anon;
revoke execute on function public.safe_uuid(text) from anon;

grant execute on function public.can_view_work_order_attachment(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_manage_work_order_attachment(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_view_maintenance_request_attachment(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_manage_maintenance_request_attachment(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_access_document_storage(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_insert_document_request_upload_storage(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.can_access_document_template_storage(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_insert_document_quarantine_storage(text) to authenticated, service_role;
grant execute on function public.user_can_manage_account(uuid) to authenticated, service_role;
grant execute on function public.account_has_feature(uuid, text) to authenticated, service_role;
grant execute on function public.safe_uuid(text) to authenticated, service_role;
