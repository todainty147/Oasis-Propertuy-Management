-- OASIS data retention, deletion request, export request, and mobile privacy foundation.
-- Additive migration. Operational record deletion is intentionally routed through
-- privileged RPCs and processing logs rather than exposed as client-side deletes.

alter table public.accounts
  add column if not exists account_status text not null default 'active';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'accounts_account_status_check'
      and conrelid = 'public.accounts'::regclass
  ) then
    alter table public.accounts
      add constraint accounts_account_status_check
      check (account_status in (
        'active',
        'suspended',
        'closure_pending',
        'closed',
        'deletion_scheduled',
        'deleted'
      ));
  end if;
end $$;

create table if not exists public.data_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid null references public.accounts(id) on delete set null,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null check (request_type in (
    'user_account_deletion',
    'membership_removal',
    'workspace_closure',
    'tenant_data_erasure',
    'contractor_data_erasure'
  )),
  scope text not null check (scope in ('user', 'account', 'tenant', 'contractor')),
  target_user_id uuid null references auth.users(id) on delete set null,
  target_tenant_id uuid null references public.tenants(id) on delete set null,
  target_contractor_id uuid null references public.contractors(id) on delete set null,
  status text not null default 'submitted' check (status in (
    'submitted',
    'identity_verification_required',
    'pending_admin_review',
    'pending_retention_review',
    'approved',
    'scheduled',
    'completed',
    'partially_completed',
    'rejected',
    'cancelled'
  )),
  reason text null,
  requester_notes text null,
  admin_notes text null,
  retention_summary jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz null,
  completed_at timestamptz null,
  rejected_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint data_deletion_requests_scope_target_check check (
    (scope = 'user' and target_tenant_id is null and target_contractor_id is null)
    or (scope = 'account' and account_id is not null and target_tenant_id is null and target_contractor_id is null)
    or (scope = 'tenant' and target_tenant_id is not null and target_contractor_id is null)
    or (scope = 'contractor' and target_contractor_id is not null and target_tenant_id is null)
  )
);

create table if not exists public.data_deletion_processing_log (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.data_deletion_requests(id) on delete cascade,
  account_id uuid null references public.accounts(id) on delete set null,
  action text not null check (action in (
    'delete',
    'anonymise',
    'restrict_access',
    'retain_with_reason',
    'revoke_token',
    'remove_membership',
    'delete_auth_user'
  )),
  entity_type text not null,
  entity_id uuid null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'skipped')),
  retention_reason text null,
  error_message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.data_export_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid null references public.accounts(id) on delete set null,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  export_type text not null check (export_type in ('user', 'tenant', 'contractor', 'account')),
  status text not null default 'requested' check (status in ('requested', 'processing', 'completed', 'failed', 'expired')),
  storage_path text null,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null
);

create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid null references public.accounts(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  push_token text not null,
  device_label text null,
  app_version text null,
  last_seen_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists data_deletion_requests_requester_idx
  on public.data_deletion_requests(requester_user_id, created_at desc);
create index if not exists data_deletion_requests_account_idx
  on public.data_deletion_requests(account_id, created_at desc);
create index if not exists data_deletion_requests_status_idx
  on public.data_deletion_requests(status, created_at desc);
create index if not exists data_deletion_processing_log_request_idx
  on public.data_deletion_processing_log(request_id, created_at);
create index if not exists data_export_requests_requester_idx
  on public.data_export_requests(requester_user_id, created_at desc);
create index if not exists user_devices_user_idx
  on public.user_devices(user_id, revoked_at);
create index if not exists user_devices_account_idx
  on public.user_devices(account_id, revoked_at);

create or replace function public.data_privacy_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_data_deletion_requests_set_updated_at on public.data_deletion_requests;
create trigger trg_data_deletion_requests_set_updated_at
before update on public.data_deletion_requests
for each row execute function public.data_privacy_set_updated_at();

create or replace function public.user_can_admin_account(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    public.user_is_root_operator()
    or public.account_member_effective_role(p_account_id, auth.uid()) in ('owner', 'admin')
  ), false);
$$;

create or replace function public.user_owns_tenant_profile(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenants t
    where t.id = p_tenant_id
      and t.user_id = auth.uid()
  );
$$;

create or replace function public.user_owns_contractor_profile(p_contractor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.contractors c
    where c.id = p_contractor_id
      and c.user_id = auth.uid()
  );
$$;

create or replace function public.user_can_view_data_deletion_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.data_deletion_requests r
    where r.id = p_request_id
      and (
        r.requester_user_id = auth.uid()
        or public.user_is_root_operator()
        or (r.account_id is not null and public.user_can_admin_account(r.account_id))
      )
  );
$$;

create or replace function public.insert_data_privacy_log(
  p_request_id uuid,
  p_account_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_status text default 'completed',
  p_retention_reason text default null,
  p_error_message text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.data_deletion_processing_log (
    request_id,
    account_id,
    action,
    entity_type,
    entity_id,
    status,
    retention_reason,
    error_message,
    metadata
  )
  values (
    p_request_id,
    p_account_id,
    p_action,
    p_entity_type,
    p_entity_id,
    coalesce(p_status, 'completed'),
    p_retention_reason,
    p_error_message,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.revoke_user_devices(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_push_count integer := 0;
begin
  if p_user_id is null then
    raise exception 'Missing user id';
  end if;

  update public.user_devices
  set revoked_at = now(),
      push_token = 'revoked:' || id::text,
      device_label = null,
      app_version = null
  where user_id = p_user_id
    and revoked_at is null;
  get diagnostics v_count = row_count;

  if to_regclass('public.device_push_tokens') is not null then
    update public.device_push_tokens
    set is_active = false,
        token = 'revoked:' || id::text,
        updated_at = now()
    where user_id = p_user_id
      and coalesce(is_active, true) = true;
    get diagnostics v_push_count = row_count;
  end if;

  return v_count + v_push_count;
end;
$$;

create or replace function public.remove_user_memberships(
  p_user_id uuid,
  p_account_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_user_id is null then
    raise exception 'Missing user id';
  end if;

  delete from public.account_members am
  where am.user_id = p_user_id
    and (p_account_id is null or am.account_id = p_account_id)
    and not exists (
      select 1
      from public.accounts a
      where a.id = am.account_id
        and coalesce(a.is_root, false) = true
    );
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

create or replace function public.anonymise_user_profile(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_user_id is null then
    raise exception 'Missing user id';
  end if;

  if to_regclass('public.profiles') is null then
    return 0;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'full_name'
  ) then
    execute 'update public.profiles set full_name = $1 where id = $2'
    using 'Deleted user', p_user_id;
    get diagnostics v_count = row_count;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'name'
  ) then
    execute 'update public.profiles set name = $1 where id = $2'
    using 'Deleted user', p_user_id;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'display_name'
  ) then
    execute 'update public.profiles set display_name = $1 where id = $2'
    using 'Deleted user', p_user_id;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'email'
  ) then
    execute 'update public.profiles set email = null where id = $1'
    using p_user_id;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'phone'
  ) then
    execute 'update public.profiles set phone = null where id = $1'
    using p_user_id;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_url'
  ) then
    execute 'update public.profiles set avatar_url = null where id = $1'
    using p_user_id;
  end if;

  return v_count;
end;
$$;

create or replace function public.anonymise_tenant_profile(p_tenant_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_tenant_id is null then
    raise exception 'Missing tenant id';
  end if;

  update public.tenants
  set name = 'Deleted tenant',
      email = null,
      phone = null,
      risk_note = null,
      user_id = null
  where id = p_tenant_id;
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

create or replace function public.anonymise_contractor_profile(p_contractor_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_contractor_id is null then
    raise exception 'Missing contractor id';
  end if;

  update public.contractors
  set name = 'Deleted contractor',
      email = null,
      phone = null,
      user_id = null,
      active = false,
      updated_at = now()
  where id = p_contractor_id;
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

create or replace function public.create_retention_summary(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_summary jsonb;
begin
  select jsonb_build_object(
    'delete', coalesce(count(*) filter (where action = 'delete'), 0),
    'anonymise', coalesce(count(*) filter (where action = 'anonymise'), 0),
    'restrict_access', coalesce(count(*) filter (where action = 'restrict_access'), 0),
    'retain_with_reason', coalesce(count(*) filter (where action = 'retain_with_reason'), 0),
    'revoke_token', coalesce(count(*) filter (where action = 'revoke_token'), 0),
    'remove_membership', coalesce(count(*) filter (where action = 'remove_membership'), 0),
    'delete_auth_user', coalesce(count(*) filter (where action = 'delete_auth_user'), 0),
    'pending', coalesce(count(*) filter (where status = 'pending'), 0),
    'failed', coalesce(count(*) filter (where status = 'failed'), 0),
    'skipped', coalesce(count(*) filter (where status = 'skipped'), 0),
    'generated_at', now()
  )
  into v_summary
  from public.data_deletion_processing_log
  where request_id = p_request_id;

  return coalesce(v_summary, '{}'::jsonb);
end;
$$;

create or replace function public.submit_data_deletion_request(
  p_account_id uuid,
  p_request_type text,
  p_scope text,
  p_target_user_id uuid default null,
  p_target_tenant_id uuid default null,
  p_target_contractor_id uuid default null,
  p_reason text default null,
  p_requester_notes text default null
)
returns public.data_deletion_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_request public.data_deletion_requests;
  v_tenant_account uuid;
  v_contractor_account uuid;
  v_action text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_request_type not in ('user_account_deletion', 'membership_removal', 'workspace_closure', 'tenant_data_erasure', 'contractor_data_erasure') then
    raise exception 'Invalid request type';
  end if;

  if p_scope not in ('user', 'account', 'tenant', 'contractor') then
    raise exception 'Invalid request scope';
  end if;

  if p_request_type = 'workspace_closure' then
    if p_account_id is null or not public.user_can_admin_account(p_account_id) then
      raise exception 'Access denied';
    end if;
  elsif p_request_type in ('user_account_deletion', 'membership_removal') then
    if coalesce(p_target_user_id, v_uid) <> v_uid
      and not (p_account_id is not null and public.user_can_admin_account(p_account_id)) then
      raise exception 'Access denied';
    end if;
    if p_account_id is not null
      and not (public.user_can_manage_account(p_account_id) or coalesce(p_target_user_id, v_uid) = v_uid) then
      raise exception 'Access denied';
    end if;
  elsif p_request_type = 'tenant_data_erasure' then
    select account_id into v_tenant_account
    from public.tenants
    where id = p_target_tenant_id;
    if v_tenant_account is null then
      raise exception 'Tenant not found';
    end if;
    if p_account_id is not null and p_account_id <> v_tenant_account then
      raise exception 'Cross-account request denied';
    end if;
    if not (public.user_owns_tenant_profile(p_target_tenant_id) or public.user_can_admin_account(v_tenant_account)) then
      raise exception 'Access denied';
    end if;
    p_account_id := v_tenant_account;
  elsif p_request_type = 'contractor_data_erasure' then
    select account_id into v_contractor_account
    from public.contractors
    where id = p_target_contractor_id;
    if v_contractor_account is null then
      raise exception 'Contractor not found';
    end if;
    if p_account_id is not null and p_account_id <> v_contractor_account then
      raise exception 'Cross-account request denied';
    end if;
    if not (public.user_owns_contractor_profile(p_target_contractor_id) or public.user_can_admin_account(v_contractor_account)) then
      raise exception 'Access denied';
    end if;
    p_account_id := v_contractor_account;
  end if;

  insert into public.data_deletion_requests (
    account_id,
    requester_user_id,
    request_type,
    scope,
    target_user_id,
    target_tenant_id,
    target_contractor_id,
    status,
    reason,
    requester_notes
  )
  values (
    p_account_id,
    v_uid,
    p_request_type,
    p_scope,
    coalesce(p_target_user_id, case when p_scope = 'user' then v_uid else null end),
    p_target_tenant_id,
    p_target_contractor_id,
    case when p_request_type = 'workspace_closure' then 'pending_admin_review' else 'submitted' end,
    nullif(trim(coalesce(p_reason, '')), ''),
    nullif(trim(coalesce(p_requester_notes, '')), '')
  )
  returning * into v_request;

  v_action := case
    when p_request_type = 'workspace_closure' then 'workspace_closure_requested'
    else 'data_deletion_requested'
  end;

  if p_account_id is not null then
    perform public.log_security_event(
      p_account_id,
      v_action,
      'data_deletion_request',
      v_request.id,
      jsonb_build_object('request_type', p_request_type, 'scope', p_scope)
    );
  end if;

  return v_request;
end;
$$;

create or replace function public.submit_data_export_request(
  p_account_id uuid,
  p_export_type text
)
returns public.data_export_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_request public.data_export_requests;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_export_type not in ('user', 'tenant', 'contractor', 'account') then
    raise exception 'Invalid export type';
  end if;

  if p_export_type = 'account' and (p_account_id is null or not public.user_can_admin_account(p_account_id)) then
    raise exception 'Access denied';
  end if;

  if p_account_id is not null and not public.user_can_manage_account(p_account_id) then
    raise exception 'Access denied';
  end if;

  insert into public.data_export_requests (
    account_id,
    requester_user_id,
    export_type,
    status
  )
  values (
    p_account_id,
    v_uid,
    p_export_type,
    'requested'
  )
  returning * into v_request;

  if p_account_id is not null then
    perform public.log_security_event(
      p_account_id,
      'data_export_requested',
      'data_export_request',
      v_request.id,
      jsonb_build_object('export_type', p_export_type)
    );
  end if;

  return v_request;
end;
$$;

create or replace function public.admin_update_data_deletion_request(
  p_request_id uuid,
  p_status text,
  p_admin_notes text default null,
  p_rejected_reason text default null,
  p_scheduled_for timestamptz default null
)
returns public.data_deletion_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.data_deletion_requests;
  v_action text;
begin
  select * into v_request
  from public.data_deletion_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Request not found';
  end if;

  if not (
    public.user_is_root_operator()
    or (v_request.account_id is not null and public.user_can_admin_account(v_request.account_id))
  ) then
    raise exception 'Access denied';
  end if;

  if p_status not in (
    'identity_verification_required',
    'pending_admin_review',
    'pending_retention_review',
    'approved',
    'scheduled',
    'completed',
    'partially_completed',
    'rejected',
    'cancelled'
  ) then
    raise exception 'Invalid status';
  end if;

  update public.data_deletion_requests
  set status = p_status,
      admin_notes = coalesce(nullif(trim(coalesce(p_admin_notes, '')), ''), admin_notes),
      rejected_reason = case when p_status = 'rejected' then nullif(trim(coalesce(p_rejected_reason, '')), '') else rejected_reason end,
      scheduled_for = case when p_status = 'scheduled' then p_scheduled_for else scheduled_for end,
      completed_at = case when p_status in ('completed', 'partially_completed') then now() else completed_at end
  where id = p_request_id
  returning * into v_request;

  v_action := case
    when p_status = 'completed' and v_request.request_type = 'workspace_closure' then 'workspace_closed'
    when p_status = 'identity_verification_required' then 'data_deletion_identity_verification_required'
    when p_status = 'approved' then 'data_deletion_approved'
    when p_status = 'rejected' then 'data_deletion_rejected'
    when p_status = 'scheduled' then 'data_deletion_scheduled'
    when p_status = 'completed' then 'data_deletion_completed'
    when p_status = 'partially_completed' then 'data_deletion_partially_completed'
    else 'data_deletion_review_updated'
  end;

  if v_request.account_id is not null then
    perform public.log_security_event(
      v_request.account_id,
      v_action,
      'data_deletion_request',
      v_request.id,
      jsonb_build_object('status', p_status)
    );
  end if;

  return v_request;
end;
$$;

create or replace function public.complete_data_export_request(
  p_request_id uuid,
  p_storage_path text,
  p_expires_at timestamptz default null
)
returns public.data_export_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.data_export_requests;
begin
  select * into v_request
  from public.data_export_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Export request not found';
  end if;

  if not (
    public.user_is_root_operator()
    or auth.role() = 'service_role'
    or (v_request.account_id is not null and public.user_can_admin_account(v_request.account_id))
  ) then
    raise exception 'Access denied';
  end if;

  update public.data_export_requests
  set status = 'completed',
      storage_path = nullif(trim(coalesce(p_storage_path, '')), ''),
      expires_at = coalesce(p_expires_at, now() + interval '7 days'),
      completed_at = now()
  where id = p_request_id
  returning * into v_request;

  if v_request.account_id is not null then
    perform public.log_security_event(
      v_request.account_id,
      'data_export_completed',
      'data_export_request',
      v_request.id,
      jsonb_build_object('export_type', v_request.export_type, 'expires_at', v_request.expires_at)
    );
  end if;

  return v_request;
end;
$$;

create or replace function public.mark_data_deletion_auth_user_deleted(
  p_request_id uuid,
  p_user_id uuid
)
returns public.data_deletion_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.data_deletion_requests;
begin
  select * into v_request
  from public.data_deletion_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Request not found';
  end if;

  if not (public.user_is_root_operator() or auth.role() = 'service_role') then
    raise exception 'Access denied';
  end if;

  update public.data_deletion_processing_log
  set status = 'completed',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('completed_at', now())
  where request_id = p_request_id
    and action = 'delete_auth_user'
    and entity_type = 'auth.users'
    and entity_id = p_user_id;

  if v_request.account_id is not null then
    perform public.log_security_event(
      v_request.account_id,
      'auth_user_deleted',
      'auth.users',
      p_user_id,
      jsonb_build_object('data_deletion_request_id', p_request_id)
    );
  end if;

  return v_request;
end;
$$;

create or replace function public.process_data_deletion_request(p_request_id uuid)
returns public.data_deletion_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.data_deletion_requests;
  v_target_user uuid;
  v_count integer := 0;
  v_summary jsonb;
  v_failed integer := 0;
  v_pending integer := 0;
begin
  select * into v_request
  from public.data_deletion_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Request not found';
  end if;

  if not (
    public.user_is_root_operator()
    or auth.role() = 'service_role'
    or (v_request.account_id is not null and public.user_can_admin_account(v_request.account_id))
  ) then
    raise exception 'Access denied';
  end if;

  if v_request.status not in ('approved', 'scheduled', 'pending_retention_review') then
    raise exception 'Request must be approved, scheduled, or pending retention review before processing';
  end if;

  v_target_user := coalesce(v_request.target_user_id, v_request.requester_user_id);

  update public.data_deletion_requests
  set status = 'pending_retention_review'
  where id = v_request.id
  returning * into v_request;

  perform public.insert_data_privacy_log(
    v_request.id,
    v_request.account_id,
    'retain_with_reason',
    'finance_ledger',
    null,
    'completed',
    'Accounting, tax, fraud prevention, dispute resolution, and append-only ledger integrity.',
    null,
    jsonb_build_object('tables', jsonb_build_array('ledger_entries', 'payments', 'expected_charges', 'payment_events'))
  );

  perform public.insert_data_privacy_log(
    v_request.id,
    v_request.account_id,
    'retain_with_reason',
    'audit_security_logs',
    null,
    'completed',
    'Security integrity, fraud prevention, abuse investigation, and audit evidence.',
    null,
    jsonb_build_object('tables', jsonb_build_array('security_audit_ledger', 'security_observability_events'))
  );

  perform public.insert_data_privacy_log(
    v_request.id,
    v_request.account_id,
    'retain_with_reason',
    'compliance_records',
    null,
    'completed',
    'Legal, tax, safety, regulatory, and dispute-resolution retention.',
    null,
    '{}'::jsonb
  );

  if v_request.account_id is not null then
    perform public.log_security_event(
      v_request.account_id,
      'records_retained_with_reason',
      'data_deletion_request',
      v_request.id,
      jsonb_build_object(
        'retained', jsonb_build_array('finance_ledger', 'audit_security_logs', 'compliance_records')
      )
    );
  end if;

  if v_request.request_type in ('user_account_deletion', 'membership_removal') then
    v_count := public.revoke_user_devices(v_target_user);
    perform public.insert_data_privacy_log(
      v_request.id,
      v_request.account_id,
      'revoke_token',
      'user_devices',
      v_target_user,
      'completed',
      'Device tokens are not required after account deletion or membership removal.',
      null,
      jsonb_build_object('rows_affected', v_count)
    );

    if v_request.account_id is not null then
      perform public.log_security_event(
        v_request.account_id,
        'device_tokens_revoked',
        'auth.users',
        v_target_user,
        jsonb_build_object('data_deletion_request_id', v_request.id, 'rows_affected', v_count)
      );
    end if;

    if to_regclass('public.notifications') is not null then
      delete from public.notifications
      where recipient_user_id = v_target_user
        and (v_request.account_id is null or account_id = v_request.account_id);
      get diagnostics v_count = row_count;
      perform public.insert_data_privacy_log(
        v_request.id,
        v_request.account_id,
        'delete',
        'notifications',
        v_target_user,
        'completed',
        'User-facing notification records are transient and eligible for deletion.',
        null,
        jsonb_build_object('rows_affected', v_count)
      );
    end if;

    v_count := public.remove_user_memberships(v_target_user, v_request.account_id);
    perform public.insert_data_privacy_log(
      v_request.id,
      v_request.account_id,
      'remove_membership',
      'account_members',
      v_target_user,
      'completed',
      'Membership grants access and can be removed without destroying account operational records.',
      null,
      jsonb_build_object('rows_affected', v_count)
    );

    if v_request.account_id is not null then
      perform public.log_security_event(
        v_request.account_id,
        'records_anonymised',
        'profiles',
        v_target_user,
        jsonb_build_object('data_deletion_request_id', v_request.id, 'rows_affected', v_count)
      );
    end if;

    v_count := public.anonymise_user_profile(v_target_user);
    perform public.insert_data_privacy_log(
      v_request.id,
      v_request.account_id,
      'anonymise',
      'profiles',
      v_target_user,
      'completed',
      'User profile personal fields are minimised while preserving referential integrity.',
      null,
      jsonb_build_object('rows_affected', v_count)
    );

    perform public.insert_data_privacy_log(
      v_request.id,
      v_request.account_id,
      'delete_auth_user',
      'auth.users',
      v_target_user,
      'pending',
      'Supabase Auth user deletion requires service-role auth admin processing after retention review.',
      null,
      '{}'::jsonb
    );
  end if;

  if v_request.request_type = 'tenant_data_erasure' then
    v_count := public.anonymise_tenant_profile(v_request.target_tenant_id);
    perform public.insert_data_privacy_log(
      v_request.id,
      v_request.account_id,
      'anonymise',
      'tenants',
      v_request.target_tenant_id,
      'completed',
      'Tenant profile contact fields are minimised while tenancy, finance, safety, and compliance records are retained.',
      null,
      jsonb_build_object('rows_affected', v_count)
    );

    if v_request.account_id is not null then
      perform public.log_security_event(
        v_request.account_id,
        'records_anonymised',
        'tenants',
        v_request.target_tenant_id,
        jsonb_build_object('data_deletion_request_id', v_request.id, 'rows_affected', v_count)
      );
    end if;
  end if;

  if v_request.request_type = 'contractor_data_erasure' then
    v_count := public.anonymise_contractor_profile(v_request.target_contractor_id);
    perform public.insert_data_privacy_log(
      v_request.id,
      v_request.account_id,
      'anonymise',
      'contractors',
      v_request.target_contractor_id,
      'completed',
      'Contractor profile contact fields are minimised while work order, invoice, warranty, and safety records are retained.',
      null,
      jsonb_build_object('rows_affected', v_count)
    );

    if v_request.account_id is not null then
      perform public.log_security_event(
        v_request.account_id,
        'records_anonymised',
        'contractors',
        v_request.target_contractor_id,
        jsonb_build_object('data_deletion_request_id', v_request.id, 'rows_affected', v_count)
      );
    end if;
  end if;

  if v_request.request_type = 'workspace_closure' then
    update public.accounts
    set account_status = 'closure_pending'
    where id = v_request.account_id
      and account_status not in ('deleted', 'closed');
    perform public.insert_data_privacy_log(
      v_request.id,
      v_request.account_id,
      'restrict_access',
      'accounts',
      v_request.account_id,
      'completed',
      'Workspace closure restricts future access while retained operational records complete review.',
      null,
      jsonb_build_object('account_status', 'closure_pending')
    );
  end if;

  v_summary := public.create_retention_summary(v_request.id);
  v_failed := coalesce((v_summary->>'failed')::integer, 0);
  v_pending := coalesce((v_summary->>'pending')::integer, 0);

  update public.data_deletion_requests
  set status = case when v_failed > 0 or v_pending > 0 then 'partially_completed' else 'completed' end,
      retention_summary = v_summary,
      completed_at = now()
  where id = v_request.id
  returning * into v_request;

  if v_request.account_id is not null then
    perform public.log_security_event(
      v_request.account_id,
      case when v_request.status = 'partially_completed' then 'data_deletion_partially_completed' else 'data_deletion_completed' end,
      'data_deletion_request',
      v_request.id,
      v_summary
    );
  end if;

  return v_request;
end;
$$;

alter table public.data_deletion_requests enable row level security;
alter table public.data_deletion_processing_log enable row level security;
alter table public.data_export_requests enable row level security;
alter table public.user_devices enable row level security;

drop policy if exists data_deletion_requests_select_scoped on public.data_deletion_requests;
create policy data_deletion_requests_select_scoped
on public.data_deletion_requests
for select
to authenticated
using (
  requester_user_id = auth.uid()
  or public.user_is_root_operator()
  or (account_id is not null and public.user_can_admin_account(account_id))
);

drop policy if exists data_deletion_requests_insert_self_or_admin on public.data_deletion_requests;
create policy data_deletion_requests_insert_self_or_admin
on public.data_deletion_requests
for insert
to authenticated
with check (
  requester_user_id = auth.uid()
  and (
    public.user_is_root_operator()
    or request_type in ('user_account_deletion', 'membership_removal')
    or (request_type = 'workspace_closure' and account_id is not null and public.user_can_admin_account(account_id))
    or (request_type = 'tenant_data_erasure' and target_tenant_id is not null and (public.user_owns_tenant_profile(target_tenant_id) or public.user_can_admin_account(account_id)))
    or (request_type = 'contractor_data_erasure' and target_contractor_id is not null and (public.user_owns_contractor_profile(target_contractor_id) or public.user_can_admin_account(account_id)))
  )
);

drop policy if exists data_deletion_requests_update_admin on public.data_deletion_requests;
create policy data_deletion_requests_update_admin
on public.data_deletion_requests
for update
to authenticated
using (public.user_is_root_operator() or (account_id is not null and public.user_can_admin_account(account_id)))
with check (public.user_is_root_operator() or (account_id is not null and public.user_can_admin_account(account_id)));

drop policy if exists data_deletion_processing_log_select_privileged on public.data_deletion_processing_log;
create policy data_deletion_processing_log_select_privileged
on public.data_deletion_processing_log
for select
to authenticated
using (
  public.user_is_root_operator()
  or (account_id is not null and public.user_can_admin_account(account_id))
);

drop policy if exists data_export_requests_select_scoped on public.data_export_requests;
create policy data_export_requests_select_scoped
on public.data_export_requests
for select
to authenticated
using (
  requester_user_id = auth.uid()
  or public.user_is_root_operator()
  or (account_id is not null and public.user_can_admin_account(account_id))
);

drop policy if exists data_export_requests_insert_self on public.data_export_requests;
create policy data_export_requests_insert_self
on public.data_export_requests
for insert
to authenticated
with check (
  requester_user_id = auth.uid()
  and (
    export_type <> 'account'
    or (account_id is not null and public.user_can_admin_account(account_id))
  )
);

drop policy if exists user_devices_select_owner_or_admin on public.user_devices;
create policy user_devices_select_owner_or_admin
on public.user_devices
for select
to authenticated
using (
  user_id = auth.uid()
  or public.user_is_root_operator()
  or (account_id is not null and public.user_can_admin_account(account_id))
);

drop policy if exists user_devices_insert_owner on public.user_devices;
create policy user_devices_insert_owner
on public.user_devices
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists user_devices_update_owner on public.user_devices;
create policy user_devices_update_owner
on public.user_devices
for update
to authenticated
using (user_id = auth.uid() or public.user_is_root_operator())
with check (user_id = auth.uid() or public.user_is_root_operator());

revoke all on table public.data_deletion_requests from public;
revoke all on table public.data_deletion_processing_log from public;
revoke all on table public.data_export_requests from public;
revoke all on table public.user_devices from public;

grant select, insert, update on table public.data_deletion_requests to authenticated;
grant select on table public.data_deletion_processing_log to authenticated;
grant select, insert on table public.data_export_requests to authenticated;
grant select, insert, update on table public.user_devices to authenticated;

grant execute on function public.user_can_admin_account(uuid) to authenticated;
grant execute on function public.user_owns_tenant_profile(uuid) to authenticated;
grant execute on function public.user_owns_contractor_profile(uuid) to authenticated;
grant execute on function public.user_can_view_data_deletion_request(uuid) to authenticated;
grant execute on function public.submit_data_deletion_request(uuid, text, text, uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.submit_data_export_request(uuid, text) to authenticated;
grant execute on function public.admin_update_data_deletion_request(uuid, text, text, text, timestamptz) to authenticated;
grant execute on function public.complete_data_export_request(uuid, text, timestamptz) to authenticated, service_role;
grant execute on function public.mark_data_deletion_auth_user_deleted(uuid, uuid) to authenticated, service_role;
grant execute on function public.process_data_deletion_request(uuid) to authenticated, service_role;
grant execute on function public.anonymise_user_profile(uuid) to service_role;
grant execute on function public.anonymise_tenant_profile(uuid) to service_role;
grant execute on function public.anonymise_contractor_profile(uuid) to service_role;
grant execute on function public.revoke_user_devices(uuid) to service_role;
grant execute on function public.remove_user_memberships(uuid, uuid) to service_role;
grant execute on function public.create_retention_summary(uuid) to authenticated, service_role;

comment on table public.data_deletion_requests is
  'Canonical account-scoped privacy and data deletion request queue. Clients may request; privileged RPCs review and process.';
comment on table public.data_deletion_processing_log is
  'Append-style processing record of delete, anonymise, restrict, retain, token revocation, membership removal, and auth deletion actions.';
comment on table public.data_export_requests is
  'Data export request queue for user, tenant, contractor, and account exports.';
comment on table public.user_devices is
  'Mobile/web device registry for push-token lifecycle and deletion-time revocation.';
