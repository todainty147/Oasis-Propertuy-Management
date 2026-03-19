create table if not exists public.account_security_settings (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  role_change_target_threshold integer not null default 3
    check (role_change_target_threshold between 2 and 20),
  role_change_account_threshold integer not null default 5
    check (role_change_account_threshold between 2 and 50),
  role_change_window_minutes integer not null default 30
    check (role_change_window_minutes between 5 and 240),
  document_delete_actor_threshold integer not null default 5
    check (document_delete_actor_threshold between 2 and 50),
  document_delete_account_threshold integer not null default 10
    check (document_delete_account_threshold between 2 and 100),
  document_delete_window_minutes integer not null default 15
    check (document_delete_window_minutes between 5 and 240),
  export_retention_days integer not null default 14
    check (export_retention_days between 1 and 30),
  surface_security_alerts_in_command_center boolean not null default true,
  security_command_center_min_severity text not null default 'urgent'
    check (lower(security_command_center_min_severity) in ('urgent', 'action')),
  security_command_center_include_suspicious boolean not null default true,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.account_security_settings is
  'Account-level tunables for security audit thresholds, export retention, and security alert surfacing defaults.';

create or replace function public.account_security_settings_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_account_security_settings_set_updated_at on public.account_security_settings;
create trigger trg_account_security_settings_set_updated_at
before update on public.account_security_settings
for each row
execute function public.account_security_settings_set_updated_at();

alter table public.account_security_settings enable row level security;

drop policy if exists account_security_settings_select_members on public.account_security_settings;
create policy account_security_settings_select_members
on public.account_security_settings
for select
to authenticated
using (
  exists (
    select 1
    from public.account_members am
    where am.account_id = account_security_settings.account_id
      and am.user_id = auth.uid()
  )
  or public.user_is_root_operator()
);

drop policy if exists account_security_settings_upsert_managers on public.account_security_settings;
create policy account_security_settings_upsert_managers
on public.account_security_settings
for all
to authenticated
using (public.user_can_manage_account(account_security_settings.account_id))
with check (public.user_can_manage_account(account_security_settings.account_id));

grant select, insert, update on table public.account_security_settings to authenticated;

alter table public.security_audit_export_jobs
  add column if not exists expired_at timestamptz null;

create or replace function public.request_security_audit_export(
  p_account_id uuid,
  p_filter_criteria jsonb default '{}'::jsonb,
  p_format text default 'csv',
  p_retention_days integer default null
)
returns public.security_audit_export_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_format text := lower(trim(coalesce(p_format, 'csv')));
  v_config public.account_security_settings;
  v_retention_days integer;
  v_filter_criteria jsonb := coalesce(p_filter_criteria, '{}'::jsonb);
  v_job public.security_audit_export_jobs;
begin
  v_account_id := public.assert_manage_account_access(p_account_id);

  select *
  into v_config
  from public.account_security_settings
  where account_id = v_account_id;

  v_retention_days := greatest(
    1,
    least(
      coalesce(p_retention_days, v_config.export_retention_days, 14),
      30
    )
  );

  if v_format <> 'csv' then
    raise exception 'Unsupported export format';
  end if;

  insert into public.security_audit_export_jobs (
    account_id,
    requested_by_user_id,
    export_kind,
    format,
    status,
    filter_criteria,
    expires_at
  )
  values (
    v_account_id,
    auth.uid(),
    'security_audit_csv',
    v_format,
    'queued',
    v_filter_criteria,
    now() + make_interval(days => v_retention_days)
  )
  returning * into v_job;

  return v_job;
end;
$$;

create or replace function public.security_audit_detect_anomalies()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_user_id uuid := nullif(coalesce(new.metadata->>'target_user_id', ''), '')::uuid;
  v_role_change_target_count integer := 0;
  v_role_change_account_count integer := 0;
  v_doc_delete_actor_count integer := 0;
  v_doc_delete_account_count integer := 0;
  v_actor_member_role text := null;
  v_actor_is_tenant boolean := false;
  v_actor_is_contractor boolean := false;
  v_role_change_target_threshold integer := 3;
  v_role_change_account_threshold integer := 5;
  v_role_change_window_minutes integer := 30;
  v_document_delete_actor_threshold integer := 5;
  v_document_delete_account_threshold integer := 10;
  v_document_delete_window_minutes integer := 15;
begin
  if new.account_id is null then
    return new;
  end if;

  select
    coalesce(s.role_change_target_threshold, 3),
    coalesce(s.role_change_account_threshold, 5),
    coalesce(s.role_change_window_minutes, 30),
    coalesce(s.document_delete_actor_threshold, 5),
    coalesce(s.document_delete_account_threshold, 10),
    coalesce(s.document_delete_window_minutes, 15)
  into
    v_role_change_target_threshold,
    v_role_change_account_threshold,
    v_role_change_window_minutes,
    v_document_delete_actor_threshold,
    v_document_delete_account_threshold,
    v_document_delete_window_minutes
  from public.account_security_settings s
  where s.account_id = new.account_id
  limit 1;

  if not found then
    v_role_change_target_threshold := 3;
    v_role_change_account_threshold := 5;
    v_role_change_window_minutes := 30;
    v_document_delete_actor_threshold := 5;
    v_document_delete_account_threshold := 10;
    v_document_delete_window_minutes := 15;
  end if;

  if new.action = 'role_changed' then
    if coalesce(new.metadata->>'change_source', '') = 'invite_acceptance' then
      return new;
    end if;

    if v_target_user_id is not null then
      select count(*)
      into v_role_change_target_count
      from public.security_audit_ledger sal
      where sal.account_id = new.account_id
        and sal.action = 'role_changed'
        and coalesce(sal.metadata->>'change_source', '') <> 'invite_acceptance'
        and coalesce(sal.metadata->>'target_user_id', '') = v_target_user_id::text
        and sal.created_at >= now() - make_interval(mins => v_role_change_window_minutes);
    end if;

    select count(*)
    into v_role_change_account_count
    from public.security_audit_ledger sal
    where sal.account_id = new.account_id
      and sal.action = 'role_changed'
      and coalesce(sal.metadata->>'change_source', '') <> 'invite_acceptance'
      and sal.created_at >= now() - make_interval(mins => v_role_change_window_minutes);

    if v_role_change_target_count >= v_role_change_target_threshold then
      perform public.upsert_security_anomaly_alert(
        new.account_id,
        'repeated_role_changes',
        'action',
        'Repeated role changes detected',
        'Multiple role changes were recorded for the same account member within the configured review window.',
        new.actor_user_id,
        'account_member',
        v_target_user_id,
        'repeated_role_changes:target:' || v_target_user_id::text,
        jsonb_build_object(
          'detection_window_minutes', v_role_change_window_minutes,
          'threshold', v_role_change_target_threshold,
          'event_count', v_role_change_target_count,
          'target_user_id', v_target_user_id,
          'latest_event_id', new.id,
          'recommended_filters', jsonb_build_object(
            'action', 'role_changed',
            'actorUserId', coalesce(new.actor_user_id::text, ''),
            'entityType', 'account_member',
            'entityId', v_target_user_id::text
          )
        )
      );
    elsif v_role_change_account_count >= v_role_change_account_threshold then
      perform public.upsert_security_anomaly_alert(
        new.account_id,
        'repeated_role_changes',
        'action',
        'High volume of role changes detected',
        'Multiple role changes were recorded across the account within the configured review window.',
        new.actor_user_id,
        'account',
        new.account_id,
        'repeated_role_changes:account',
        jsonb_build_object(
          'detection_window_minutes', v_role_change_window_minutes,
          'threshold', v_role_change_account_threshold,
          'event_count', v_role_change_account_count,
          'latest_event_id', new.id,
          'recommended_filters', jsonb_build_object(
            'action', 'role_changed'
          )
        )
      );
    end if;
  elsif new.action = 'document_deleted' then
    if new.actor_user_id is not null then
      select count(*)
      into v_doc_delete_actor_count
      from public.security_audit_ledger sal
      where sal.account_id = new.account_id
        and sal.action = 'document_deleted'
        and sal.actor_user_id = new.actor_user_id
        and sal.created_at >= now() - make_interval(mins => v_document_delete_window_minutes);
    end if;

    select count(*)
    into v_doc_delete_account_count
    from public.security_audit_ledger sal
    where sal.account_id = new.account_id
      and sal.action = 'document_deleted'
      and sal.created_at >= now() - make_interval(mins => v_document_delete_window_minutes);

    if v_doc_delete_actor_count >= v_document_delete_actor_threshold and new.actor_user_id is not null then
      perform public.upsert_security_anomaly_alert(
        new.account_id,
        'document_deletion_burst',
        'urgent',
        'Document deletion burst detected',
        'A single actor deleted multiple documents in a short time window.',
        new.actor_user_id,
        'document',
        new.entity_id,
        'document_deletion_burst:actor:' || new.actor_user_id::text,
        jsonb_build_object(
          'detection_window_minutes', v_document_delete_window_minutes,
          'threshold', v_document_delete_actor_threshold,
          'event_count', v_doc_delete_actor_count,
          'latest_event_id', new.id,
          'recommended_filters', jsonb_build_object(
            'action', 'document_deleted',
            'actorUserId', new.actor_user_id::text,
            'entityType', 'document'
          )
        )
      );
    elsif v_doc_delete_account_count >= v_document_delete_account_threshold then
      perform public.upsert_security_anomaly_alert(
        new.account_id,
        'document_deletion_burst',
        'urgent',
        'Account-level document deletion burst detected',
        'Document deletions spiked across the account in a short time window.',
        new.actor_user_id,
        'account',
        new.account_id,
        'document_deletion_burst:account',
        jsonb_build_object(
          'detection_window_minutes', v_document_delete_window_minutes,
          'threshold', v_document_delete_account_threshold,
          'event_count', v_doc_delete_account_count,
          'latest_event_id', new.id,
          'recommended_filters', jsonb_build_object(
            'action', 'document_deleted'
          )
        )
      );
    end if;
  elsif new.action in (
    'role_changed',
    'account_disabled',
    'account_enabled',
    'account_deleted',
    'account_invitation_created',
    'landlord_invitation_created'
  ) then
    select lower(am.role::text)
    into v_actor_member_role
    from public.account_members am
    where am.account_id = new.account_id
      and am.user_id = new.actor_user_id
    limit 1;

    select exists (
      select 1
      from public.tenants t
      where t.account_id = new.account_id
        and t.user_id = new.actor_user_id
    )
    into v_actor_is_tenant;

    select exists (
      select 1
      from public.contractors c
      where c.account_id = new.account_id
        and c.user_id = new.actor_user_id
    )
    into v_actor_is_contractor;

    if v_actor_member_role = 'staff' or v_actor_is_tenant or v_actor_is_contractor then
      perform public.upsert_security_anomaly_alert(
        new.account_id,
        'cross_role_admin_activity',
        case when v_actor_is_tenant or v_actor_is_contractor then 'urgent' else 'action' end,
        'Admin/security action crossed role boundary',
        'A privileged administrative action should be reviewed because the actor role or account position is unusual for this type of change.',
        new.actor_user_id,
        coalesce(new.entity_type, 'account'),
        new.entity_id,
        'cross_role_admin_activity:' || coalesce(new.actor_user_id::text, 'system') || ':' || new.action,
        jsonb_build_object(
          'actor_member_role', coalesce(v_actor_member_role, ''),
          'actor_is_tenant', v_actor_is_tenant,
          'actor_is_contractor', v_actor_is_contractor,
          'trigger_action', new.action,
          'latest_event_id', new.id,
          'recommended_filters', jsonb_build_object(
            'action', new.action,
            'actorUserId', coalesce(new.actor_user_id::text, ''),
            'entityType', coalesce(new.entity_type, '')
          )
        )
      );
    end if;
  end if;

  return new;
end;
$$;
