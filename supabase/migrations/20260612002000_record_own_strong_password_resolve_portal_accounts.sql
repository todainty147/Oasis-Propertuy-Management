-- Resolve account context for tenant and contractor password posture updates.
-- The UI validates password strength before auth writes; this RPC persists the
-- resulting "strong" posture for users who are not ordinary account managers.

create or replace function public.record_own_strong_password()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_account_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Managers and account members.
  select account_id into v_account_id
  from public.account_members
  where user_id = v_user_id
  order by created_at
  limit 1;

  -- Contractor portal users.
  if v_account_id is null then
    select account_id into v_account_id
    from public.contractors
    where user_id = v_user_id
      and active = true
    order by created_at
    limit 1;
  end if;

  -- Tenant portal users.
  if v_account_id is null then
    select account_id into v_account_id
    from public.tenants
    where user_id = v_user_id
      and archived_at is null
    order by created_at
    limit 1;
  end if;

  insert into public.user_security_profile (
    user_id, account_id,
    password_policy_version, password_strength_status,
    password_last_set_at
  )
  values (
    v_user_id, v_account_id,
    1, 'strong',
    now()
  )
  on conflict (user_id) do update
  set
    account_id                = coalesce(excluded.account_id, public.user_security_profile.account_id),
    password_policy_version   = 1,
    password_strength_status  = 'strong',
    password_last_set_at      = now(),
    updated_at                = now();

  if v_account_id is not null then
    perform public.log_security_event(
      v_account_id,
      'auth_password_policy_v1_accepted',
      'user',
      v_user_id,
      jsonb_build_object('policy_version', 1, 'flow', 'self')
    );
  end if;
end;
$$;

grant execute on function public.record_own_strong_password() to authenticated;
