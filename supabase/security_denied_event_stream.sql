create table if not exists public.security_denied_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid null references public.accounts(id) on delete set null,
  actor_user_id uuid null references auth.users(id) on delete set null,
  actor_role text null,
  event text not null,
  outcome text not null default 'denied',
  reason text not null,
  entity_type text null,
  entity_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.security_denied_events is
  'Append-only durable stream of high-signal denied authorization and security-sensitive workflow failures captured after the caller receives the original error.';

comment on column public.security_denied_events.metadata is
  'Small scrubbed correlation metadata only. Never store raw invite tokens, passwords, emails, or full business payloads.';

create index if not exists security_denied_events_account_created_idx
  on public.security_denied_events(account_id, created_at desc);

create index if not exists security_denied_events_actor_created_idx
  on public.security_denied_events(actor_user_id, created_at desc);

create index if not exists security_denied_events_event_created_idx
  on public.security_denied_events(event, created_at desc);

create index if not exists security_denied_events_entity_idx
  on public.security_denied_events(entity_type, entity_id, created_at desc);

create or replace function public.security_denied_events_block_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'security_denied_events is append-only';
end;
$$;

drop trigger if exists trg_security_denied_events_block_update on public.security_denied_events;
create trigger trg_security_denied_events_block_update
before update on public.security_denied_events
for each row
execute function public.security_denied_events_block_mutation();

drop trigger if exists trg_security_denied_events_block_delete on public.security_denied_events;
create trigger trg_security_denied_events_block_delete
before delete on public.security_denied_events
for each row
execute function public.security_denied_events_block_mutation();

create or replace function public.resolve_security_denied_event_account_id(
  p_account_id uuid default null,
  p_entity_type text default null,
  p_entity_id uuid default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_entity_type text := lower(trim(coalesce(p_entity_type, '')));
  v_account_id uuid;
begin
  if p_account_id is not null then
    return p_account_id;
  end if;

  if p_entity_id is null then
    return null;
  end if;

  if v_entity_type in ('work_order', 'work_orders') then
    select wo.account_id into v_account_id
    from public.work_orders wo
    where wo.id = p_entity_id;
  elsif v_entity_type in ('maintenance_request', 'maintenance_requests') then
    select mr.account_id into v_account_id
    from public.maintenance_requests mr
    where mr.id = p_entity_id;
  elsif v_entity_type in ('payment', 'payments') then
    select p.account_id into v_account_id
    from public.payments p
    where p.id = p_entity_id;
  elsif v_entity_type in ('tenant', 'tenants') then
    select t.account_id into v_account_id
    from public.tenants t
    where t.id = p_entity_id;
  elsif v_entity_type in ('contractor', 'contractors') then
    select c.account_id into v_account_id
    from public.contractors c
    where c.id = p_entity_id;
  elsif v_entity_type in ('property', 'properties') then
    select p.account_id into v_account_id
    from public.properties p
    where p.id = p_entity_id;
  elsif v_entity_type in ('account_invitation', 'account_invitations') then
    select ai.account_id into v_account_id
    from public.account_invitations ai
    where ai.id = p_entity_id;
  elsif v_entity_type in ('security_alert', 'security_anomaly_alert', 'security_anomaly_alerts') then
    select sa.account_id into v_account_id
    from public.security_anomaly_alerts sa
    where sa.id = p_entity_id;
  elsif v_entity_type in ('document', 'documents') then
    select d.account_id into v_account_id
    from public.documents d
    where d.id = p_entity_id;
  end if;

  return v_account_id;
end;
$$;

create or replace function public.actor_can_record_security_denied_event(
  p_account_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_account_id is null
    or public.user_can_manage_account(p_account_id)
    or exists (
      select 1
      from public.account_members am
      where am.account_id = p_account_id
        and am.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.tenants t
      where t.account_id = p_account_id
        and t.user_id = auth.uid()
        and coalesce(t.status, '') <> 'archived'
    )
    or exists (
      select 1
      from public.contractors c
      where c.account_id = p_account_id
        and c.user_id = auth.uid()
        and coalesce(c.active, false) = true
    );
$$;

create or replace function public.security_denied_event_actor_role(
  p_account_id uuid
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select 'root'
      where public.user_is_root_operator()
    ),
    (
      select public.account_member_effective_role(p_account_id, auth.uid())
    ),
    (
      select 'tenant'
      from public.tenants t
      where t.account_id = p_account_id
        and t.user_id = auth.uid()
        and coalesce(t.status, '') <> 'archived'
      limit 1
    ),
    (
      select 'contractor'
      from public.contractors c
      where c.account_id = p_account_id
        and c.user_id = auth.uid()
        and coalesce(c.active, false) = true
      limit 1
    ),
    'authenticated'
  );
$$;

create or replace function public.record_security_denied_event(
  p_event text,
  p_account_id uuid default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_event text := lower(trim(coalesce(p_event, '')));
  v_reason text := lower(trim(coalesce(p_reason, '')));
  v_entity_type text := nullif(lower(trim(coalesce(p_entity_type, ''))), '');
  v_account_id uuid;
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_existing_id uuid;
  v_row_id uuid;
begin
  if v_actor_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(v_event, '') is null then
    raise exception 'Missing event';
  end if;

  if nullif(v_reason, '') is null then
    raise exception 'Missing reason';
  end if;

  if jsonb_typeof(v_metadata) is distinct from 'object' then
    v_metadata := '{}'::jsonb;
  end if;

  v_metadata := jsonb_strip_nulls(
    v_metadata
      - 'token'
      - 'inviteToken'
      - 'email'
      - 'body'
      - 'fileName'
      - 'filename'
      - 'metadata'
      - 'originalFilename'
      - 'rawPayload'
      - 'accessToken'
      - 'password'
      - 'path'
      - 'signedUrl'
      - 'storagePath'
      - 'firstName'
      - 'first_name'
      - 'lastName'
      - 'last_name'
      - 'phone'
      - 'phoneNumber'
      - 'phone_number'
      - 'contactPhone'
      - 'contact_phone'
      - 'address'
      - 'propertyAddress'
      - 'property_address'
  );

  v_account_id := public.resolve_security_denied_event_account_id(
    p_account_id,
    v_entity_type,
    p_entity_id
  );

  if p_account_id is not null and v_account_id is distinct from p_account_id then
    raise exception 'Access denied';
  end if;

  if not public.actor_can_record_security_denied_event(v_account_id) then
    raise exception 'Access denied';
  end if;

  select sde.id
  into v_existing_id
  from public.security_denied_events sde
  where sde.actor_user_id = v_actor_user_id
    and sde.event = v_event
    and sde.reason = v_reason
    and sde.account_id is not distinct from v_account_id
    and sde.entity_type is not distinct from v_entity_type
    and sde.entity_id is not distinct from p_entity_id
    and sde.created_at >= now() - interval '30 seconds'
  order by sde.created_at desc
  limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  insert into public.security_denied_events (
    account_id,
    actor_user_id,
    actor_role,
    event,
    outcome,
    reason,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_account_id,
    v_actor_user_id,
    public.security_denied_event_actor_role(v_account_id),
    v_event,
    'denied',
    v_reason,
    v_entity_type,
    p_entity_id,
    v_metadata
  )
  returning id into v_row_id;

  return v_row_id;
end;
$$;

comment on function public.record_security_denied_event(text, uuid, text, uuid, text, jsonb) is
  'Durably records a small scrubbed denied-event after the original auth failure has already been returned to the caller in a separate transaction.';

create or replace function public.assert_manage_account_access(p_account_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception using
      errcode = '28000',
      message = 'Not authenticated',
      detail = public.security_failure_context(
        'assert_manage_account_access',
        'missing_auth',
        p_account_id,
        'account',
        p_account_id
      ),
      hint = 'Authenticate before requesting an account-scoped manager surface.';
  end if;

  if p_account_id is null then
    raise exception using
      errcode = '22023',
      message = 'Missing account id',
      detail = public.security_failure_context(
        'assert_manage_account_access',
        'missing_account_id',
        null,
        'account',
        null
      ),
      hint = 'Pass a concrete account identifier before requesting an account-scoped manager surface.';
  end if;

  if not public.user_can_manage_account(p_account_id) then
    raise exception using
      errcode = '42501',
      message = 'Access denied',
      detail = public.security_failure_context(
        'assert_manage_account_access',
        'account_role_required',
        p_account_id,
        'account',
        p_account_id
      ),
      hint = 'Only owner, admin, staff, or root operators can access this account-scoped manager surface.';
  end if;

  return p_account_id;
end;
$$;

create or replace function public.assert_tenant_scope_access(
  p_account_id uuid,
  p_tenant_id uuid default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  if auth.uid() is null then
    raise exception using
      errcode = '28000',
      message = 'Not authenticated',
      detail = public.security_failure_context(
        'assert_tenant_scope_access',
        'missing_auth',
        p_account_id,
        'tenant',
        p_tenant_id
      ),
      hint = 'Authenticate before requesting an account or tenant-scoped surface.';
  end if;

  if p_account_id is null then
    raise exception using
      errcode = '22023',
      message = 'Missing account id',
      detail = public.security_failure_context(
        'assert_tenant_scope_access',
        'missing_account_id',
        null,
        'tenant',
        p_tenant_id
      ),
      hint = 'Pass a concrete account identifier before requesting a tenant-scoped surface.';
  end if;

  if public.user_can_manage_account(p_account_id) then
    return p_tenant_id;
  end if;

  if p_tenant_id is null then
    raise exception using
      errcode = '42501',
      message = 'Access denied',
      detail = public.security_failure_context(
        'assert_tenant_scope_access',
        'tenant_scope_required',
        p_account_id,
        'tenant',
        null
      ),
      hint = 'Tenant-scoped callers must provide their own tenant identifier.';
  end if;

  select t.id
  into v_tenant_id
  from public.tenants t
  where t.id = p_tenant_id
    and t.account_id = p_account_id
    and t.user_id = auth.uid()
  limit 1;

  if v_tenant_id is null then
    raise exception using
      errcode = '42501',
      message = 'Access denied',
      detail = public.security_failure_context(
        'assert_tenant_scope_access',
        'tenant_scope_denied',
        p_account_id,
        'tenant',
        p_tenant_id
      ),
      hint = 'Tenants may only access their own tenant scope within the active account.';
  end if;

  return v_tenant_id;
end;
$$;

alter table public.security_denied_events enable row level security;

drop policy if exists security_denied_events_select_managers on public.security_denied_events;
create policy security_denied_events_select_managers
on public.security_denied_events
for select
to authenticated
using (
  public.user_can_manage_account(account_id)
  or actor_user_id = auth.uid()
);

revoke all on table public.security_denied_events from public;
grant select on table public.security_denied_events to authenticated;

revoke all on function public.record_security_denied_event(text, uuid, text, uuid, text, jsonb) from public;
grant execute on function public.record_security_denied_event(text, uuid, text, uuid, text, jsonb) to authenticated;
grant execute on function public.record_security_denied_event(text, uuid, text, uuid, text, jsonb) to service_role;

grant execute on function public.resolve_security_denied_event_account_id(uuid, text, uuid) to authenticated;
grant execute on function public.actor_can_record_security_denied_event(uuid) to authenticated;
grant execute on function public.security_denied_event_actor_role(uuid) to authenticated;
