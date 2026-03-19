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
begin
  perform public.assert_manage_account_access(p_account_id);

  if p_recipient_user_ids is null or coalesce(array_length(p_recipient_user_ids, 1), 0) = 0 then
    raise exception 'Recipient list cannot be empty';
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

revoke all on function public.create_notifications(uuid, uuid[], text, text, text, text, uuid, text, jsonb) from public;
grant execute on function public.create_notifications(uuid, uuid[], text, text, text, text, uuid, text, jsonb) to authenticated;
grant execute on function public.create_notifications(uuid, uuid[], text, text, text, text, uuid, text, jsonb) to service_role;
