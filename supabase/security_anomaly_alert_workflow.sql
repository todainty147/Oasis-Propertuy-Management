alter table public.security_anomaly_alerts
  add column if not exists classification text null,
  add column if not exists classified_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists classified_at timestamptz null,
  add column if not exists assigned_to_user_id uuid references auth.users(id) on delete set null,
  add column if not exists assigned_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists assigned_at timestamptz null,
  add column if not exists acknowledged_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists resolved_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists resolution_note text null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.security_anomaly_alerts
  drop constraint if exists security_anomaly_alerts_classification_check;

alter table public.security_anomaly_alerts
  add constraint security_anomaly_alerts_classification_check
  check (
    classification is null
    or lower(classification) in ('suspicious', 'expected', 'false_positive', 'informational')
  );

comment on column public.security_anomaly_alerts.classification is
  'Analyst classification for the current alert lifecycle.';

comment on column public.security_anomaly_alerts.resolution_note is
  'Optional analyst note captured at resolution time.';

drop index if exists public.security_anomaly_alerts_open_dedupe_idx;
create unique index if not exists security_anomaly_alerts_active_dedupe_idx
  on public.security_anomaly_alerts(account_id, dedupe_key)
  where lower(status) in ('open', 'acknowledged');

create or replace function public.tg_set_updated_at_security_anomaly_alerts()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_security_anomaly_alerts_updated_at on public.security_anomaly_alerts;
create trigger trg_security_anomaly_alerts_updated_at
before update on public.security_anomaly_alerts
for each row
execute function public.tg_set_updated_at_security_anomaly_alerts();

revoke insert, update on table public.security_anomaly_alerts from authenticated;

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
  v_dedupe_key text;
begin
  if p_account_id is null then
    raise exception 'Missing account id';
  end if;

  if auth.role() is distinct from 'service_role' then
    if auth.uid() is null then
      raise exception 'Not authenticated' using errcode = '42501';
    end if;

    perform public.assert_manage_account_access(p_account_id);
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

  v_dedupe_key := v_alert_type || ':' || coalesce(p_actor_user_id::text, 'account') || ':' || coalesce(p_entity_id::text, 'na');

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
    resolved_at = null,
    resolved_by_user_id = null,
    resolution_note = null,
    status = case
      when lower(saa.status) = 'resolved' then 'open'
      else saa.status
    end
  where saa.account_id = p_account_id
    and saa.dedupe_key = v_dedupe_key
    and lower(saa.status) in ('open', 'acknowledged')
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
    'open',
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
  'Creates or refreshes an active internal security anomaly alert using a dedupe key to avoid alert storms.';

revoke all on function public.upsert_security_anomaly_alert(uuid, text, text, text, text, uuid, text, uuid, text, jsonb) from public;
revoke all on function public.upsert_security_anomaly_alert(uuid, text, text, text, text, uuid, text, uuid, text, jsonb) from anon;
grant execute on function public.upsert_security_anomaly_alert(uuid, text, text, text, text, uuid, text, uuid, text, jsonb) to service_role;

create or replace function public.security_anomaly_alert_apply(
  p_alert_id uuid,
  p_operation text,
  p_classification text default null,
  p_assigned_to_user_id uuid default null,
  p_resolution_note text default null
)
returns public.security_anomaly_alerts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_operation text := lower(trim(coalesce(p_operation, '')));
  v_classification text := nullif(lower(trim(coalesce(p_classification, ''))), '');
  v_resolution_note text := nullif(trim(coalesce(p_resolution_note, '')), '');
  v_alert public.security_anomaly_alerts;
  v_updated public.security_anomaly_alerts;
  v_assignee_role text;
begin
  if v_actor_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_alert_id is null then
    raise exception 'Missing alert id';
  end if;

  if v_operation not in ('acknowledge', 'classify', 'assign', 'resolve') then
    raise exception 'Unsupported operation';
  end if;

  select *
  into v_alert
  from public.security_anomaly_alerts
  where id = p_alert_id
  for update;

  if v_alert.id is null then
    raise exception 'Alert not found';
  end if;

  perform public.assert_manage_account_access(v_alert.account_id);
  perform public.assert_account_feature_access(v_alert.account_id, 'security_audit');

  if v_operation = 'acknowledge' then
    if lower(v_alert.status) <> 'open' then
      raise exception 'Only open alerts can be acknowledged';
    end if;

    update public.security_anomaly_alerts
    set
      status = 'acknowledged',
      acknowledged_by_user_id = v_actor_user_id,
      acknowledged_at = now()
    where id = v_alert.id
    returning * into v_updated;

    perform public.log_security_event(
      v_alert.account_id,
      'security_alert_acknowledged',
      'security_alert',
      v_alert.id,
      jsonb_build_object(
        'alert_type', v_alert.alert_type,
        'title', v_alert.title,
        'old_status', v_alert.status,
        'new_status', v_updated.status
      )
    );
  elsif v_operation = 'classify' then
    if lower(v_alert.status) = 'resolved' then
      raise exception 'Resolved alerts cannot be reclassified';
    end if;

    if v_classification is null or v_classification not in ('suspicious', 'expected', 'false_positive', 'informational') then
      raise exception 'Invalid classification';
    end if;

    update public.security_anomaly_alerts
    set
      classification = v_classification,
      classified_by_user_id = v_actor_user_id,
      classified_at = now()
    where id = v_alert.id
    returning * into v_updated;

    perform public.log_security_event(
      v_alert.account_id,
      'security_alert_classified',
      'security_alert',
      v_alert.id,
      jsonb_build_object(
        'alert_type', v_alert.alert_type,
        'title', v_alert.title,
        'old_classification', v_alert.classification,
        'new_classification', v_updated.classification
      )
    );
  elsif v_operation = 'assign' then
    if lower(v_alert.status) = 'resolved' then
      raise exception 'Resolved alerts cannot be reassigned';
    end if;

    if p_assigned_to_user_id is not null then
      select public.account_member_effective_role(v_alert.account_id, p_assigned_to_user_id)
      into v_assignee_role;

      if v_assignee_role is null or v_assignee_role not in ('owner', 'admin', 'staff') then
        raise exception 'Assignee must be a privileged account member';
      end if;
    end if;

    update public.security_anomaly_alerts
    set
      assigned_to_user_id = p_assigned_to_user_id,
      assigned_by_user_id = case when p_assigned_to_user_id is null then null else v_actor_user_id end,
      assigned_at = case when p_assigned_to_user_id is null then null else now() end
    where id = v_alert.id
    returning * into v_updated;

    perform public.log_security_event(
      v_alert.account_id,
      'security_alert_assigned',
      'security_alert',
      v_alert.id,
      jsonb_build_object(
        'alert_type', v_alert.alert_type,
        'title', v_alert.title,
        'old_assigned_to_user_id', v_alert.assigned_to_user_id,
        'new_assigned_to_user_id', v_updated.assigned_to_user_id
      )
    );
  else
    if lower(v_alert.status) = 'resolved' then
      raise exception 'Alert is already resolved';
    end if;

    update public.security_anomaly_alerts
    set
      status = 'resolved',
      resolved_by_user_id = v_actor_user_id,
      resolved_at = now(),
      resolution_note = v_resolution_note
    where id = v_alert.id
    returning * into v_updated;

    perform public.log_security_event(
      v_alert.account_id,
      'security_alert_resolved',
      'security_alert',
      v_alert.id,
      jsonb_build_object(
        'alert_type', v_alert.alert_type,
        'title', v_alert.title,
        'old_status', v_alert.status,
        'new_status', v_updated.status,
        'resolution_note', coalesce(v_updated.resolution_note, '')
      )
    );
  end if;

  return v_updated;
end;
$$;

comment on function public.security_anomaly_alert_apply(uuid, text, text, uuid, text) is
  'Applies a privileged analyst lifecycle action to a security anomaly alert and records the action in security_audit_ledger.';

revoke all on function public.security_anomaly_alert_apply(uuid, text, text, uuid, text) from public;
grant execute on function public.security_anomaly_alert_apply(uuid, text, text, uuid, text) to authenticated;
grant execute on function public.security_anomaly_alert_apply(uuid, text, text, uuid, text) to service_role;
