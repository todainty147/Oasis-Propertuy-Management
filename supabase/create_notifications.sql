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

revoke all on function public.create_notifications_system(uuid, uuid[], text, text, text, text, uuid, text, jsonb) from public;
grant execute on function public.create_notifications_system(uuid, uuid[], text, text, text, text, uuid, text, jsonb) to anon;
grant execute on function public.create_notifications_system(uuid, uuid[], text, text, text, text, uuid, text, jsonb) to authenticated;
grant execute on function public.create_notifications_system(uuid, uuid[], text, text, text, text, uuid, text, jsonb) to service_role;
