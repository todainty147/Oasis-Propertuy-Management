create table if not exists public.security_anomaly_alerts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  alert_type text not null,
  severity text not null default 'action',
  status text not null default 'open',
  actor_user_id uuid null references auth.users(id) on delete set null,
  entity_type text null,
  entity_id uuid null,
  title text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  alert_count integer not null default 1,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  acknowledged_at timestamptz null,
  resolved_at timestamptz null,
  constraint security_anomaly_alerts_severity_check check (lower(severity) in ('info', 'action', 'urgent')),
  constraint security_anomaly_alerts_status_check check (lower(status) in ('open', 'acknowledged', 'resolved')),
  constraint security_anomaly_alerts_alert_count_check check (alert_count >= 1)
);

comment on table public.security_anomaly_alerts is
  'Open internal security anomaly alerts derived from security_audit_ledger patterns.';

comment on column public.security_anomaly_alerts.metadata is
  'Compact anomaly payload with thresholds, detection window, count details, and review filter hints.';

create index if not exists security_anomaly_alerts_account_status_idx
  on public.security_anomaly_alerts(account_id, status, last_seen_at desc);

create index if not exists security_anomaly_alerts_type_status_idx
  on public.security_anomaly_alerts(account_id, alert_type, status, last_seen_at desc);

create unique index if not exists security_anomaly_alerts_open_dedupe_idx
  on public.security_anomaly_alerts(account_id, dedupe_key)
  where lower(status) = 'open';

alter table public.security_anomaly_alerts enable row level security;

drop policy if exists "security_anomaly_alerts_select_managers" on public.security_anomaly_alerts;
create policy "security_anomaly_alerts_select_managers"
on public.security_anomaly_alerts
for select
to authenticated
using (
  public.user_can_manage_account(account_id)
  and public.account_has_feature(account_id, 'security_audit')
);

drop policy if exists "security_anomaly_alerts_insert_managers" on public.security_anomaly_alerts;
create policy "security_anomaly_alerts_insert_managers"
on public.security_anomaly_alerts
for insert
to authenticated
with check (
  public.user_can_manage_account(account_id)
  and public.account_has_feature(account_id, 'security_audit')
);

drop policy if exists "security_anomaly_alerts_update_managers" on public.security_anomaly_alerts;
create policy "security_anomaly_alerts_update_managers"
on public.security_anomaly_alerts
for update
to authenticated
using (
  public.user_can_manage_account(account_id)
  and public.account_has_feature(account_id, 'security_audit')
)
with check (
  public.user_can_manage_account(account_id)
  and public.account_has_feature(account_id, 'security_audit')
);

grant select, insert, update on table public.security_anomaly_alerts to authenticated;

create or replace function public.security_root_telemetry_active_alerts(
  p_account_id uuid,
  p_status text default 'active',
  p_limit integer default 5,
  p_offset integer default 0
)
returns table (
  id uuid,
  account_id uuid,
  alert_type text,
  severity text,
  status text,
  actor_user_id uuid,
  entity_type text,
  entity_id uuid,
  title text,
  summary text,
  metadata jsonb,
  alert_count integer,
  created_at timestamptz,
  last_seen_at timestamptz,
  total_count bigint
)
language sql
security definer
set search_path = public
as $$
  with authz as (
    select public.assert_root_telemetry_access(p_account_id) as account_id
  ),
  cfg as (
    select
      greatest(1, least(coalesce(p_limit, 5), 25)) as row_limit,
      greatest(coalesce(p_offset, 0), 0) as row_offset,
      nullif(lower(trim(coalesce(p_status, 'active'))), '') as requested_status
  ),
  filtered as (
    select
      saa.id,
      saa.account_id,
      saa.alert_type,
      saa.severity,
      saa.status,
      saa.actor_user_id,
      saa.entity_type,
      saa.entity_id,
      saa.title,
      saa.summary,
      saa.metadata,
      saa.alert_count,
      saa.created_at,
      saa.last_seen_at
    from public.security_anomaly_alerts saa
    cross join authz a
    cross join cfg c
    where saa.account_id = a.account_id
      and (
        c.requested_status is null
        or (c.requested_status = 'active' and lower(saa.status) in ('open', 'acknowledged'))
        or lower(saa.status) = c.requested_status
      )
  )
  select
    f.id,
    f.account_id,
    f.alert_type,
    f.severity,
    f.status,
    f.actor_user_id,
    f.entity_type,
    f.entity_id,
    f.title,
    f.summary,
    f.metadata,
    f.alert_count,
    f.created_at,
    f.last_seen_at,
    count(*) over () as total_count
  from filtered f
  order by f.last_seen_at desc
  limit (select row_limit from cfg)
  offset (select row_offset from cfg);
$$;

comment on function public.security_root_telemetry_active_alerts(uuid, text, integer, integer) is
  'Root/support-safe anomaly alert feed for root telemetry surfaces, with bounded pagination and total count.';

revoke all on function public.security_root_telemetry_active_alerts(uuid, text, integer, integer) from public;
grant execute on function public.security_root_telemetry_active_alerts(uuid, text, integer, integer) to authenticated;

create or replace function public.upsert_security_anomaly_alert(
  p_account_id uuid,
  p_alert_type text,
  p_severity text,
  p_title text,
  p_summary text,
  p_actor_user_id uuid default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_dedupe_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alert_id uuid;
  v_alert_type text := lower(trim(coalesce(p_alert_type, '')));
  v_severity text := lower(trim(coalesce(p_severity, 'action')));
  v_status text := 'open';
  v_dedupe_key text := trim(coalesce(p_dedupe_key, ''));
begin
  if p_account_id is null then
    raise exception 'Missing account id';
  end if;

  if nullif(v_alert_type, '') is null then
    raise exception 'Missing alert type';
  end if;

  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception 'Missing title';
  end if;

  if nullif(trim(coalesce(p_summary, '')), '') is null then
    raise exception 'Missing summary';
  end if;

  if v_severity not in ('info', 'action', 'urgent') then
    v_severity := 'action';
  end if;

  if v_dedupe_key = '' then
    v_dedupe_key := v_alert_type || ':' || coalesce(p_actor_user_id::text, 'account') || ':' || coalesce(p_entity_id::text, 'na');
  end if;

  update public.security_anomaly_alerts saa
  set
    severity = v_severity,
    actor_user_id = coalesce(p_actor_user_id, saa.actor_user_id),
    entity_type = coalesce(p_entity_type, saa.entity_type),
    entity_id = coalesce(p_entity_id, saa.entity_id),
    title = p_title,
    summary = p_summary,
    metadata = coalesce(p_metadata, '{}'::jsonb),
    alert_count = saa.alert_count + 1,
    last_seen_at = now(),
    status = v_status,
    resolved_at = null
  where saa.account_id = p_account_id
    and saa.dedupe_key = v_dedupe_key
    and lower(saa.status) = 'open'
  returning saa.id into v_alert_id;

  if v_alert_id is not null then
    return v_alert_id;
  end if;

  insert into public.security_anomaly_alerts (
    account_id,
    alert_type,
    severity,
    status,
    actor_user_id,
    entity_type,
    entity_id,
    title,
    summary,
    metadata,
    dedupe_key
  )
  values (
    p_account_id,
    v_alert_type,
    v_severity,
    v_status,
    p_actor_user_id,
    p_entity_type,
    p_entity_id,
    p_title,
    p_summary,
    coalesce(p_metadata, '{}'::jsonb),
    v_dedupe_key
  )
  returning id into v_alert_id;

  return v_alert_id;
end;
$$;

comment on function public.upsert_security_anomaly_alert(uuid, text, text, text, text, uuid, text, uuid, text, jsonb) is
  'Creates or refreshes an open internal security anomaly alert using a dedupe key to avoid alert storms.';

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
begin
  if new.account_id is null then
    return new;
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
        and sal.created_at >= now() - interval '30 minutes';
    end if;

    select count(*)
    into v_role_change_account_count
    from public.security_audit_ledger sal
    where sal.account_id = new.account_id
      and sal.action = 'role_changed'
      and coalesce(sal.metadata->>'change_source', '') <> 'invite_acceptance'
      and sal.created_at >= now() - interval '30 minutes';

    if v_role_change_target_count >= 3 then
      perform public.upsert_security_anomaly_alert(
        new.account_id,
        'repeated_role_changes',
        'action',
        'Repeated role changes detected',
        'Multiple role changes were recorded for the same account member within 30 minutes.',
        new.actor_user_id,
        'account_member',
        v_target_user_id,
        'repeated_role_changes:target:' || v_target_user_id::text,
        jsonb_build_object(
          'detection_window_minutes', 30,
          'threshold', 3,
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
    elsif v_role_change_account_count >= 5 then
      perform public.upsert_security_anomaly_alert(
        new.account_id,
        'repeated_role_changes',
        'action',
        'High volume of role changes detected',
        'Multiple role changes were recorded across the account within 30 minutes.',
        new.actor_user_id,
        'account',
        new.account_id,
        'repeated_role_changes:account',
        jsonb_build_object(
          'detection_window_minutes', 30,
          'threshold', 5,
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
        and sal.created_at >= now() - interval '15 minutes';
    end if;

    select count(*)
    into v_doc_delete_account_count
    from public.security_audit_ledger sal
    where sal.account_id = new.account_id
      and sal.action = 'document_deleted'
      and sal.created_at >= now() - interval '15 minutes';

    if v_doc_delete_actor_count >= 5 and new.actor_user_id is not null then
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
          'detection_window_minutes', 15,
          'threshold', 5,
          'event_count', v_doc_delete_actor_count,
          'latest_event_id', new.id,
          'recommended_filters', jsonb_build_object(
            'action', 'document_deleted',
            'actorUserId', new.actor_user_id::text
          )
        )
      );
    elsif v_doc_delete_account_count >= 10 then
      perform public.upsert_security_anomaly_alert(
        new.account_id,
        'document_deletion_burst',
        'urgent',
        'Account-wide document deletion burst detected',
        'Document deletions spiked across the account in a short time window.',
        new.actor_user_id,
        'account',
        new.account_id,
        'document_deletion_burst:account',
        jsonb_build_object(
          'detection_window_minutes', 15,
          'threshold', 10,
          'event_count', v_doc_delete_account_count,
          'latest_event_id', new.id,
          'recommended_filters', jsonb_build_object(
            'action', 'document_deleted'
          )
        )
      );
    end if;
  end if;

  if new.actor_user_id is not null and new.action in (
    'role_changed',
    'account_disabled',
    'account_enabled',
    'account_deleted',
    'account_invitation_created',
    'landlord_invitation_created'
  ) then
    select public.account_member_effective_role(new.account_id, new.actor_user_id)
    into v_actor_member_role;

    if v_actor_member_role is null then
      select exists (
        select 1
        from public.tenants t
        where t.account_id = new.account_id
          and t.user_id = new.actor_user_id
      ) into v_actor_is_tenant;

      select exists (
        select 1
        from public.contractors c
        where c.account_id = new.account_id
          and c.user_id = new.actor_user_id
      ) into v_actor_is_contractor;
    end if;

    if v_actor_member_role = 'staff'
      or v_actor_is_tenant
      or v_actor_is_contractor
    then
      perform public.upsert_security_anomaly_alert(
        new.account_id,
        'cross_role_admin_activity',
        case when v_actor_is_tenant or v_actor_is_contractor then 'urgent' else 'action' end,
        'Review cross-role administrative activity',
        'A privileged administrative security event was recorded for an actor whose role should be reviewed.',
        new.actor_user_id,
        new.entity_type,
        new.entity_id,
        'cross_role_admin_activity:' || new.actor_user_id::text || ':' || new.action,
        jsonb_build_object(
          'actor_role', coalesce(v_actor_member_role, case when v_actor_is_tenant then 'tenant' when v_actor_is_contractor then 'contractor' else null end),
          'action', new.action,
          'latest_event_id', new.id,
          'recommended_filters', jsonb_build_object(
            'action', new.action,
            'actorUserId', new.actor_user_id::text
          )
        )
      );
    end if;
  end if;

  return new;
end;
$$;

comment on function public.security_audit_detect_anomalies() is
  'Lightweight trigger-based anomaly detection for repeated role changes, document deletion bursts, and cross-role administrative activity.';

drop trigger if exists trg_security_audit_detect_anomalies on public.security_audit_ledger;
create trigger trg_security_audit_detect_anomalies
after insert on public.security_audit_ledger
for each row
execute function public.security_audit_detect_anomalies();
