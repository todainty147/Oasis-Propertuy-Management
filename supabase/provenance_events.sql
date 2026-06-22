-- Tenaqo Explain / Provenance Sprint 1.
-- This is an append-only, account-scoped event substrate. It is not yet a
-- tamper-evident external evidence system.

create table if not exists public.provenance_event_counters (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  next_sequence bigint not null default 1 check (next_sequence > 0)
);

create table if not exists public.provenance_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  sequence_number bigint not null,
  entity_type text not null,
  entity_id uuid not null,
  property_id uuid null,
  tenancy_id uuid null,
  event_type text not null,
  event_version integer not null default 1,
  actor_type text not null,
  actor_user_id uuid null references auth.users(id) on delete restrict,
  actor_role text null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  summary text not null,
  reason text null,
  metadata jsonb not null default '{}'::jsonb,
  amount_minor bigint null,
  currency text null,
  source_type text null,
  source_id uuid null,
  supersedes_event_id uuid null references public.provenance_events(id) on delete restrict,
  reversal_of_event_id uuid null references public.provenance_events(id) on delete restrict,
  correlation_id uuid null,
  causation_id uuid null,
  visibility text not null default 'internal',
  previous_event_hash text null,
  event_hash text null,
  idempotency_key text null,
  created_at timestamptz not null default now(),
  constraint provenance_events_account_sequence_unique
    unique (account_id, sequence_number),
  constraint provenance_events_currency_for_amount_check
    check (amount_minor is null or nullif(btrim(currency), '') is not null),
  constraint provenance_events_correction_reference_check
    check (num_nonnulls(supersedes_event_id, reversal_of_event_id) <= 1),
  constraint provenance_events_actor_type_check
    check (actor_type in ('human', 'system', 'ai', 'integration')),
  constraint provenance_events_human_actor_check
    check (actor_type <> 'human' or actor_user_id is not null),
  constraint provenance_events_nonhuman_source_check
    check (
      actor_type = 'human'
      or nullif(btrim(source_type), '') is not null
      or metadata ? 'source'
      or metadata ? 'job_id'
      or metadata ? 'integration'
    ),
  constraint provenance_events_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint provenance_events_visibility_check
    check (visibility in ('internal', 'account')),
  constraint provenance_events_event_version_check
    check (event_version > 0),
  constraint provenance_events_required_text_check
    check (
      nullif(btrim(entity_type), '') is not null
      and nullif(btrim(event_type), '') is not null
      and nullif(btrim(summary), '') is not null
    ),
  constraint provenance_events_sequence_positive_check
    check (sequence_number > 0)
);

comment on table public.provenance_events is
  'Append-only account provenance substrate. Corrections and reversals are new events; existing rows must never be mutated.';

comment on column public.provenance_events.amount_minor is
  'Integer minor currency units, for example pence for GBP. Floating-point money must not be placed in metadata.';

comment on column public.provenance_events.previous_event_hash is
  'Sprint 1.5 TODO: populate server-side from a canonical event representation after defining hash versioning and verification.';

comment on column public.provenance_events.event_hash is
  'Sprint 1.5 TODO: compute server-side and add verification plus external anchoring. Sprint 1 intentionally leaves this null.';

create unique index if not exists provenance_events_account_idempotency_unique
  on public.provenance_events(account_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists provenance_events_account_sequence_idx
  on public.provenance_events(account_id, sequence_number);

create index if not exists provenance_events_account_tenancy_occurred_idx
  on public.provenance_events(account_id, tenancy_id, occurred_at);

create index if not exists provenance_events_account_property_occurred_idx
  on public.provenance_events(account_id, property_id, occurred_at);

create index if not exists provenance_events_account_entity_idx
  on public.provenance_events(account_id, entity_type, entity_id);

create index if not exists provenance_events_account_event_type_idx
  on public.provenance_events(account_id, event_type);

create index if not exists provenance_events_account_correlation_idx
  on public.provenance_events(account_id, correlation_id);

create or replace function public.provenance_events_block_row_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'provenance_events is append-only; record a correction or reversal event instead';
end;
$$;

create or replace function public.provenance_events_block_truncate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'provenance_events is append-only and cannot be truncated';
end;
$$;

drop trigger if exists trg_provenance_events_block_update on public.provenance_events;
create trigger trg_provenance_events_block_update
before update on public.provenance_events
for each row execute function public.provenance_events_block_row_mutation();

drop trigger if exists trg_provenance_events_block_delete on public.provenance_events;
create trigger trg_provenance_events_block_delete
before delete on public.provenance_events
for each row execute function public.provenance_events_block_row_mutation();

drop trigger if exists trg_provenance_events_block_truncate on public.provenance_events;
create trigger trg_provenance_events_block_truncate
before truncate on public.provenance_events
for each statement execute function public.provenance_events_block_truncate();

alter table public.provenance_events enable row level security;
alter table public.provenance_event_counters enable row level security;

drop policy if exists "provenance_events_select_account_operators" on public.provenance_events;
create policy "provenance_events_select_account_operators"
on public.provenance_events
for select
to authenticated
using (
  public.user_is_root_operator()
  or public.account_member_effective_role(account_id, auth.uid())
    = any (array['owner', 'admin', 'staff'])
);

create or replace function public.record_provenance_event(
  p_account_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_event_type text,
  p_actor_type text,
  p_occurred_at timestamptz,
  p_summary text,
  p_property_id uuid default null,
  p_tenancy_id uuid default null,
  p_actor_role text default null,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_amount_minor bigint default null,
  p_currency text default null,
  p_source_type text default null,
  p_source_id uuid default null,
  p_supersedes_event_id uuid default null,
  p_reversal_of_event_id uuid default null,
  p_correlation_id uuid default null,
  p_causation_id uuid default null,
  p_visibility text default 'internal',
  p_idempotency_key text default null,
  p_event_version integer default 1
) returns public.provenance_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_role text;
  v_event_id uuid := gen_random_uuid();
  v_sequence_number bigint;
  v_reference_event public.provenance_events%rowtype;
  v_event public.provenance_events%rowtype;
begin
  if v_actor_user_id is null then
    raise exception 'authentication required';
  end if;

  v_actor_role := public.account_member_effective_role(p_account_id, v_actor_user_id);
  if not public.user_is_root_operator()
     and coalesce(v_actor_role, '') <> all (array['owner', 'admin', 'staff']) then
    raise exception 'account operator role required';
  end if;

  -- Sprint 1 permits owner/admin/staff operators to record all event types.
  -- Event-specific role matrices must be introduced before exposing narrower
  -- producer workflows to untrusted principals.
  if p_actor_type not in ('human', 'system', 'ai', 'integration') then
    raise exception 'invalid actor_type';
  end if;

  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'metadata must be a JSON object';
  end if;

  if p_actor_type <> 'human'
     and nullif(btrim(p_source_type), '') is null
     and not (p_metadata ? 'source' or p_metadata ? 'job_id' or p_metadata ? 'integration') then
    raise exception 'non-human events must identify their source, job, or integration';
  end if;

  if p_occurred_at > now() + interval '5 minutes'
     and not (
       p_actor_type = 'system'
       and nullif(btrim(p_reason), '') is not null
       and p_metadata ->> 'future_timestamp_override' = 'true'
     ) then
    raise exception 'occurred_at cannot be more than five minutes in the future';
  end if;

  if p_supersedes_event_id is not null and p_reversal_of_event_id is not null then
    raise exception 'only one correction or reversal reference may be set';
  end if;

  -- Per-account serialization prevents sequence forks while allowing different
  -- accounts to progress independently.
  perform pg_advisory_xact_lock(hashtext('provenance:' || p_account_id::text), 0);

  if p_idempotency_key is not null then
    select *
      into v_event
      from public.provenance_events
     where account_id = p_account_id
       and idempotency_key = p_idempotency_key;

    if found then
      return v_event;
    end if;
  end if;

  if p_supersedes_event_id is not null or p_reversal_of_event_id is not null then
    select *
      into v_reference_event
      from public.provenance_events
     where id = coalesce(p_supersedes_event_id, p_reversal_of_event_id);

    if not found or v_reference_event.account_id <> p_account_id then
      raise exception 'correction or reversal target must exist in the same account';
    end if;

    if v_reference_event.id = v_event_id then
      raise exception 'an event cannot reference itself';
    end if;

    if (v_reference_event.entity_type, v_reference_event.entity_id)
       is distinct from (p_entity_type, p_entity_id)
       and not (
         nullif(btrim(p_reason), '') is not null
         and p_metadata ->> 'cross_entity_reference' = 'true'
       ) then
      raise exception 'cross-entity references require a reason and cross_entity_reference metadata';
    end if;
  end if;

  insert into public.provenance_event_counters(account_id, next_sequence)
  values (p_account_id, 2)
  on conflict (account_id) do update
    set next_sequence = public.provenance_event_counters.next_sequence + 1
  returning next_sequence - 1 into v_sequence_number;

  insert into public.provenance_events (
    id,
    account_id,
    sequence_number,
    entity_type,
    entity_id,
    property_id,
    tenancy_id,
    event_type,
    event_version,
    actor_type,
    actor_user_id,
    actor_role,
    occurred_at,
    recorded_at,
    summary,
    reason,
    metadata,
    amount_minor,
    currency,
    source_type,
    source_id,
    supersedes_event_id,
    reversal_of_event_id,
    correlation_id,
    causation_id,
    visibility,
    previous_event_hash,
    event_hash,
    idempotency_key,
    created_at
  ) values (
    v_event_id,
    p_account_id,
    v_sequence_number,
    p_entity_type,
    p_entity_id,
    p_property_id,
    p_tenancy_id,
    p_event_type,
    p_event_version,
    p_actor_type,
    case when p_actor_type = 'human' then v_actor_user_id else null end,
    case
      when p_actor_type = 'human' then v_actor_role
      else coalesce(nullif(btrim(p_actor_role), ''), v_actor_role)
    end,
    p_occurred_at,
    now(),
    p_summary,
    p_reason,
    p_metadata,
    p_amount_minor,
    upper(nullif(btrim(p_currency), '')),
    p_source_type,
    p_source_id,
    p_supersedes_event_id,
    p_reversal_of_event_id,
    p_correlation_id,
    p_causation_id,
    coalesce(nullif(btrim(p_visibility), ''), 'internal'),
    null,
    null,
    p_idempotency_key,
    now()
  )
  on conflict (account_id, idempotency_key)
    where idempotency_key is not null
  do nothing
  returning * into v_event;

  if not found then
    select *
      into v_event
      from public.provenance_events
     where account_id = p_account_id
       and idempotency_key = p_idempotency_key;
  end if;

  return v_event;
end;
$$;

revoke all on table public.provenance_event_counters from public, anon, authenticated;
revoke all on table public.provenance_events from public, anon, authenticated;
grant select on table public.provenance_events to authenticated;

revoke all on function public.record_provenance_event(
  uuid, text, uuid, text, text, timestamptz, text, uuid, uuid, text, text,
  jsonb, bigint, text, text, uuid, uuid, uuid, uuid, uuid, text, text, integer
) from public, anon;
grant execute on function public.record_provenance_event(
  uuid, text, uuid, text, text, timestamptz, text, uuid, uuid, text, text,
  jsonb, bigint, text, text, uuid, uuid, uuid, uuid, uuid, text, text, integer
) to authenticated;

-- Trusted operational boundary:
-- service_role can invoke the RPC only when it carries an authenticated user
-- context accepted by the explicit checks above. UPDATE/DELETE/TRUNCATE remain
-- trigger-blocked even for privileged API paths. Database owners are trusted
-- operators capable of disabling triggers and must use break-glass procedures.
