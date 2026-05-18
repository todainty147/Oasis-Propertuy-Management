-- Supabase linter security hardening
--
-- Addresses the database linter findings that can be remediated safely without
-- changing application RPC contracts:
--   - 0010 security_definer_view
--   - 0011 function_search_path_mutable
--   - 0014 extension_in_public
--   - 0028 accidental anonymous SECURITY DEFINER execution
--   - 0029 direct execution of trigger-only/internal SECURITY DEFINER helpers
--
-- The 0029 authenticated SECURITY DEFINER warnings need per-RPC review because
-- many client workflows intentionally call authenticated SECURITY DEFINER RPCs
-- that perform their own authorization checks before mutating protected tables.

begin;

-- Older hosted databases may still have pg_net in public. The current repo
-- baseline installs it in extensions; relocate only when the installed pg_net
-- extension supports SET SCHEMA so production drift cannot abort the migration.
create schema if not exists extensions;

do $$
declare
  pg_net_can_relocate boolean;
begin
  select e.extrelocatable
    into pg_net_can_relocate
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_net'
      and n.nspname = 'public';

  if coalesce(pg_net_can_relocate, false) then
    execute 'alter extension pg_net set schema extensions';
  elsif pg_net_can_relocate is false then
    raise notice 'pg_net is installed in public but does not support SET SCHEMA; leaving it in place for a separate production-safe remediation.';
  end if;
end;
$$;

-- SECURITY DEFINER views bypass caller RLS. Keep these views in public, but make
-- them execute as the querying role so table policies still apply.
alter view if exists public.work_orders_pending_cancellation set (security_invoker = true);
alter view if exists public.tenant_my_issues set (security_invoker = true);
alter view if exists public.security_definer_audit_view set (security_invoker = true);
alter view if exists public.work_orders_with_flags set (security_invoker = true);

-- The audit view exposes privileged function metadata and is useful for service
-- audits, not for browser-facing clients.
revoke all on table public.security_definer_audit_view from anon;
revoke all on table public.security_definer_audit_view from authenticated;
grant select on table public.security_definer_audit_view to service_role;

-- Make function name resolution deterministic for every public function that did
-- not already declare its own search_path. The auth and extensions schemas are
-- kept because existing functions intentionally call auth.uid(), auth.jwt(),
-- gen_random_uuid(), and similar helpers without schema churn.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) as cfg
        where cfg like 'search_path=%'
      )
  loop
    execute format(
      'alter function %s set search_path to public, auth, extensions',
      fn.signature
    );
  end loop;
end;
$$;

-- PostgreSQL grants EXECUTE on functions to PUBLIC by default. For SECURITY
-- DEFINER functions that means anon can inherit callable elevated RPCs unless
-- each function revokes it explicitly. Revoke public/anon broadly, then restore
-- only the documented pre-auth rate-limit helper.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format('revoke execute on function %s from public', fn.signature);
    execute format('revoke execute on function %s from anon', fn.signature);
  end loop;
end;
$$;

-- Keep the intentionally anonymous auth throttle RPC available to login,
-- signup, reset, and invite screens. Other invitation/signup RPCs require an
-- authenticated user and remain granted through their feature SQL files.
do $$
begin
  if to_regprocedure('public.record_auth_rate_limit_attempt(text,text)') is not null then
    grant execute on function public.record_auth_rate_limit_attempt(text, text) to anon;
    grant execute on function public.record_auth_rate_limit_attempt(text, text) to authenticated;
  end if;
end;
$$;

-- Trigger-only SECURITY DEFINER functions should never be directly callable via
-- /rest/v1/rpc. Revoking direct authenticated execution does not affect trigger
-- firing, but it removes noisy and risky RPC exposure.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.pronargs = 0
      and (
        p.proname like 'tg\_%' escape '\'
        or p.proname like 'trg\_%' escape '\'
        or p.proname like '%\_trg' escape '\'
        or p.proname like '%\_trg\_fn' escape '\'
        or p.proname in (
          'account_invitations_validate',
          'audit_work_order_status_change',
          'document_notify_uploaded',
          'fn_documents_notify_uploaded',
          'handle_new_user',
          'log_document_delete',
          'log_document_upload',
          'pet_requests_set_updated_at',
          'rent_review_set_updated_at',
          'rr_tasks_set_updated_at',
          'rls_auto_enable',
          'security_audit_detect_anomalies',
          'seed_default_account_roles_trg',
          'sync_account_member_role_id',
          'validate_custom_field_value',
          'work_order_notify_status_change',
          'work_orders_notify_trg_fn'
        )
      )
  loop
    execute format('revoke execute on function %s from authenticated', fn.signature);
  end loop;
end;
$$;

-- Service/Edge-only helpers should not be callable by browser roles. Edge
-- functions use the service role and triggers do not rely on EXECUTE grants.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname in (
        'cleanup_security_observability_events',
        'cleanup_stale_push_tokens',
        'insert_data_privacy_log',
        'mark_data_deletion_auth_user_deleted',
        'record_api_rate_limit_attempt',
        'remove_user_memberships',
        'sandbox_exec_if_relation_exists'
      )
  loop
    execute format('revoke execute on function %s from authenticated', fn.signature);
    execute format('grant execute on function %s to service_role', fn.signature);
  end loop;
end;
$$;

commit;
