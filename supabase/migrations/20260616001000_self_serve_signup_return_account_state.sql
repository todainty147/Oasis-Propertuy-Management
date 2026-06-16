-- Return real account subscription/trial state from self-serve signup.

begin;

create or replace function public.create_self_serve_landlord_account(
  p_account_name text default null,
  p_sandbox_mode boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_name text := trim(coalesce(p_account_name, ''));
  v_existing_owner_account_id uuid;
  v_existing_owner_account_name text;
  v_existing_subscription_plan text;
  v_existing_subscription_status text;
  v_existing_billing_locked_at timestamptz;
  v_existing_trial_ends_at timestamptz;
  v_existing_trial_source text;
  v_existing_any_non_owner boolean := false;
  v_existing_other_owner_user uuid;
  v_new_account_id uuid;
  v_new_subscription_plan text;
  v_new_subscription_status text;
  v_new_billing_locked_at timestamptz;
  v_new_trial_ends_at timestamptz;
  v_new_trial_source text;
  v_sandbox_mode text;
  v_sandbox_lifecycle_status text;
  v_demo_expires_at timestamptz;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select lower(u.email::text)
  into v_email
  from auth.users u
  where u.id = v_uid
  limit 1;

  if coalesce(v_email, '') = '' then
    raise exception 'Authenticated email not found';
  end if;

  select a.id, a.name, a.subscription_plan, a.subscription_status, a.billing_locked_at, a.trial_ends_at, a.trial_source
  into v_existing_owner_account_id, v_existing_owner_account_name,
       v_existing_subscription_plan, v_existing_subscription_status, v_existing_billing_locked_at,
       v_existing_trial_ends_at, v_existing_trial_source
  from public.account_members am
  join public.accounts a on a.id = am.account_id
  where am.user_id = v_uid
    and public.account_member_effective_role(am.account_id, am.user_id) = 'owner'
  order by a.created_at asc nulls last, a.id
  limit 1;

  if v_existing_owner_account_id is not null then
    select coalesce(asp.mode, 'production'), coalesce(asp.lifecycle_status, 'active'), asp.demo_expires_at
    into v_sandbox_mode, v_sandbox_lifecycle_status, v_demo_expires_at
    from (select v_existing_owner_account_id as account_id) scope
    left join public.account_sandbox_profiles asp on asp.account_id = scope.account_id;

    return jsonb_build_object(
      'ok', true,
      'created', false,
      'account_id', v_existing_owner_account_id,
      'account_name', v_existing_owner_account_name,
      'role', 'owner',
      'subscription_plan', v_existing_subscription_plan,
      'subscription_status', v_existing_subscription_status,
      'billing_locked_at', v_existing_billing_locked_at,
      'trial_ends_at', v_existing_trial_ends_at,
      'trial_source', v_existing_trial_source,
      'sandbox_mode', v_sandbox_mode,
      'sandbox_lifecycle_status', v_sandbox_lifecycle_status,
      'demo_expires_at', v_demo_expires_at
    );
  end if;

  select exists (
    select 1
    from public.account_members am
    where am.user_id = v_uid
      and public.account_member_effective_role(am.account_id, am.user_id) <> 'owner'
  )
  into v_existing_any_non_owner;

  if v_existing_any_non_owner then
    raise exception 'This user already belongs to an invited account; landlord self-signup is not allowed';
  end if;

  select am.user_id
  into v_existing_other_owner_user
  from public.account_members am
  join auth.users u on u.id = am.user_id
  where lower(u.email::text) = v_email
    and public.account_member_effective_role(am.account_id, am.user_id) = 'owner'
    and am.user_id <> v_uid
  limit 1;

  if v_existing_other_owner_user is not null then
    raise exception 'This email is already used by an existing landlord account';
  end if;

  if v_name = '' then
    v_name := split_part(v_email, '@', 1);
  end if;

  insert into public.accounts(name, created_by, trial_ends_at, trial_source)
  values (v_name, v_uid, now() + interval '14 days', 'self_serve_signup')
  returning id, subscription_plan, subscription_status, billing_locked_at, trial_ends_at, trial_source
  into v_new_account_id, v_new_subscription_plan, v_new_subscription_status, v_new_billing_locked_at,
       v_new_trial_ends_at, v_new_trial_source;

  insert into public.account_members(account_id, user_id, role)
  values (v_new_account_id, v_uid, 'owner')
  on conflict (account_id, user_id) do update set role = excluded.role;

  insert into public.account_sandbox_profiles(
    account_id,
    mode,
    lifecycle_status,
    seeded_fixture_version,
    demo_expires_at,
    created_by,
    updated_by
  )
  values (
    v_new_account_id,
    case when coalesce(p_sandbox_mode, false) then 'demo' else 'production' end,
    'active',
    null,
    case when coalesce(p_sandbox_mode, false) then now() + interval '14 days' else null end,
    v_uid,
    v_uid
  )
  on conflict (account_id) do nothing;

  if coalesce(p_sandbox_mode, false) then
    begin
      perform public.seed_demo_account_fixtures(v_new_account_id, false);
    exception
      when others then
        update public.account_sandbox_profiles
        set lifecycle_status = 'active',
            updated_by = v_uid
        where account_id = v_new_account_id;
    end;
  end if;

  select coalesce(asp.mode, 'production'), coalesce(asp.lifecycle_status, 'active'), asp.demo_expires_at
  into v_sandbox_mode, v_sandbox_lifecycle_status, v_demo_expires_at
  from (select v_new_account_id as account_id) scope
  left join public.account_sandbox_profiles asp on asp.account_id = scope.account_id;

  return jsonb_build_object(
    'ok', true,
    'created', true,
    'account_id', v_new_account_id,
    'account_name', v_name,
    'role', 'owner',
    'subscription_plan', v_new_subscription_plan,
    'subscription_status', v_new_subscription_status,
    'billing_locked_at', v_new_billing_locked_at,
    'trial_ends_at', v_new_trial_ends_at,
    'trial_source', v_new_trial_source,
    'sandbox_mode', v_sandbox_mode,
    'sandbox_lifecycle_status', v_sandbox_lifecycle_status,
    'demo_expires_at', v_demo_expires_at
  );
end;
$$;

revoke execute on function public.create_self_serve_landlord_account(text, boolean) from anon;
grant execute on function public.create_self_serve_landlord_account(text, boolean) to authenticated;

commit;
