create table if not exists public.security_observability_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid null references public.accounts(id) on delete set null,
  actor_user_id uuid null references auth.users(id) on delete set null,
  actor_role text null,
  category text not null,
  kind text not null,
  surface text not null,
  reason text null,
  outcome text not null default 'error',
  code text null,
  guard_denied boolean not null default false,
  entity_type text null,
  entity_id uuid null,
  correlation_id text null,
  source text not null default 'app_client',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.security_observability_events is
  'Append-only centralized hosted sink for scrubbed security, authorization, and workflow failure events emitted by OASIS clients and edge functions.';

comment on column public.security_observability_events.metadata is
  'Minimal scrubbed correlation metadata only. Excludes invite tokens, emails, document names, storage paths, signed URLs, and raw business payloads.';

create index if not exists security_observability_events_account_created_idx
  on public.security_observability_events(account_id, created_at desc);

create index if not exists security_observability_events_category_created_idx
  on public.security_observability_events(category, created_at desc);

create index if not exists security_observability_events_surface_created_idx
  on public.security_observability_events(surface, created_at desc);

create index if not exists security_observability_events_actor_created_idx
  on public.security_observability_events(actor_user_id, created_at desc);

create index if not exists security_observability_events_entity_idx
  on public.security_observability_events(entity_type, entity_id, created_at desc);

create index if not exists security_observability_events_correlation_idx
  on public.security_observability_events(correlation_id, created_at desc);

create or replace function public.security_observability_events_block_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'security_observability_events is append-only';
end;
$$;

drop trigger if exists trg_security_observability_events_block_update on public.security_observability_events;
create trigger trg_security_observability_events_block_update
before update on public.security_observability_events
for each row
execute function public.security_observability_events_block_mutation();

drop trigger if exists trg_security_observability_events_block_delete on public.security_observability_events;
create trigger trg_security_observability_events_block_delete
before delete on public.security_observability_events
for each row
execute function public.security_observability_events_block_mutation();

alter table public.security_observability_events enable row level security;

drop policy if exists security_observability_events_select_managers on public.security_observability_events;
create policy security_observability_events_select_managers
on public.security_observability_events
for select
to authenticated
using (
  public.user_can_manage_account(account_id)
  or actor_user_id = auth.uid()
);

revoke all on table public.security_observability_events from public;
grant select on table public.security_observability_events to authenticated;

create or replace function public.cleanup_security_observability_events(
  p_retention_days integer default 90,
  p_batch_size integer default 5000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_retention_days integer := greatest(7, least(coalesce(p_retention_days, 90), 3650));
  v_batch_size integer := greatest(1, least(coalesce(p_batch_size, 5000), 50000));
  v_deleted_count integer := 0;
begin
  with doomed as (
    select id
    from public.security_observability_events
    where created_at < now() - make_interval(days => v_retention_days)
    order by created_at asc
    limit v_batch_size
  ),
  deleted as (
    delete from public.security_observability_events e
    using doomed d
    where e.id = d.id
    returning 1
  )
  select count(*) into v_deleted_count
  from deleted;

  return v_deleted_count;
end;
$$;

comment on function public.cleanup_security_observability_events(integer, integer) is
  'Privileged retention helper for hosted security observability rows. Deletes old rows in small batches.';

revoke all on function public.cleanup_security_observability_events(integer, integer) from public;

create or replace function public.security_observability_event_feed(
  p_account_id uuid,
  p_category text default null,
  p_kind text default null,
  p_surface text default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  account_id uuid,
  actor_user_id uuid,
  actor_role text,
  category text,
  kind text,
  surface text,
  reason text,
  outcome text,
  code text,
  guard_denied boolean,
  entity_type text,
  entity_id uuid,
  correlation_id text,
  source text,
  metadata jsonb,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with authz as (
    select public.assert_manage_account_access(p_account_id) as account_id
  ),
  cfg as (
    select greatest(1, least(coalesce(p_limit, 100), 200)) as row_limit
  )
  select
    e.id,
    e.account_id,
    e.actor_user_id,
    e.actor_role,
    e.category,
    e.kind,
    e.surface,
    e.reason,
    e.outcome,
    e.code,
    e.guard_denied,
    e.entity_type,
    e.entity_id,
    e.correlation_id,
    e.source,
    e.metadata,
    e.created_at
  from public.security_observability_events e
  cross join authz a
  where e.account_id = a.account_id
    and (nullif(lower(trim(coalesce(p_category, ''))), '') is null or e.category = lower(trim(p_category)))
    and (nullif(lower(trim(coalesce(p_kind, ''))), '') is null or e.kind = lower(trim(p_kind)))
    and (nullif(lower(trim(coalesce(p_surface, ''))), '') is null or e.surface = lower(trim(p_surface)))
  order by e.created_at desc
  limit (select row_limit from cfg);
$$;

comment on function public.security_observability_event_feed(uuid, text, text, text, integer) is
  'Manager-safe query surface for recent hosted security observability events scoped to a single account.';

revoke all on function public.security_observability_event_feed(uuid, text, text, text, integer) from public;
grant execute on function public.security_observability_event_feed(uuid, text, text, text, integer) to authenticated;
