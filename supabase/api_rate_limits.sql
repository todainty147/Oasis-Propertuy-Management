create table if not exists public.api_rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  actor_user_id uuid,
  surface text not null,
  identifier_hash text,
  window_seconds integer not null default 3600,
  max_attempts integer not null default 10,
  attempt_count integer not null,
  allowed boolean not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint api_rate_limit_surface_not_blank check (length(trim(surface)) > 0),
  constraint api_rate_limit_window_positive check (window_seconds > 0),
  constraint api_rate_limit_max_attempts_positive check (max_attempts > 0)
);

create index if not exists api_rate_limit_events_scope_idx
  on public.api_rate_limit_events (surface, account_id, actor_user_id, identifier_hash, created_at desc);

create index if not exists api_rate_limit_events_account_created_idx
  on public.api_rate_limit_events (account_id, created_at desc);

alter table public.api_rate_limit_events enable row level security;

drop policy if exists api_rate_limit_events_no_direct_select on public.api_rate_limit_events;
create policy api_rate_limit_events_no_direct_select
  on public.api_rate_limit_events
  for select
  using (false);

drop policy if exists api_rate_limit_events_no_direct_write on public.api_rate_limit_events;
create policy api_rate_limit_events_no_direct_write
  on public.api_rate_limit_events
  for all
  using (false)
  with check (false);

create or replace function public.record_api_rate_limit_attempt(
  p_surface text,
  p_account_id uuid default null,
  p_actor_user_id uuid default null,
  p_identifier_hash text default null,
  p_window_seconds integer default 3600,
  p_max_attempts integer default 10,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_surface text := nullif(trim(coalesce(p_surface, '')), '');
  v_identifier_hash text := nullif(trim(coalesce(p_identifier_hash, '')), '');
  v_window_seconds integer := greatest(coalesce(p_window_seconds, 3600), 1);
  v_max_attempts integer := greatest(coalesce(p_max_attempts, 10), 1);
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_attempt_count integer;
  v_allowed boolean;
  v_retry_after_seconds integer := 0;
  v_correlation_id text := nullif(v_metadata->>'correlation_id', '');
begin
  if v_surface is null then
    raise exception 'surface is required'
      using errcode = '22023';
  end if;

  select count(*)::integer + 1
    into v_attempt_count
  from public.api_rate_limit_events e
  where e.surface = v_surface
    and e.created_at >= now() - make_interval(secs => v_window_seconds)
    and e.account_id is not distinct from p_account_id
    and e.actor_user_id is not distinct from p_actor_user_id
    and e.identifier_hash is not distinct from v_identifier_hash;

  v_allowed := v_attempt_count <= v_max_attempts;

  if not v_allowed then
    select greatest(
      1,
      ceil(extract(epoch from (min(e.created_at) + make_interval(secs => v_window_seconds) - now())))::integer
    )
      into v_retry_after_seconds
    from public.api_rate_limit_events e
    where e.surface = v_surface
      and e.created_at >= now() - make_interval(secs => v_window_seconds)
      and e.account_id is not distinct from p_account_id
      and e.actor_user_id is not distinct from p_actor_user_id
      and e.identifier_hash is not distinct from v_identifier_hash;
  end if;

  insert into public.api_rate_limit_events (
    account_id,
    actor_user_id,
    surface,
    identifier_hash,
    window_seconds,
    max_attempts,
    attempt_count,
    allowed,
    metadata
  )
  values (
    p_account_id,
    p_actor_user_id,
    v_surface,
    v_identifier_hash,
    v_window_seconds,
    v_max_attempts,
    v_attempt_count,
    v_allowed,
    v_metadata
  );

  if not v_allowed then
    insert into public.security_observability_events (
      account_id,
      actor_user_id,
      actor_role,
      category,
      kind,
      surface,
      reason,
      outcome,
      code,
      guard_denied,
      correlation_id,
      source,
      metadata
    )
    values (
      p_account_id,
      p_actor_user_id,
      'edge_function',
      'api_rate_limit',
      'authorization_denied',
      v_surface,
      'rate_limit_exceeded',
      'denied',
      '429',
      true,
      v_correlation_id,
      'edge_function',
      jsonb_strip_nulls(
        jsonb_build_object(
          'window_seconds', v_window_seconds,
          'max_attempts', v_max_attempts,
          'attempt_count', v_attempt_count,
          'retry_after_seconds', v_retry_after_seconds,
          'limit_scope', v_metadata->>'limit_scope'
        )
      )
    );
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'surface', v_surface,
    'attempt_count', v_attempt_count,
    'max_attempts', v_max_attempts,
    'window_seconds', v_window_seconds,
    'retry_after_seconds', v_retry_after_seconds
  );
end;
$$;

revoke all on function public.record_api_rate_limit_attempt(
  text,
  uuid,
  uuid,
  text,
  integer,
  integer,
  jsonb
) from public;
grant execute on function public.record_api_rate_limit_attempt(
  text,
  uuid,
  uuid,
  text,
  integer,
  integer,
  jsonb
) to service_role;

grant usage on schema public to authenticated;
