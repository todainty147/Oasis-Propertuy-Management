-- =========================================================
-- Document agreement packets
-- Purpose: pre-signature agreement packet lifecycle on top of templates.
-- External e-sign providers should integrate later through packet events.
-- =========================================================

create table if not exists public.document_packets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  template_id uuid not null references public.document_templates(id) on delete restrict,
  target_role text not null,
  tenant_id uuid references public.tenants(id) on delete cascade,
  contractor_id uuid references public.contractors(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  packet_type text not null default 'agreement',
  title text not null,
  message text,
  status text not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  sent_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz,
  completed_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_packets_target_role_check
    check (target_role in ('tenant', 'contractor')),
  constraint document_packets_target_check
    check (
      (target_role = 'tenant' and tenant_id is not null and contractor_id is null)
      or
      (target_role = 'contractor' and contractor_id is not null and tenant_id is null)
    ),
  constraint document_packets_type_check
    check (packet_type in ('agreement', 'contractor_terms', 'maintenance_consent', 'other')),
  constraint document_packets_status_check
    check (status in ('draft', 'sent', 'viewed', 'completed', 'voided'))
);

create table if not exists public.document_packet_recipients (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  packet_id uuid not null references public.document_packets(id) on delete cascade,
  role text not null,
  user_id uuid references auth.users(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete cascade,
  contractor_id uuid references public.contractors(id) on delete cascade,
  email text,
  signing_order integer not null default 1,
  status text not null default 'pending',
  viewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_packet_recipients_role_check
    check (role in ('tenant', 'contractor')),
  constraint document_packet_recipients_status_check
    check (status in ('pending', 'sent', 'viewed', 'completed', 'voided')),
  constraint document_packet_recipients_target_check
    check (
      (role = 'tenant' and tenant_id is not null and contractor_id is null)
      or
      (role = 'contractor' and contractor_id is not null and tenant_id is null)
    )
);

create table if not exists public.document_packet_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  packet_id uuid not null references public.document_packets(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint document_packet_events_type_check
    check (event_type in ('created', 'sent', 'viewed', 'completed', 'voided'))
);

create index if not exists document_packets_account_status_idx
  on public.document_packets (account_id, status, updated_at desc);

create index if not exists document_packets_tenant_idx
  on public.document_packets (tenant_id, status, updated_at desc);

create index if not exists document_packets_contractor_idx
  on public.document_packets (contractor_id, status, updated_at desc);

create index if not exists document_packet_recipients_packet_idx
  on public.document_packet_recipients (packet_id, signing_order);

create index if not exists document_packet_recipients_user_idx
  on public.document_packet_recipients (user_id, status, updated_at desc);

create index if not exists document_packet_events_packet_idx
  on public.document_packet_events (packet_id, created_at desc);

create or replace function public.set_document_packet_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_document_packets_updated_at on public.document_packets;
create trigger trg_document_packets_updated_at
before update on public.document_packets
for each row execute function public.set_document_packet_updated_at();

drop trigger if exists trg_document_packet_recipients_updated_at on public.document_packet_recipients;
create trigger trg_document_packet_recipients_updated_at
before update on public.document_packet_recipients
for each row execute function public.set_document_packet_updated_at();

create or replace function public.can_manage_document_packets(
  p_account_id uuid,
  p_user_id uuid default auth.uid()
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.account_members am
    where am.account_id = p_account_id
      and am.user_id = p_user_id
      and public.account_member_has_permission(p_account_id, 'documents.upload', p_user_id)
      and public.account_member_effective_role(p_account_id, p_user_id) = any (array['owner', 'admin', 'staff'])
  );
$$;

create or replace function public.is_document_packet_recipient(
  p_packet_id uuid,
  p_user_id uuid default auth.uid()
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.document_packet_recipients dpr
    left join public.tenants t
      on t.id = dpr.tenant_id
      and t.account_id = dpr.account_id
      and t.archived_at is null
    left join public.contractors c
      on c.id = dpr.contractor_id
      and c.account_id = dpr.account_id
      and c.active = true
    where dpr.packet_id = p_packet_id
      and (
        dpr.user_id = p_user_id
        or (dpr.role = 'tenant' and t.user_id = p_user_id)
        or (dpr.role = 'contractor' and c.user_id = p_user_id)
      )
  );
$$;

create or replace function public.create_document_packet(
  p_account_id uuid,
  p_template_id uuid,
  p_target_role text,
  p_tenant_id uuid default null,
  p_contractor_id uuid default null,
  p_property_id uuid default null,
  p_packet_type text default 'agreement',
  p_title text default null,
  p_message text default null,
  p_actor_user_id uuid default auth.uid()
) returns public.document_packets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_template public.document_templates;
  v_packet public.document_packets;
  v_user_id uuid;
  v_email text;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if p_actor_user_id is not null and p_actor_user_id <> v_actor then raise exception 'Actor mismatch'; end if;
  if p_account_id is null then raise exception 'account_id is required'; end if;
  if not public.can_manage_document_packets(p_account_id, v_actor) then raise exception 'Not permitted'; end if;
  if nullif(trim(coalesce(p_title, '')), '') is null then raise exception 'Packet title is required'; end if;

  select * into v_template
  from public.document_templates
  where id = p_template_id
    and account_id = p_account_id
    and status = 'active'
    and upload_status = 'uploaded';
  if not found then raise exception 'Template not found'; end if;

  if p_target_role = 'tenant' then
    select t.user_id, t.email into v_user_id, v_email
    from public.tenants t
    where t.id = p_tenant_id and t.account_id = p_account_id and t.archived_at is null;
    if not found then raise exception 'Tenant not found'; end if;
  elsif p_target_role = 'contractor' then
    select c.user_id, c.email into v_user_id, v_email
    from public.contractors c
    where c.id = p_contractor_id and c.account_id = p_account_id and c.active = true;
    if not found then raise exception 'Contractor not found'; end if;
  else
    raise exception 'Invalid target_role';
  end if;

  if p_property_id is not null and not exists (
    select 1 from public.properties p where p.id = p_property_id and p.account_id = p_account_id
  ) then
    raise exception 'Property not found';
  end if;

  insert into public.document_packets (
    account_id,
    template_id,
    target_role,
    tenant_id,
    contractor_id,
    property_id,
    packet_type,
    title,
    message,
    created_by
  )
  values (
    p_account_id,
    p_template_id,
    p_target_role,
    p_tenant_id,
    p_contractor_id,
    p_property_id,
    p_packet_type,
    trim(p_title),
    nullif(trim(coalesce(p_message, '')), ''),
    v_actor
  )
  returning * into v_packet;

  insert into public.document_packet_recipients (
    account_id,
    packet_id,
    role,
    user_id,
    tenant_id,
    contractor_id,
    email
  )
  values (
    p_account_id,
    v_packet.id,
    p_target_role,
    v_user_id,
    p_tenant_id,
    p_contractor_id,
    v_email
  );

  insert into public.document_packet_events (
    account_id,
    packet_id,
    actor_user_id,
    event_type,
    message,
    metadata
  )
  values (
    p_account_id,
    v_packet.id,
    v_actor,
    'created',
    'Agreement packet created',
    jsonb_build_object('template_id', p_template_id, 'target_role', p_target_role)
  );

  return v_packet;
end;
$$;

create or replace function public.send_document_packet(
  p_packet_id uuid,
  p_actor_user_id uuid default auth.uid()
) returns public.document_packets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_packet public.document_packets;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if p_actor_user_id is not null and p_actor_user_id <> v_actor then raise exception 'Actor mismatch'; end if;

  select * into v_packet from public.document_packets where id = p_packet_id;
  if not found then raise exception 'Packet not found'; end if;
  if not public.can_manage_document_packets(v_packet.account_id, v_actor) then raise exception 'Not permitted'; end if;
  if v_packet.status not in ('draft', 'viewed') then raise exception 'Packet cannot be sent from current status'; end if;

  update public.document_packets
  set status = 'sent',
      sent_by = v_actor,
      sent_at = now()
  where id = p_packet_id
  returning * into v_packet;

  update public.document_packet_recipients
  set status = 'sent'
  where packet_id = p_packet_id
    and status = 'pending';

  insert into public.document_packet_events (account_id, packet_id, actor_user_id, event_type, message)
  values (v_packet.account_id, v_packet.id, v_actor, 'sent', 'Agreement packet sent');

  return v_packet;
end;
$$;

create or replace function public.mark_document_packet_viewed(
  p_packet_id uuid,
  p_actor_user_id uuid default auth.uid()
) returns public.document_packets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_packet public.document_packets;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if p_actor_user_id is not null and p_actor_user_id <> v_actor then raise exception 'Actor mismatch'; end if;

  select * into v_packet from public.document_packets where id = p_packet_id;
  if not found then raise exception 'Packet not found'; end if;
  if not public.is_document_packet_recipient(p_packet_id, v_actor) then raise exception 'Not permitted'; end if;
  if v_packet.status not in ('sent', 'viewed') then raise exception 'Packet is not ready to view'; end if;

  update public.document_packet_recipients
  set status = case when status = 'sent' then 'viewed' else status end,
      viewed_at = coalesce(viewed_at, now())
  where packet_id = p_packet_id
    and public.is_document_packet_recipient(packet_id, v_actor);

  if v_packet.status = 'sent' then
    update public.document_packets
    set status = 'viewed'
    where id = p_packet_id
    returning * into v_packet;

    insert into public.document_packet_events (account_id, packet_id, actor_user_id, event_type, message)
    values (v_packet.account_id, v_packet.id, v_actor, 'viewed', 'Agreement packet viewed');
  end if;

  select * into v_packet from public.document_packets where id = p_packet_id;
  return v_packet;
end;
$$;

create or replace function public.complete_document_packet(
  p_packet_id uuid,
  p_actor_user_id uuid default auth.uid()
) returns public.document_packets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_packet public.document_packets;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if p_actor_user_id is not null and p_actor_user_id <> v_actor then raise exception 'Actor mismatch'; end if;

  select * into v_packet from public.document_packets where id = p_packet_id;
  if not found then raise exception 'Packet not found'; end if;
  if not public.is_document_packet_recipient(p_packet_id, v_actor) then raise exception 'Not permitted'; end if;
  if v_packet.status not in ('sent', 'viewed') then raise exception 'Packet cannot be completed from current status'; end if;

  update public.document_packet_recipients
  set status = 'completed',
      viewed_at = coalesce(viewed_at, now()),
      completed_at = now()
  where packet_id = p_packet_id
    and public.is_document_packet_recipient(packet_id, v_actor);

  update public.document_packets
  set status = 'completed',
      completed_at = now()
  where id = p_packet_id
  returning * into v_packet;

  insert into public.document_packet_events (account_id, packet_id, actor_user_id, event_type, message)
  values (v_packet.account_id, v_packet.id, v_actor, 'completed', 'Agreement packet completed');

  return v_packet;
end;
$$;

create or replace function public.void_document_packet(
  p_packet_id uuid,
  p_actor_user_id uuid default auth.uid()
) returns public.document_packets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_packet public.document_packets;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if p_actor_user_id is not null and p_actor_user_id <> v_actor then raise exception 'Actor mismatch'; end if;

  select * into v_packet from public.document_packets where id = p_packet_id;
  if not found then raise exception 'Packet not found'; end if;
  if not public.can_manage_document_packets(v_packet.account_id, v_actor) then raise exception 'Not permitted'; end if;
  if v_packet.status = 'completed' then raise exception 'Completed packet cannot be voided'; end if;

  update public.document_packets
  set status = 'voided',
      voided_at = now()
  where id = p_packet_id
  returning * into v_packet;

  update public.document_packet_recipients
  set status = 'voided'
  where packet_id = p_packet_id
    and status <> 'completed';

  insert into public.document_packet_events (account_id, packet_id, actor_user_id, event_type, message)
  values (v_packet.account_id, v_packet.id, v_actor, 'voided', 'Agreement packet voided');

  return v_packet;
end;
$$;

alter table public.document_packets enable row level security;
alter table public.document_packet_recipients enable row level security;
alter table public.document_packet_events enable row level security;

drop policy if exists document_packets_select_managers_or_recipient on public.document_packets;
create policy document_packets_select_managers_or_recipient
on public.document_packets
for select
to authenticated
using (
  public.can_manage_document_packets(account_id, auth.uid())
  or public.is_document_packet_recipient(id, auth.uid())
);

drop policy if exists document_packets_no_direct_write on public.document_packets;
create policy document_packets_no_direct_write
on public.document_packets
for all
to authenticated
using (false)
with check (false);

drop policy if exists document_packet_recipients_select_managers_or_self on public.document_packet_recipients;
create policy document_packet_recipients_select_managers_or_self
on public.document_packet_recipients
for select
to authenticated
using (
  public.can_manage_document_packets(account_id, auth.uid())
  or public.is_document_packet_recipient(packet_id, auth.uid())
);

drop policy if exists document_packet_recipients_no_direct_write on public.document_packet_recipients;
create policy document_packet_recipients_no_direct_write
on public.document_packet_recipients
for all
to authenticated
using (false)
with check (false);

drop policy if exists document_packet_events_select_managers_or_recipient on public.document_packet_events;
create policy document_packet_events_select_managers_or_recipient
on public.document_packet_events
for select
to authenticated
using (
  public.can_manage_document_packets(account_id, auth.uid())
  or public.is_document_packet_recipient(packet_id, auth.uid())
);

drop policy if exists document_packet_events_no_direct_write on public.document_packet_events;
create policy document_packet_events_no_direct_write
on public.document_packet_events
for all
to authenticated
using (false)
with check (false);

revoke all on function public.can_manage_document_packets(uuid, uuid) from public;
revoke all on function public.is_document_packet_recipient(uuid, uuid) from public;
revoke all on function public.create_document_packet(uuid, uuid, text, uuid, uuid, uuid, text, text, text, uuid) from public;
revoke all on function public.send_document_packet(uuid, uuid) from public;
revoke all on function public.mark_document_packet_viewed(uuid, uuid) from public;
revoke all on function public.complete_document_packet(uuid, uuid) from public;
revoke all on function public.void_document_packet(uuid, uuid) from public;

grant execute on function public.can_manage_document_packets(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_document_packet_recipient(uuid, uuid) to authenticated, service_role;
grant execute on function public.create_document_packet(uuid, uuid, text, uuid, uuid, uuid, text, text, text, uuid) to authenticated, service_role;
grant execute on function public.send_document_packet(uuid, uuid) to authenticated, service_role;
grant execute on function public.mark_document_packet_viewed(uuid, uuid) to authenticated, service_role;
grant execute on function public.complete_document_packet(uuid, uuid) to authenticated, service_role;
grant execute on function public.void_document_packet(uuid, uuid) to authenticated, service_role;

grant select on public.document_packets to authenticated;
grant select on public.document_packet_recipients to authenticated;
grant select on public.document_packet_events to authenticated;
grant all on public.document_packets to service_role;
grant all on public.document_packet_recipients to service_role;
grant all on public.document_packet_events to service_role;
