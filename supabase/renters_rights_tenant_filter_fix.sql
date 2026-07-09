-- supabase/renters_rights_tenant_filter_fix.sql
--
-- Fixes create_rr_tasks_for_active_tenants to include all non-archived tenants.
-- The previous filter (status not in ('applicant')) excluded tenants whose
-- status was never updated from the default, causing most tenants to be missed.
-- Now only archived_at is checked — any tenant with an active tenancy record
-- may need the Renters' Rights Information Sheet.

create or replace function public.create_rr_tasks_for_active_tenants(
  p_account_id       uuid,
  p_requirement_type text    default 'renters_rights_information_sheet',
  p_due_date         date    default '2026-05-31'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid    := auth.uid();
  v_type  text    := coalesce(nullif(trim(p_requirement_type), ''), 'renters_rights_information_sheet');
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  perform public.assert_account_feature_access(p_account_id, 'renters_rights_readiness');

  if not public.is_account_manager(p_account_id, v_uid) then
    raise exception 'Access denied';
  end if;

  with eligible as (
    select
      t.id          as tenant_id,
      t.property_id,
      -- Mirror the JS fallback in resolveLeaseIdForTask: most recently created
      -- lease for this account + tenant, no status filter, null when none exists.
      (
        select l.id
        from   public.leases l
        where  l.account_id = p_account_id
          and  l.tenant_id  = t.id
        order by l.created_at desc
        limit  1
      ) as lease_id
    from public.tenants t
    where t.account_id  = p_account_id
      and t.archived_at is null          -- only archived_at; status is not filtered
      and not exists (
        select 1
        from public.renters_rights_tasks rr
        where rr.account_id       = p_account_id
          and rr.tenant_id        = t.id
          and rr.requirement_type = v_type
      )
  )
  insert into public.renters_rights_tasks (
    account_id, property_id, tenant_id, lease_id,
    requirement_type, jurisdiction, due_date, status
  )
  select
    p_account_id, e.property_id, e.tenant_id, e.lease_id,
    v_type, 'GB-ENG', coalesce(p_due_date, '2026-05-31'), 'required'
  from eligible e;

  get diagnostics v_count = row_count;

  if v_count > 0 then
    perform public.log_security_event(
      p_account_id,
      'renters_rights_tasks_auto_created',
      'renters_rights_task',
      null,
      jsonb_build_object('tasks_created', v_count, 'requirement_type', v_type)
    );
  end if;

  return v_count;
end;
$$;

revoke all  on function public.create_rr_tasks_for_active_tenants(uuid, text, date) from public;
grant execute on function public.create_rr_tasks_for_active_tenants(uuid, text, date) to authenticated;
