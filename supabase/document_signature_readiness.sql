-- =========================================================
-- Document signature readiness
-- Purpose: provider-neutral e-signature metadata and packet readiness.
-- Secrets stay in Edge Function environment variables, not in this table.
-- =========================================================

create table if not exists public.document_signature_provider_settings (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  provider text not null default 'docuseal',
  provider_base_url text,
  default_signature_template_id text,
  is_enabled boolean not null default false,
  webhook_configured boolean not null default false,
  configured_by uuid references auth.users(id) on delete set null,
  configured_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint document_signature_provider_settings_provider_check
    check (provider in ('docuseal', 'opensign', 'libresign', 'manual'))
);

alter table public.document_packets
  add column if not exists signature_provider text,
  add column if not exists signature_template_id text,
  add column if not exists signature_submission_id text,
  add column if not exists signature_status text not null default 'not_configured',
  add column if not exists signature_completed_document_id uuid references public.documents(id) on delete set null,
  add column if not exists signature_requested_at timestamptz,
  add column if not exists signature_synced_at timestamptz,
  add column if not exists signature_error text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'document_packets_signature_provider_check'
      and conrelid = 'public.document_packets'::regclass
  ) then
    alter table public.document_packets
      add constraint document_packets_signature_provider_check
      check (signature_provider is null or signature_provider in ('docuseal', 'opensign', 'libresign', 'manual'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'document_packets_signature_status_check'
      and conrelid = 'public.document_packets'::regclass
  ) then
    alter table public.document_packets
      add constraint document_packets_signature_status_check
      check (signature_status in ('not_configured', 'ready', 'requested', 'pending', 'completed', 'failed', 'cancelled'));
  end if;
end;
$$;

alter table public.document_packet_events
  drop constraint if exists document_packet_events_type_check;

alter table public.document_packet_events
  add constraint document_packet_events_type_check
  check (event_type in (
    'created',
    'sent',
    'viewed',
    'completed',
    'voided',
    'signature_ready',
    'signature_requested',
    'signature_synced',
    'signature_completed',
    'signature_failed'
  ));

create index if not exists document_packets_signature_status_idx
  on public.document_packets (account_id, signature_status, updated_at desc);

create or replace function public.set_document_signature_provider_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_document_signature_provider_settings_updated_at
on public.document_signature_provider_settings;

create trigger trg_document_signature_provider_settings_updated_at
before update on public.document_signature_provider_settings
for each row execute function public.set_document_signature_provider_settings_updated_at();

alter table public.document_signature_provider_settings enable row level security;

drop policy if exists document_signature_settings_select_managers
on public.document_signature_provider_settings;

create policy document_signature_settings_select_managers
on public.document_signature_provider_settings
for select
to authenticated
using (public.can_manage_document_packets(account_id, auth.uid()));

drop policy if exists document_signature_settings_no_direct_write
on public.document_signature_provider_settings;

create policy document_signature_settings_no_direct_write
on public.document_signature_provider_settings
for all
to authenticated
using (false)
with check (false);

create or replace function public.upsert_document_signature_provider_settings(
  p_account_id uuid,
  p_provider text,
  p_provider_base_url text default null,
  p_default_signature_template_id text default null,
  p_is_enabled boolean default false,
  p_webhook_configured boolean default false,
  p_actor_user_id uuid default auth.uid()
) returns public.document_signature_provider_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_settings public.document_signature_provider_settings;
  v_provider text := lower(trim(coalesce(p_provider, 'docuseal')));
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if p_actor_user_id is not null and p_actor_user_id <> v_actor then raise exception 'Actor mismatch'; end if;
  if p_account_id is null then raise exception 'account_id is required'; end if;
  if not public.can_manage_document_packets(p_account_id, v_actor) then raise exception 'Not permitted'; end if;
  if v_provider not in ('docuseal', 'opensign', 'libresign', 'manual') then raise exception 'Unsupported signature provider'; end if;

  insert into public.document_signature_provider_settings (
    account_id,
    provider,
    provider_base_url,
    default_signature_template_id,
    is_enabled,
    webhook_configured,
    configured_by,
    configured_at
  )
  values (
    p_account_id,
    v_provider,
    nullif(trim(coalesce(p_provider_base_url, '')), ''),
    nullif(trim(coalesce(p_default_signature_template_id, '')), ''),
    coalesce(p_is_enabled, false),
    coalesce(p_webhook_configured, false),
    v_actor,
    now()
  )
  on conflict (account_id)
  do update set
    provider = excluded.provider,
    provider_base_url = excluded.provider_base_url,
    default_signature_template_id = excluded.default_signature_template_id,
    is_enabled = excluded.is_enabled,
    webhook_configured = excluded.webhook_configured,
    configured_by = excluded.configured_by,
    configured_at = now()
  returning * into v_settings;

  return v_settings;
end;
$$;

create or replace function public.prepare_document_packet_signature(
  p_packet_id uuid,
  p_signature_provider text default null,
  p_signature_template_id text default null,
  p_actor_user_id uuid default auth.uid()
) returns public.document_packets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_packet public.document_packets;
  v_settings public.document_signature_provider_settings;
  v_provider text;
  v_template_id text;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if p_actor_user_id is not null and p_actor_user_id <> v_actor then raise exception 'Actor mismatch'; end if;

  select * into v_packet
  from public.document_packets
  where id = p_packet_id;
  if not found then raise exception 'Packet not found'; end if;
  if not public.can_manage_document_packets(v_packet.account_id, v_actor) then raise exception 'Not permitted'; end if;
  if v_packet.status in ('completed', 'voided') then raise exception 'Packet cannot be prepared for signing from current status'; end if;

  select * into v_settings
  from public.document_signature_provider_settings
  where account_id = v_packet.account_id
    and is_enabled = true;
  if not found then raise exception 'Signature provider is not configured'; end if;

  v_provider := lower(trim(coalesce(p_signature_provider, v_settings.provider)));
  if v_provider <> v_settings.provider then raise exception 'Signature provider mismatch'; end if;

  v_template_id := nullif(trim(coalesce(p_signature_template_id, v_settings.default_signature_template_id, '')), '');
  if v_template_id is null then raise exception 'Signature template id is required'; end if;

  update public.document_packets
  set signature_provider = v_provider,
      signature_template_id = v_template_id,
      signature_status = 'ready',
      signature_error = null,
      signature_synced_at = now()
  where id = p_packet_id
  returning * into v_packet;

  insert into public.document_packet_events (
    account_id,
    packet_id,
    actor_user_id,
    event_type,
    message,
    metadata
  )
  values (
    v_packet.account_id,
    v_packet.id,
    v_actor,
    'signature_ready',
    'Agreement packet prepared for external signing',
    jsonb_build_object('provider', v_provider, 'signature_template_id', v_template_id)
  );

  return v_packet;
end;
$$;

create or replace function public.record_document_packet_signature_submission(
  p_packet_id uuid,
  p_provider text,
  p_submission_id text,
  p_signature_status text default 'pending'
) returns public.document_packets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets;
  v_status text := lower(trim(coalesce(p_signature_status, 'pending')));
  v_provider text := lower(trim(coalesce(p_provider, '')));
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not permitted'; end if;
  if v_status not in ('requested', 'pending', 'completed', 'failed', 'cancelled') then raise exception 'Invalid signature status'; end if;
  if v_provider not in ('docuseal', 'opensign', 'libresign', 'manual') then raise exception 'Unsupported signature provider'; end if;
  if nullif(trim(coalesce(p_submission_id, '')), '') is null then raise exception 'signature_submission_id is required'; end if;

  select * into v_packet
  from public.document_packets
  where id = p_packet_id;
  if not found then raise exception 'Packet not found'; end if;
  if coalesce(v_packet.signature_provider, v_provider) <> v_provider then raise exception 'Signature provider mismatch'; end if;

  update public.document_packets
  set signature_provider = v_provider,
      signature_submission_id = trim(p_submission_id),
      signature_status = v_status,
      signature_requested_at = coalesce(signature_requested_at, now()),
      signature_synced_at = now(),
      signature_error = null
  where id = p_packet_id
  returning * into v_packet;

  insert into public.document_packet_events (account_id, packet_id, event_type, message, metadata)
  values (
    v_packet.account_id,
    v_packet.id,
    'signature_requested',
    'External signature submission recorded',
    jsonb_build_object('provider', v_provider, 'signature_status', v_status)
  );

  return v_packet;
end;
$$;

create or replace function public.sync_document_packet_signature_status(
  p_packet_id uuid,
  p_submission_id text,
  p_signature_status text,
  p_completed_document_id uuid default null,
  p_error text default null
) returns public.document_packets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets;
  v_status text := lower(trim(coalesce(p_signature_status, '')));
  v_event text := 'signature_synced';
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not permitted'; end if;
  if v_status not in ('requested', 'pending', 'completed', 'failed', 'cancelled') then raise exception 'Invalid signature status'; end if;

  select * into v_packet
  from public.document_packets
  where id = p_packet_id
    and (p_submission_id is null or signature_submission_id = p_submission_id);
  if not found then raise exception 'Packet not found'; end if;

  if p_completed_document_id is not null and not exists (
    select 1
    from public.documents d
    where d.id = p_completed_document_id
      and d.account_id = v_packet.account_id
  ) then
    raise exception 'Completed document not found';
  end if;

  if v_status = 'completed' then
    v_event := 'signature_completed';
  elsif v_status = 'failed' then
    v_event := 'signature_failed';
  end if;

  update public.document_packets
  set signature_status = v_status,
      signature_completed_document_id = case when v_status = 'completed' then p_completed_document_id else signature_completed_document_id end,
      signature_synced_at = now(),
      signature_error = nullif(trim(coalesce(p_error, '')), '')
  where id = p_packet_id
  returning * into v_packet;

  insert into public.document_packet_events (account_id, packet_id, event_type, message, metadata)
  values (
    v_packet.account_id,
    v_packet.id,
    v_event,
    'External signature status synced',
    jsonb_build_object('signature_status', v_status, 'has_completed_document', p_completed_document_id is not null)
  );

  return v_packet;
end;
$$;

revoke all on function public.upsert_document_signature_provider_settings(uuid, text, text, text, boolean, boolean, uuid) from public;
revoke all on function public.prepare_document_packet_signature(uuid, text, text, uuid) from public;
revoke all on function public.record_document_packet_signature_submission(uuid, text, text, text) from public;
revoke all on function public.sync_document_packet_signature_status(uuid, text, text, uuid, text) from public;

grant execute on function public.upsert_document_signature_provider_settings(uuid, text, text, text, boolean, boolean, uuid) to authenticated, service_role;
grant execute on function public.prepare_document_packet_signature(uuid, text, text, uuid) to authenticated, service_role;
grant execute on function public.record_document_packet_signature_submission(uuid, text, text, text) to service_role;
grant execute on function public.sync_document_packet_signature_status(uuid, text, text, uuid, text) to service_role;

grant select on public.document_signature_provider_settings to authenticated;
grant all on public.document_signature_provider_settings to service_role;
