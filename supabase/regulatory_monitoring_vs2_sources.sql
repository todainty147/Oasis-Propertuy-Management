-- supabase/regulatory_monitoring_vs2_sources.sql
--
-- Monitoring VS-2: curated source register + operator-triggered hash detection.
--
-- This layer adds only detection of changed curated sources. It does not
-- interpret law, approve candidates, create regulatory_change/impact_rule rows,
-- run RPE evaluations, create obligations, notify customers, or schedule checks.
--
-- Depends on regulatory_monitoring_vs1_intake.sql.

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.regulatory_source (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  source_title text not null,
  source_url text not null,
  jurisdiction text not null,
  source_type text not null,
  status text not null default 'active' check (status in ('active', 'paused')),
  last_check_status text not null default 'never' check (
    last_check_status in ('success', 'error', 'never')
  ),
  last_checked_at timestamptz,
  last_successful_check_at timestamptz,
  last_known_hash text,
  last_error text,
  last_snapshot_excerpt text,
  last_snapshot_ref text,
  check_count integer not null default 0 check (check_count >= 0),
  failure_count integer not null default 0 check (failure_count >= 0),
  demo_mode boolean not null default true check (demo_mode is true),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint regulatory_source_title_not_blank check (length(btrim(source_title)) > 0),
  constraint regulatory_source_url_https check (source_url ~* '^https://'),
  constraint regulatory_source_jurisdiction_not_blank check (length(btrim(jurisdiction)) > 0),
  constraint regulatory_source_type_not_blank check (length(btrim(source_type)) > 0)
);

comment on table public.regulatory_source is
  'Internal-only curated regulatory source register. Source checks detect hash changes only; fetched content is opaque untrusted data; hash + bounded snapshot only.';

comment on column public.regulatory_source.account_id is
  'Internal provenance partition used for source-check and candidate-created ledger events.';

comment on column public.regulatory_source.status is
  'Lifecycle status: active sources may be checked; paused sources are disabled. This is separate from last_check_status.';

comment on column public.regulatory_source.last_check_status is
  'Result of the most recent check attempt. error means could_not_check, not unchanged.';

alter table public.regulatory_change_candidate
  add column if not exists source_id uuid references public.regulatory_source(id) on delete restrict,
  add column if not exists old_hash text,
  add column if not exists new_hash text,
  add column if not exists detected_at timestamptz,
  add column if not exists snapshot_excerpt text,
  add column if not exists snapshot_ref text,
  add column if not exists intake_origin text not null default 'manual_candidate';

comment on column public.regulatory_change_candidate.source_id is
  'Nullable for manual candidates. Monitoring VS-2 automated detection candidates link to the source that changed.';

comment on column public.regulatory_change_candidate.intake_origin is
  'Candidate origin marker. automated_source_detection means a source hash changed; it is still only a new candidate and does not bypass review.';

do $$
begin
  alter table public.regulatory_change_candidate
    add constraint regulatory_change_candidate_intake_origin_check
    check (intake_origin in ('manual_candidate', 'automated_source_detection'));
exception when duplicate_object then null;
end $$;

create unique index if not exists regulatory_change_candidate_detection_hash_unique
  on public.regulatory_change_candidate(source_id, new_hash, intake_origin)
  where source_id is not null
    and new_hash is not null
    and intake_origin = 'automated_source_detection';

create index if not exists regulatory_source_account_status_idx
  on public.regulatory_source(account_id, status, last_check_status, updated_at desc);

alter table public.regulatory_source enable row level security;

revoke all on table public.regulatory_source from public, anon, authenticated;
grant select on table public.regulatory_source to authenticated;
grant all on table public.regulatory_source to service_role;

drop policy if exists regulatory_source_select_root_operator
  on public.regulatory_source;
create policy regulatory_source_select_root_operator
on public.regulatory_source
for select
to authenticated
using (public.user_is_root_operator());

drop policy if exists regulatory_source_no_direct_write
  on public.regulatory_source;
create policy regulatory_source_no_direct_write
on public.regulatory_source
for all
to authenticated
using (false)
with check (false);

create or replace function public.regulatory_source_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_regulatory_source_touch_updated_at
  on public.regulatory_source;
create trigger trg_regulatory_source_touch_updated_at
before update on public.regulatory_source
for each row execute function public.regulatory_source_touch_updated_at();

create or replace function public.list_regulatory_sources(
  p_account_id uuid,
  p_status text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns setof public.regulatory_source
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.regulatory_intake_require_root_operator();

  if not exists (select 1 from public.accounts a where a.id = p_account_id) then
    raise exception 'account not found for regulatory source listing';
  end if;

  if p_status is not null and p_status not in ('active', 'paused') then
    raise exception 'invalid regulatory source status';
  end if;

  return query
  select rs.*
    from public.regulatory_source rs
   where rs.account_id = p_account_id
     and (p_status is null or rs.status = p_status)
   order by rs.updated_at desc, rs.source_title asc
   limit greatest(1, least(coalesce(p_limit, 100), 200))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

create or replace function public.get_regulatory_source_for_check(
  p_source_id uuid
)
returns public.regulatory_source
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.regulatory_source%rowtype;
begin
  perform public.regulatory_intake_require_root_operator();

  select *
    into v_source
    from public.regulatory_source
   where id = p_source_id;

  if not found then
    raise exception 'regulatory source not found';
  end if;

  if v_source.status <> 'active' then
    raise exception 'regulatory source is not active';
  end if;

  return v_source;
end;
$$;

create or replace function public.regulatory_source_apply_check_failed_core(
  p_source_id uuid,
  p_error_code text,
  p_error_message text default null,
  p_demo_mode boolean default true
)
returns public.regulatory_source
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.regulatory_source%rowtype;
  v_error text;
begin
  if p_demo_mode is not true then
    raise exception 'Monitoring VS-2 is demo-only; p_demo_mode must be true';
  end if;

  select *
    into v_source
    from public.regulatory_source
   where id = p_source_id
   for update;

  if not found then
    raise exception 'regulatory source not found';
  end if;

  if v_source.status <> 'active' then
    raise exception 'regulatory source is not active';
  end if;

  v_error := left(
    concat_ws(': ', nullif(btrim(coalesce(p_error_code, 'check_failed')), ''), nullif(btrim(coalesce(p_error_message, '')), '')),
    1000
  );

  update public.regulatory_source
     set last_check_status = 'error',
         last_checked_at = now(),
         last_error = v_error,
         failure_count = failure_count + 1
   where id = v_source.id
  returning * into v_source;

  return v_source;
end;
$$;

create or replace function public.regulatory_source_apply_check_result_core(
  p_source_id uuid,
  p_normalized_content text,
  p_snapshot_excerpt text default null,
  p_snapshot_ref text default null,
  p_retrieved_at timestamptz default now(),
  p_candidate_created_by uuid default auth.uid(),
  p_demo_mode boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.regulatory_source%rowtype;
  v_hash text;
  v_old_hash text;
  v_changed boolean;
  v_baseline boolean;
  v_candidate public.regulatory_change_candidate%rowtype;
  v_candidate_created boolean := false;
begin
  if p_demo_mode is not true then
    raise exception 'Monitoring VS-2 is demo-only; p_demo_mode must be true';
  end if;

  if p_normalized_content is null or length(p_normalized_content) = 0 then
    raise exception 'normalized content is required';
  end if;

  select *
    into v_source
    from public.regulatory_source
   where id = p_source_id
   for update;

  if not found then
    raise exception 'regulatory source not found';
  end if;

  if v_source.status <> 'active' then
    raise exception 'regulatory source is not active';
  end if;

  v_old_hash := v_source.last_known_hash;
  v_hash := encode(extensions.digest(convert_to(p_normalized_content, 'UTF8'), 'sha256'), 'hex');
  v_baseline := v_old_hash is null;
  v_changed := v_old_hash is not null and v_old_hash <> v_hash;

  update public.regulatory_source
     set last_check_status = 'success',
         last_checked_at = now(),
         last_successful_check_at = coalesce(p_retrieved_at, now()),
         last_known_hash = v_hash,
         last_error = null,
         last_snapshot_excerpt = left(nullif(p_snapshot_excerpt, ''), 4000),
         last_snapshot_ref = nullif(p_snapshot_ref, ''),
         check_count = check_count + 1
   where id = v_source.id
  returning * into v_source;

  if v_changed then
    insert into public.regulatory_change_candidate (
      account_id,
      source_id,
      source_title,
      source_url,
      source_retrieved_at,
      source_hash,
      old_hash,
      new_hash,
      detected_at,
      snapshot_excerpt,
      snapshot_ref,
      intake_origin,
      candidate_summary,
      created_by,
      demo_mode
    )
    values (
      v_source.account_id,
      v_source.id,
      v_source.source_title,
      v_source.source_url,
      coalesce(p_retrieved_at, now()),
      v_hash,
      v_old_hash,
      v_hash,
      now(),
      left(nullif(p_snapshot_excerpt, ''), 4000),
      nullif(p_snapshot_ref, ''),
      'automated_source_detection',
      'Automated source hash change detected; internal review required.',
      p_candidate_created_by,
      true
    )
    on conflict (source_id, new_hash, intake_origin)
      where source_id is not null
        and new_hash is not null
        and intake_origin = 'automated_source_detection'
    do nothing
    returning * into v_candidate;

    v_candidate_created := v_candidate.id is not null;

    if not v_candidate_created then
      select *
        into v_candidate
        from public.regulatory_change_candidate
       where source_id = v_source.id
         and new_hash = v_hash
         and intake_origin = 'automated_source_detection'
       order by created_at asc
       limit 1;
    end if;
  end if;

  return jsonb_build_object(
    'source_id', v_source.id,
    'account_id', v_source.account_id,
    'last_known_hash', v_source.last_known_hash,
    'old_hash', v_old_hash,
    'new_hash', v_hash,
    'baseline', v_baseline,
    'changed', v_changed,
    'candidate_created', v_candidate_created,
    'candidate_id', v_candidate.id,
    'last_check_status', v_source.last_check_status,
    'last_checked_at', v_source.last_checked_at,
    'last_successful_check_at', v_source.last_successful_check_at,
    'demo_mode', true
  );
end;
$$;

create or replace function public.record_regulatory_source_check_failed(
  p_source_id uuid,
  p_error_code text,
  p_error_message text default null,
  p_scheduled_run_id uuid default null,
  p_trigger_type text default 'operator',
  p_demo_mode boolean default true
)
returns public.regulatory_source
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.regulatory_source%rowtype;
begin
  perform public.regulatory_intake_require_root_operator();

  if p_demo_mode is not true then
    raise exception 'Monitoring VS-2 is demo-only; p_demo_mode must be true';
  end if;

  if coalesce(p_trigger_type, 'operator') <> 'operator' then
    raise exception 'scheduled source checks must use boxed scheduler RPCs';
  end if;

  if p_scheduled_run_id is not null then
    raise exception 'operator source checks must not carry a scheduled run id';
  end if;

  v_source := public.regulatory_source_apply_check_failed_core(
    p_source_id,
    p_error_code,
    p_error_message,
    p_demo_mode
  );

  perform public.regulatory_intake_record_event(
    v_source.account_id,
    'regulatory_source',
    v_source.id,
    'regulatory_source.check_failed',
    'Regulatory source check failed',
    jsonb_build_object(
      'error_code', left(coalesce(p_error_code, 'check_failed'), 120),
      'last_check_status', v_source.last_check_status,
      'trigger_type', 'operator',
      'last_successful_check_at_unchanged', true,
      'candidate_created', false,
      'hash_updated', false
    )
  );

  return v_source;
end;
$$;

create or replace function public.record_regulatory_source_check_result(
  p_source_id uuid,
  p_normalized_content text,
  p_snapshot_excerpt text default null,
  p_snapshot_ref text default null,
  p_retrieved_at timestamptz default now(),
  p_scheduled_run_id uuid default null,
  p_trigger_type text default 'operator',
  p_demo_mode boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.regulatory_source%rowtype;
  v_candidate public.regulatory_change_candidate%rowtype;
  v_result jsonb;
begin
  perform public.regulatory_intake_require_root_operator();

  if p_demo_mode is not true then
    raise exception 'Monitoring VS-2 is demo-only; p_demo_mode must be true';
  end if;

  if coalesce(p_trigger_type, 'operator') <> 'operator' then
    raise exception 'scheduled source checks must use boxed scheduler RPCs';
  end if;

  if p_scheduled_run_id is not null then
    raise exception 'operator source checks must not carry a scheduled run id';
  end if;

  v_result := public.regulatory_source_apply_check_result_core(
    p_source_id,
    p_normalized_content,
    p_snapshot_excerpt,
    p_snapshot_ref,
    p_retrieved_at,
    auth.uid(),
    p_demo_mode
  );

  select *
    into v_source
    from public.regulatory_source
   where id = (v_result->>'source_id')::uuid;

  perform public.regulatory_intake_record_event(
    v_source.account_id,
    'regulatory_source',
    v_source.id,
    'regulatory_source.checked',
    'Regulatory source check succeeded',
    jsonb_build_object(
      'baseline', (v_result->>'baseline')::boolean,
      'changed', (v_result->>'changed')::boolean,
      'trigger_type', 'operator',
      'hash', v_result->>'new_hash'
    )
  );

  if (v_result->>'changed')::boolean then
    if v_result->>'candidate_id' is not null then
      select *
        into v_candidate
        from public.regulatory_change_candidate
       where id = (v_result->>'candidate_id')::uuid
       limit 1;
    end if;

    if (v_result->>'candidate_created')::boolean then
      perform public.regulatory_intake_record_event(
        v_candidate.account_id,
        'regulatory_change_candidate',
        v_candidate.id,
        'regulatory_change.candidate_created',
        'Regulatory change candidate created from source hash detection',
        jsonb_build_object(
          'source_id', v_source.id,
          'status', v_candidate.status,
          'intake_origin', v_candidate.intake_origin,
          'old_hash', v_result->>'old_hash',
          'new_hash', v_result->>'new_hash',
          'source_title', v_source.source_title,
          'source_url_present', true,
          'source_hash_present', true
        )
      );
    end if;

    perform public.regulatory_intake_record_event(
      v_source.account_id,
      'regulatory_source',
      v_source.id,
      'regulatory_source.change_detected',
      'Regulatory source hash changed',
      jsonb_build_object(
        'old_hash', v_result->>'old_hash',
        'new_hash', v_result->>'new_hash',
        'candidate_id', v_candidate.id,
        'candidate_created', (v_result->>'candidate_created')::boolean,
        'detection_authority_stopped_at', 'regulatory_change_candidate.status=new'
      )
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.list_regulatory_sources(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.get_regulatory_source_for_check(uuid) from public, anon, authenticated;
revoke all on function public.regulatory_source_apply_check_failed_core(uuid, text, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.regulatory_source_apply_check_result_core(uuid, text, text, text, timestamptz, uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function public.record_regulatory_source_check_failed(uuid, text, text, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.record_regulatory_source_check_result(uuid, text, text, text, timestamptz, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.regulatory_source_touch_updated_at() from public, anon, authenticated;

grant execute on function public.list_regulatory_sources(uuid, text, integer, integer) to authenticated;
grant execute on function public.get_regulatory_source_for_check(uuid) to authenticated;
grant execute on function public.record_regulatory_source_check_failed(uuid, text, text, uuid, text, boolean) to authenticated;
grant execute on function public.record_regulatory_source_check_result(uuid, text, text, text, timestamptz, uuid, text, boolean) to authenticated;
grant execute on function public.regulatory_source_touch_updated_at() to service_role;

commit;
