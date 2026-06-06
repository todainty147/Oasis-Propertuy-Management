create index if not exists tenants_account_user_id_idx
  on public.tenants (account_id, user_id)
  where user_id is not null;

create index if not exists contractors_account_user_id_active_idx
  on public.contractors (account_id, user_id)
  where user_id is not null and active = true;

create or replace function public.create_notifications(
  p_account_id uuid,
  p_recipient_user_ids uuid[],
  p_type text,
  p_title text,
  p_body text default null::text,
  p_entity_type text default null::text,
  p_entity_id uuid default null::uuid,
  p_link_path text default null::text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_count integer := coalesce(array_length(p_recipient_user_ids, 1), 0);
begin
  begin
    perform public.assert_manage_account_access(p_account_id);
  exception
    when others then
      if sqlerrm = 'Access denied' then
        raise exception using
          errcode = '42501',
          message = 'Access denied',
          detail = public.security_failure_context(
            'create_notifications',
            'manage_account_required',
            p_account_id,
            'notification',
            p_entity_id,
            jsonb_build_object(
              'recipient_count', v_recipient_count,
              'notification_type', lower(coalesce(p_type, ''))
            )
          ),
          hint = 'Only owner, admin, or staff members for the target account can create notifications.';
      end if;
      raise;
  end;

  if p_recipient_user_ids is null or v_recipient_count = 0 then
    raise exception using
      errcode = '22023',
      message = 'Recipient list cannot be empty',
      detail = public.security_failure_context(
        'create_notifications',
        'empty_recipients',
        p_account_id,
        'notification',
        p_entity_id,
        jsonb_build_object(
          'recipient_count', v_recipient_count,
          'notification_type', lower(coalesce(p_type, ''))
        )
      ),
      hint = 'Provide at least one account-scoped recipient before calling create_notifications.';
  end if;

  if v_recipient_count > 250 then
    raise exception using
      errcode = '22023',
      message = 'Recipient list exceeds maximum size',
      detail = public.security_failure_context(
        'create_notifications',
        'recipient_count_exceeded',
        p_account_id,
        'notification',
        p_entity_id,
        jsonb_build_object(
          'recipient_count', v_recipient_count,
          'max_recipients', 250,
          'notification_type', lower(coalesce(p_type, ''))
        )
      ),
      hint = 'Split large notification batches into groups of 250 recipients or fewer.';
  end if;

  if exists (
    select 1
    from unnest(p_recipient_user_ids) uid
    left join public.account_members am
      on am.account_id = p_account_id
     and am.user_id = uid
    left join public.contractors c
      on c.account_id = p_account_id
     and c.user_id = uid
     and c.active = true
    left join public.tenants t
      on t.account_id = p_account_id
     and t.user_id = uid
    where uid is null
       or (
         am.user_id is null
         and c.user_id is null
         and t.user_id is null
       )
  ) then
    raise exception using
      errcode = '42501',
      message = 'One or more recipients are not part of this account',
      detail = public.security_failure_context(
        'create_notifications',
        'foreign_or_invalid_recipient',
        p_account_id,
        'notification',
        p_entity_id,
        jsonb_build_object(
          'recipient_count', v_recipient_count,
          'notification_type', lower(coalesce(p_type, ''))
        )
      ),
      hint = 'Notification recipients must already belong to the target account as members, active contractors, or tenants.';
  end if;

  insert into public.notifications (
    account_id,
    recipient_user_id,
    type,
    title,
    body,
    entity_type,
    entity_id,
    link_path,
    metadata
  )
  select
    p_account_id,
    r.uid,
    p_type,
    p_title,
    p_body,
    p_entity_type,
    p_entity_id,
    p_link_path,
    coalesce(p_metadata, '{}'::jsonb)
  from (
    select distinct uid
    from unnest(p_recipient_user_ids) as uid
    where uid is not null
  ) as r;
end;
$$;

revoke all on function public.create_notifications(uuid, uuid[], text, text, text, text, uuid, text, jsonb) from public;
grant execute on function public.create_notifications(uuid, uuid[], text, text, text, text, uuid, text, jsonb) to authenticated;
grant execute on function public.create_notifications(uuid, uuid[], text, text, text, text, uuid, text, jsonb) to service_role;

create or replace function public.notifications_mark_read(
  p_notification_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_uid uuid := auth.uid();
begin
  if p_notification_id is null then
    return 0;
  end if;

  if v_uid is null then
    begin
      v_uid := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    exception when others then
      v_uid := null;
    end;
  end if;

  if v_uid is null then
    begin
      v_uid := nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub';
    exception when others then
      v_uid := null;
    end;
  end if;

  if v_uid is null then
    return 0;
  end if;

  update public.notifications n
  set is_read = true,
      read_at = coalesce(n.read_at, now())
  where n.id = p_notification_id
    and n.recipient_user_id = v_uid
    and n.is_read = false;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.notifications_mark_read(uuid) from public;
revoke all on function public.notifications_mark_read(uuid) from anon;
grant execute on function public.notifications_mark_read(uuid) to authenticated;
grant execute on function public.notifications_mark_read(uuid) to service_role;

create or replace function public.create_notifications_system(
  p_account_id uuid,
  p_recipient_user_ids uuid[],
  p_type text,
  p_title text,
  p_body text default null::text,
  p_entity_type text default null::text,
  p_entity_id uuid default null::uuid,
  p_link_path text default null::text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_account_id is null then
    raise exception 'account_id is required';
  end if;

  if p_recipient_user_ids is null or array_length(p_recipient_user_ids, 1) is null then
    return;
  end if;

  if exists (
    select 1
    from unnest(p_recipient_user_ids) uid
    left join public.account_members am
      on am.account_id = p_account_id
     and am.user_id = uid
    left join public.contractors c
      on c.account_id = p_account_id
     and c.user_id = uid
     and c.active = true
    left join public.tenants t
      on t.account_id = p_account_id
     and t.user_id = uid
    where uid is null
       or (
         am.user_id is null
         and c.user_id is null
         and t.user_id is null
       )
  ) then
    raise exception 'One or more recipients are not part of this account';
  end if;

  insert into public.notifications (
    account_id,
    recipient_user_id,
    type,
    title,
    body,
    entity_type,
    entity_id,
    link_path,
    metadata
  )
  select
    p_account_id,
    r.uid,
    p_type,
    p_title,
    p_body,
    p_entity_type,
    p_entity_id,
    p_link_path,
    coalesce(p_metadata, '{}'::jsonb)
  from (
    select distinct uid
    from unnest(p_recipient_user_ids) as uid
    where uid is not null
  ) as r;
end;
$$;

-- create_notifications_system is called only from SECURITY DEFINER trigger
-- functions and server-side Edge Functions (service_role).  anon and
-- authenticated must NOT be able to call it directly — a caller with known
-- account/recipient UUIDs could otherwise forge in-app notifications.
revoke all on function public.create_notifications_system(uuid, uuid[], text, text, text, text, uuid, text, jsonb) from public;
revoke all on function public.create_notifications_system(uuid, uuid[], text, text, text, text, uuid, text, jsonb) from anon;
revoke all on function public.create_notifications_system(uuid, uuid[], text, text, text, text, uuid, text, jsonb) from authenticated;
grant execute on function public.create_notifications_system(uuid, uuid[], text, text, text, text, uuid, text, jsonb) to service_role;

create or replace function public.tg_maintenance_request_notify_managers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_user_id uuid;
  v_recipient_user_ids uuid[];
begin
  if new.reported_by_tenant_id is null then
    return new;
  end if;

  select t.user_id
    into v_tenant_user_id
  from public.tenants t
  where t.id = new.reported_by_tenant_id
    and t.account_id = new.account_id
  limit 1;

  select coalesce(array_agg(distinct am.user_id) filter (where am.user_id is not null), '{}'::uuid[])
    into v_recipient_user_ids
  from public.account_members am
  where am.account_id = new.account_id
    and lower(coalesce(am.role::text, '')) not in ('tenant', 'contractor')
    and (v_tenant_user_id is null or am.user_id <> v_tenant_user_id);

  if coalesce(array_length(v_recipient_user_ids, 1), 0) = 0 then
    return new;
  end if;

  perform public.create_notifications_system(
    new.account_id,
    v_recipient_user_ids,
    'maintenance_request_created',
    'Nowe zgłoszenie serwisowe',
    case
      when nullif(new.title, '') is not null then 'Zgłoszenie: ' || new.title
      else 'Utworzono nowe zgłoszenie'
    end,
    'maintenance_request',
    new.id,
    '/maintenance-inbox',
    jsonb_build_object(
      'maintenance_request_id', new.id,
      'property_id', new.property_id,
      'created_by_tenant', true
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_maintenance_request_notify_managers on public.maintenance_requests;
create trigger trg_maintenance_request_notify_managers
  after insert on public.maintenance_requests
  for each row
  execute function public.tg_maintenance_request_notify_managers();
