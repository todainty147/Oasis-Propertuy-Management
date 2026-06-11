-- Final Supabase linter hardening pass.
--
-- This migration is intentionally timestamped after the current feature and
-- repair migrations so hosted databases receive the same security posture as
-- the repo overlay in supabase_linter_security_hardening.sql.
--
-- It remediates:
--   - function_search_path_mutable
--   - accidental anon/public execution of SECURITY DEFINER RPCs
--   - direct browser execution of trigger-only and service-only helpers
--
-- It does not blindly revoke authenticated execution from all SECURITY DEFINER
-- RPCs because many app workflows intentionally use authenticated RPCs with
-- internal account/role checks.

begin;

-- Make name resolution deterministic for public functions that do not already
-- pin a search_path. Keep auth/extensions because many helpers intentionally
-- call auth.uid(), auth.jwt(), gen_random_uuid(), and extension functions.
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

-- PostgreSQL grants EXECUTE on functions to PUBLIC by default. SECURITY DEFINER
-- functions should not be callable by anonymous users unless explicitly listed
-- below as public product surfaces.
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

-- Intentional anonymous RPCs. Keep this list small and documented:
--   - auth throttling must be callable before sign-in
--   - public rental application submission is token-gated by p_public_token
do $$
begin
  if to_regprocedure('public.record_auth_rate_limit_attempt(text,text)') is not null then
    grant execute on function public.record_auth_rate_limit_attempt(text, text) to anon;
    grant execute on function public.record_auth_rate_limit_attempt(text, text) to authenticated;
  end if;

  if to_regprocedure('public.submit_public_rental_application(text,jsonb)') is not null then
    grant execute on function public.submit_public_rental_application(text, jsonb) to anon;
    grant execute on function public.submit_public_rental_application(text, jsonb) to authenticated;
  end if;
end;
$$;

-- Trigger-only helpers are invoked by PostgreSQL triggers, not direct RPC calls.
-- Revoking browser EXECUTE does not affect trigger firing.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        p.proname like 'tg\_%' escape '\'
        or p.proname like 'trg\_%' escape '\'
        or p.proname like '%\_trg' escape '\'
        or p.proname like '%\_trg\_fn' escape '\'
        or p.proname in (
          'account_invitations_set_updated_at',
          'account_invitations_validate',
          'audit_work_order_status_change',
          'document_notify_uploaded',
          'early_users_set_updated_at',
          'fn_documents_notify_uploaded',
          'handle_new_user',
          'log_document_delete',
          'log_document_upload',
          'pet_requests_set_updated_at',
          'phase3_set_updated_at',
          'prevent_diagnostic_audit_mutation',
          'prevent_ledger_update_delete',
          'prevent_locked_inspection_item_edits',
          'prevent_locked_inspection_photo_edits',
          'prevent_locked_inspection_signature_edits',
          'rent_review_set_updated_at',
          'rr_tasks_set_updated_at',
          'rls_auto_enable',
          'security_audit_detect_anomalies',
          'seed_default_account_roles_trg',
          'set_maintenance_diagnostics_updated_at',
          'sync_account_member_role_id',
          'tax_tools_set_updated_at',
          'touch_device_push_token_updated_at',
          'validate_custom_field_value',
          'work_order_cancellation_decision_notify_trg_fn',
          'work_order_notify_status_change',
          'work_orders_notify_trg_fn'
        )
      )
  loop
    execute format('revoke execute on function %s from public', fn.signature);
    execute format('revoke execute on function %s from anon', fn.signature);
    execute format('revoke execute on function %s from authenticated', fn.signature);
  end loop;
end;
$$;

-- Service/Edge-only helpers should stay off browser roles. Root/admin browser
-- RPCs are intentionally not included here; they keep authenticated EXECUTE and
-- rely on their own root/account authorization checks.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'cleanup_security_observability_events',
        'cleanup_stale_push_tokens',
        'edge_store_marketplace_job_trades',
        'insert_data_privacy_log',
        'mark_data_deletion_auth_user_deleted',
        'record_api_rate_limit_attempt',
        'record_document_scan_result',
        'remove_user_memberships',
        'sandbox_exec_if_relation_exists'
      )
  loop
    execute format('revoke execute on function %s from public', fn.signature);
    execute format('revoke execute on function %s from anon', fn.signature);
    execute format('revoke execute on function %s from authenticated', fn.signature);
    execute format('grant execute on function %s to service_role', fn.signature);
  end loop;
end;
$$;

commit;
