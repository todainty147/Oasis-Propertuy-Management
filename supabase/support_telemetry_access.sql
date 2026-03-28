create table if not exists public.support_account_capabilities (
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  capability text not null,
  granted_by_user_id uuid null references auth.users(id) on delete set null,
  notes text null,
  created_at timestamptz not null default now(),
  expires_at timestamptz null,
  revoked_at timestamptz null,
  primary key (user_id, account_id, capability),
  constraint support_account_capabilities_capability_check check (nullif(trim(capability), '') is not null)
);

comment on table public.support_account_capabilities is
  'Explicit future-support account capabilities that are intentionally separate from landlord/staff memberships.';

create index if not exists support_account_capabilities_account_capability_idx
  on public.support_account_capabilities(account_id, capability, user_id)
  where revoked_at is null;

create index if not exists support_account_capabilities_user_capability_idx
  on public.support_account_capabilities(user_id, capability, account_id)
  where revoked_at is null;

alter table public.support_account_capabilities enable row level security;

revoke all on table public.support_account_capabilities from public;

create or replace function public.user_has_support_account_capability(
  p_account_id uuid,
  p_capability text
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.support_account_capabilities sac
    where sac.user_id = auth.uid()
      and sac.account_id = p_account_id
      and lower(trim(sac.capability)) = lower(trim(coalesce(p_capability, '')))
      and sac.revoked_at is null
      and (sac.expires_at is null or sac.expires_at > now())
  );
$$;

comment on function public.user_has_support_account_capability(uuid, text) is
  'Returns whether the signed-in user has an explicit future-support capability for the given account.';

revoke all on function public.user_has_support_account_capability(uuid, text) from public;
grant execute on function public.user_has_support_account_capability(uuid, text) to authenticated;

create or replace function public.user_can_access_root_telemetry(
  p_account_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.user_is_root_operator()
    or public.user_has_support_account_capability(p_account_id, 'root_telemetry');
$$;

comment on function public.user_can_access_root_telemetry(uuid) is
  'Returns whether the signed-in user can access root-only telemetry for the given account via root membership or explicit support capability.';

revoke all on function public.user_can_access_root_telemetry(uuid) from public;
grant execute on function public.user_can_access_root_telemetry(uuid) to authenticated;

create or replace function public.assert_root_telemetry_access(
  p_account_id uuid
)
returns uuid
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if p_account_id is null then
    raise exception 'Missing account id';
  end if;

  if public.user_can_access_root_telemetry(p_account_id) then
    return p_account_id;
  end if;

  raise exception 'Only authorized root telemetry operators can access this account';
end;
$$;

comment on function public.assert_root_telemetry_access(uuid) is
  'Raises when the signed-in user lacks root telemetry access for the given account.';

revoke all on function public.assert_root_telemetry_access(uuid) from public;
grant execute on function public.assert_root_telemetry_access(uuid) to authenticated;

create or replace function public.assert_security_observability_feed_access(
  p_account_id uuid
)
returns uuid
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if p_account_id is null then
    raise exception 'Missing account id';
  end if;

  if public.user_can_manage_account(p_account_id) or public.user_can_access_root_telemetry(p_account_id) then
    return p_account_id;
  end if;

  raise exception 'Only authorized account operators can access this observability feed';
end;
$$;

comment on function public.assert_security_observability_feed_access(uuid) is
  'Raises when the signed-in user lacks manager or explicit support/root access for the hosted observability feed.';

revoke all on function public.assert_security_observability_feed_access(uuid) from public;
grant execute on function public.assert_security_observability_feed_access(uuid) to authenticated;

create or replace function public.root_telemetry_support_access_list(
  p_account_id uuid
)
returns table (
  user_id uuid,
  user_email text,
  capability text,
  notes text,
  granted_by_user_id uuid,
  granted_by_email text,
  created_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with authz as (
    select p_account_id as account_id
    where public.user_is_root_operator()
  )
  select
    sac.user_id,
    coalesce(u.email, '') as user_email,
    sac.capability,
    sac.notes,
    sac.granted_by_user_id,
    coalesce(grantor.email, '') as granted_by_email,
    sac.created_at,
    sac.expires_at,
    sac.revoked_at
  from public.support_account_capabilities sac
  join authz a on a.account_id = sac.account_id
  left join auth.users u on u.id = sac.user_id
  left join auth.users grantor on grantor.id = sac.granted_by_user_id
  where sac.account_id = a.account_id
  order by
    case when sac.revoked_at is null then 0 else 1 end,
    sac.created_at desc;
$$;

comment on function public.root_telemetry_support_access_list(uuid) is
  'Root-only listing of support telemetry capability grants for a specific account.';

revoke all on function public.root_telemetry_support_access_list(uuid) from public;
grant execute on function public.root_telemetry_support_access_list(uuid) to authenticated;

create or replace function public.root_telemetry_support_access_grant(
  p_account_id uuid,
  p_user_email text,
  p_notes text default null,
  p_expires_at timestamptz default null
)
returns public.support_account_capabilities
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_clean_email text := lower(trim(coalesce(p_user_email, '')));
  v_row public.support_account_capabilities;
begin
  if not public.user_is_root_operator() then
    raise exception 'Only root operators can manage support telemetry access';
  end if;

  if p_account_id is null then
    raise exception 'Missing account id';
  end if;

  if v_clean_email = '' then
    raise exception 'Missing support user email';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Expiry must be in the future';
  end if;

  if not exists (select 1 from public.accounts where id = p_account_id) then
    raise exception 'Account not found';
  end if;

  select u.id
  into v_user_id
  from auth.users u
  where lower(trim(coalesce(u.email, ''))) = v_clean_email
  limit 1;

  if v_user_id is null then
    raise exception 'Support user not found';
  end if;

  insert into public.support_account_capabilities (
    user_id,
    account_id,
    capability,
    granted_by_user_id,
    notes,
    expires_at,
    revoked_at
  )
  values (
    v_user_id,
    p_account_id,
    'root_telemetry',
    auth.uid(),
    nullif(trim(coalesce(p_notes, '')), ''),
    p_expires_at,
    null
  )
  on conflict (user_id, account_id, capability)
  do update
    set granted_by_user_id = auth.uid(),
        notes = excluded.notes,
        expires_at = excluded.expires_at,
        revoked_at = null,
        created_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.root_telemetry_support_access_grant(uuid, text, text, timestamptz) is
  'Root-only grant or refresh of root telemetry support access for a support user identified by email.';

revoke all on function public.root_telemetry_support_access_grant(uuid, text, text, timestamptz) from public;
grant execute on function public.root_telemetry_support_access_grant(uuid, text, text, timestamptz) to authenticated;

create or replace function public.root_telemetry_support_access_revoke(
  p_account_id uuid,
  p_user_id uuid
)
returns public.support_account_capabilities
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.support_account_capabilities;
begin
  if not public.user_is_root_operator() then
    raise exception 'Only root operators can manage support telemetry access';
  end if;

  if p_account_id is null then
    raise exception 'Missing account id';
  end if;

  if p_user_id is null then
    raise exception 'Missing support user id';
  end if;

  update public.support_account_capabilities sac
  set revoked_at = now()
  where sac.account_id = p_account_id
    and sac.user_id = p_user_id
    and lower(sac.capability) = 'root_telemetry'
    and sac.revoked_at is null
  returning * into v_row;

  if v_row.user_id is null then
    raise exception 'Active support telemetry grant not found';
  end if;

  return v_row;
end;
$$;

comment on function public.root_telemetry_support_access_revoke(uuid, uuid) is
  'Root-only revocation of active root telemetry support access for a specific user and account.';

revoke all on function public.root_telemetry_support_access_revoke(uuid, uuid) from public;
grant execute on function public.root_telemetry_support_access_revoke(uuid, uuid) to authenticated;

create or replace function public.root_telemetry_support_operator_directory(
  p_account_id uuid,
  p_query text default null,
  p_limit integer default 10
)
returns table (
  user_id uuid,
  user_email text,
  source text,
  has_root_telemetry boolean,
  current_account_granted boolean,
  current_expires_at timestamptz,
  last_telemetry_access_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  with authz as (
    select p_account_id as account_id
    where public.user_is_root_operator()
  ),
  cfg as (
    select
      nullif(lower(trim(coalesce(p_query, ''))), '') as q,
      greatest(1, least(coalesce(p_limit, 10), 25)) as row_limit
  ),
  candidates as (
    select
      u.id as user_id,
      lower(trim(coalesce(u.email, ''))) as user_email,
      case
        when exists (
          select 1
          from public.support_account_capabilities sac
          where sac.user_id = u.id
        ) then 'existing_grant'
        else 'support_metadata'
      end as source,
      exists (
        select 1
        from public.support_account_capabilities sac
        where sac.user_id = u.id
          and lower(sac.capability) = 'root_telemetry'
          and sac.revoked_at is null
          and (sac.expires_at is null or sac.expires_at > now())
      ) as has_root_telemetry
    from auth.users u
    cross join authz
    cross join cfg
    where nullif(lower(trim(coalesce(u.email, ''))), '') is not null
      and (
        coalesce((u.raw_app_meta_data ->> 'support_operator')::boolean, false)
        or coalesce((u.raw_user_meta_data ->> 'support_operator')::boolean, false)
        or coalesce((u.raw_app_meta_data ->> 'root_telemetry_access')::boolean, false)
        or coalesce((u.raw_user_meta_data ->> 'root_telemetry_access')::boolean, false)
        or coalesce(u.raw_app_meta_data -> 'oasis_support_roles', '[]'::jsonb) ?| array['telemetry', 'root_telemetry']
        or coalesce(u.raw_user_meta_data -> 'oasis_support_roles', '[]'::jsonb) ?| array['telemetry', 'root_telemetry']
        or exists (
          select 1
          from public.support_account_capabilities sac
          where sac.user_id = u.id
        )
      )
      and (
        cfg.q is null
        or lower(trim(coalesce(u.email, ''))) like '%' || cfg.q || '%'
      )
  )
  select
    c.user_id,
    c.user_email,
    c.source,
    c.has_root_telemetry,
    exists (
      select 1
      from public.support_account_capabilities sac
      where sac.user_id = c.user_id
        and sac.account_id = (select account_id from authz)
        and lower(sac.capability) = 'root_telemetry'
        and sac.revoked_at is null
        and (sac.expires_at is null or sac.expires_at > now())
    ) as current_account_granted,
    (
      select sac.expires_at
      from public.support_account_capabilities sac
      where sac.user_id = c.user_id
        and sac.account_id = (select account_id from authz)
        and lower(sac.capability) = 'root_telemetry'
        and sac.revoked_at is null
      order by sac.created_at desc
      limit 1
    ) as current_expires_at,
    (
      select max(e.created_at)
      from public.security_observability_events e
      where e.account_id = (select account_id from authz)
        and e.actor_user_id = c.user_id
        and lower(coalesce(e.category, '')) = 'root_telemetry'
    ) as last_telemetry_access_at
  from candidates c
  order by
    current_account_granted desc,
    c.has_root_telemetry desc,
    c.source asc,
    c.user_email asc
  limit (select row_limit from cfg);
$$;

comment on function public.root_telemetry_support_operator_directory(uuid, text, integer) is
  'Root-only searchable directory of known support operators with account-aware grant and recent telemetry usage context.';

revoke all on function public.root_telemetry_support_operator_directory(uuid, text, integer) from public;
grant execute on function public.root_telemetry_support_operator_directory(uuid, text, integer) to authenticated;
