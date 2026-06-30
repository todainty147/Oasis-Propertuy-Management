-- supabase/regulatory_monitoring_vs1_intake.sql
--
-- Monitoring VS-1: root-operator-only, review-gated regulatory intake.
--
-- This layer sits upstream of the RPE. It does not evaluate tenancies, create
-- obligations, notify customers, or publish legal conclusions. It proves the
-- manual review loop:
--   candidate -> Gate A regulatory_change -> Gate B impact_rule
--
-- Depends on regulatory_proof_engine_vs1.sql and provenance_events.sql.

begin;

create table if not exists public.regulatory_change_candidate (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  source_title text not null,
  source_url text,
  source_retrieved_at timestamptz,
  source_hash text,
  candidate_summary text not null,
  status text not null default 'new' check (
    status in ('new', 'triaged', 'needs_legal_review', 'gate_a_approved', 'rejected')
  ),
  review_notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  triaged_by uuid references auth.users(id) on delete set null,
  triaged_at timestamptz,
  legal_review_requested_by uuid references auth.users(id) on delete set null,
  legal_review_requested_at timestamptz,
  gate_a_approved_by uuid references auth.users(id) on delete set null,
  gate_a_approved_at timestamptz,
  rejected_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  demo_mode boolean not null default true check (demo_mode is true),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint regulatory_change_candidate_source_title_not_blank
    check (length(btrim(source_title)) > 0),
  constraint regulatory_change_candidate_summary_not_blank
    check (length(btrim(candidate_summary)) > 0),
  constraint regulatory_change_candidate_terminal_consistency check (
    (status <> 'gate_a_approved' or (gate_a_approved_by is not null and gate_a_approved_at is not null))
    and
    (status <> 'rejected' or (rejected_by is not null and rejected_at is not null))
  )
);

comment on table public.regulatory_change_candidate is
  'Internal-only regulatory detection/review candidates. A candidate is evidence of detection, not evidence of law.';

comment on column public.regulatory_change_candidate.account_id is
  'Internal provenance partition used for append-only ledger events. Candidates are not customer-facing account artefacts.';

alter table public.regulatory_change
  add column if not exists candidate_id uuid references public.regulatory_change_candidate(id) on delete restrict,
  add column if not exists intake_origin text not null default 'system_seed';

comment on column public.regulatory_change.candidate_id is
  'Nullable for historical seed/system records. New records created by Monitoring VS-1 Gate A are linked to a root-reviewed candidate.';

comment on column public.regulatory_change.intake_origin is
  'Origin marker for review-gated intake. Existing records may remain system_seed; Monitoring VS-1 records use monitoring_vs1_gate_a.';

create unique index if not exists regulatory_change_candidate_id_unique
  on public.regulatory_change(candidate_id)
  where candidate_id is not null;

create index if not exists regulatory_change_candidate_account_status_idx
  on public.regulatory_change_candidate(account_id, status, updated_at desc);

alter table public.regulatory_change_candidate enable row level security;

revoke all on table public.regulatory_change_candidate from public, anon, authenticated;
grant select on table public.regulatory_change_candidate to authenticated;
grant all on table public.regulatory_change_candidate to service_role;

drop policy if exists regulatory_change_candidate_select_root_operator
  on public.regulatory_change_candidate;
create policy regulatory_change_candidate_select_root_operator
on public.regulatory_change_candidate
for select
to authenticated
using (public.user_is_root_operator());

drop policy if exists regulatory_change_candidate_no_direct_write
  on public.regulatory_change_candidate;
create policy regulatory_change_candidate_no_direct_write
on public.regulatory_change_candidate
for all
to authenticated
using (false)
with check (false);

create or replace function public.regulatory_intake_require_root_operator()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  if not public.user_is_root_operator() then
    raise exception 'root operator required for regulatory intake';
  end if;

  return v_uid;
end;
$$;

create or replace function public.regulatory_intake_touch_candidate_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_regulatory_change_candidate_touch_updated_at
  on public.regulatory_change_candidate;
create trigger trg_regulatory_change_candidate_touch_updated_at
before update on public.regulatory_change_candidate
for each row execute function public.regulatory_intake_touch_candidate_updated_at();

create or replace function public.regulatory_intake_record_event(
  p_account_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_event_type text,
  p_summary text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.provenance_events
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.regulatory_intake_require_root_operator();

  return public.record_provenance_event(
    p_account_id,
    p_entity_type,
    p_entity_id,
    p_event_type,
    'human',
    now(),
    p_summary,
    null,
    null,
    'root_operator',
    null,
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'demo_mode', true,
        'source', 'regulatory_intake',
        'candidate_is_detection_not_law', true
      ),
    null,
    null,
    'regulatory_intake',
    null,
    null,
    null,
    null,
    null,
    'internal',
    'regulatory_intake:' || p_event_type || ':' || p_entity_id::text,
    1
  );
end;
$$;

create or replace function public.create_regulatory_change_candidate(
  p_account_id uuid,
  p_source_title text,
  p_source_url text default null,
  p_source_retrieved_at timestamptz default null,
  p_source_hash text default null,
  p_candidate_summary text default null,
  p_demo_mode boolean default true
)
returns public.regulatory_change_candidate
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_candidate public.regulatory_change_candidate%rowtype;
begin
  v_uid := public.regulatory_intake_require_root_operator();

  if p_demo_mode is not true then
    raise exception 'Monitoring VS-1 is demo-only; p_demo_mode must be true';
  end if;

  if not exists (select 1 from public.accounts a where a.id = p_account_id) then
    raise exception 'account not found for regulatory intake provenance';
  end if;

  insert into public.regulatory_change_candidate (
    account_id,
    source_title,
    source_url,
    source_retrieved_at,
    source_hash,
    candidate_summary,
    created_by,
    demo_mode
  )
  values (
    p_account_id,
    p_source_title,
    p_source_url,
    p_source_retrieved_at,
    p_source_hash,
    p_candidate_summary,
    v_uid,
    true
  )
  returning * into v_candidate;

  perform public.regulatory_intake_record_event(
    v_candidate.account_id,
    'regulatory_change_candidate',
    v_candidate.id,
    'regulatory_change.candidate_created',
    'Regulatory change candidate created',
    jsonb_build_object(
      'status', v_candidate.status,
      'source_title', v_candidate.source_title,
      'source_url_present', v_candidate.source_url is not null,
      'source_hash_present', v_candidate.source_hash is not null
    )
  );

  return v_candidate;
end;
$$;

create or replace function public.triage_regulatory_change_candidate(
  p_candidate_id uuid,
  p_review_notes text default null,
  p_demo_mode boolean default true
)
returns public.regulatory_change_candidate
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_candidate public.regulatory_change_candidate%rowtype;
begin
  v_uid := public.regulatory_intake_require_root_operator();

  if p_demo_mode is not true then
    raise exception 'Monitoring VS-1 is demo-only; p_demo_mode must be true';
  end if;

  select * into v_candidate
    from public.regulatory_change_candidate
   where id = p_candidate_id
   for update;

  if not found then
    raise exception 'regulatory_change_candidate not found';
  end if;

  if v_candidate.status <> 'new' then
    raise exception 'candidate must be new before triage';
  end if;

  update public.regulatory_change_candidate
     set status = 'triaged',
         review_notes = coalesce(p_review_notes, review_notes),
         triaged_by = v_uid,
         triaged_at = now()
   where id = p_candidate_id
   returning * into v_candidate;

  perform public.regulatory_intake_record_event(
    v_candidate.account_id,
    'regulatory_change_candidate',
    v_candidate.id,
    'regulatory_change.candidate_triaged',
    'Regulatory change candidate triaged',
    jsonb_build_object('status', v_candidate.status, 'review_notes_present', p_review_notes is not null)
  );

  return v_candidate;
end;
$$;

create or replace function public.mark_candidate_needs_legal_review(
  p_candidate_id uuid,
  p_review_notes text default null,
  p_demo_mode boolean default true
)
returns public.regulatory_change_candidate
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_candidate public.regulatory_change_candidate%rowtype;
begin
  v_uid := public.regulatory_intake_require_root_operator();

  if p_demo_mode is not true then
    raise exception 'Monitoring VS-1 is demo-only; p_demo_mode must be true';
  end if;

  select * into v_candidate
    from public.regulatory_change_candidate
   where id = p_candidate_id
   for update;

  if not found then
    raise exception 'regulatory_change_candidate not found';
  end if;

  if v_candidate.status <> 'triaged' then
    raise exception 'candidate must be triaged before legal review';
  end if;

  update public.regulatory_change_candidate
     set status = 'needs_legal_review',
         review_notes = coalesce(p_review_notes, review_notes),
         legal_review_requested_by = v_uid,
         legal_review_requested_at = now()
   where id = p_candidate_id
   returning * into v_candidate;

  perform public.regulatory_intake_record_event(
    v_candidate.account_id,
    'regulatory_change_candidate',
    v_candidate.id,
    'regulatory_change.candidate_needs_legal_review',
    'Regulatory change candidate marked for legal review',
    jsonb_build_object('status', v_candidate.status, 'review_notes_present', p_review_notes is not null)
  );

  return v_candidate;
end;
$$;

create or replace function public.reject_regulatory_change_candidate(
  p_candidate_id uuid,
  p_review_notes text,
  p_demo_mode boolean default true
)
returns public.regulatory_change_candidate
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_candidate public.regulatory_change_candidate%rowtype;
begin
  v_uid := public.regulatory_intake_require_root_operator();

  if p_demo_mode is not true then
    raise exception 'Monitoring VS-1 is demo-only; p_demo_mode must be true';
  end if;

  if nullif(btrim(coalesce(p_review_notes, '')), '') is null then
    raise exception 'rejection review_notes are required';
  end if;

  select * into v_candidate
    from public.regulatory_change_candidate
   where id = p_candidate_id
   for update;

  if not found then
    raise exception 'regulatory_change_candidate not found';
  end if;

  if v_candidate.status in ('gate_a_approved', 'rejected') then
    raise exception 'terminal candidates cannot be rejected again or revived';
  end if;

  update public.regulatory_change_candidate
     set status = 'rejected',
         review_notes = p_review_notes,
         rejected_by = v_uid,
         rejected_at = now()
   where id = p_candidate_id
   returning * into v_candidate;

  perform public.regulatory_intake_record_event(
    v_candidate.account_id,
    'regulatory_change_candidate',
    v_candidate.id,
    'regulatory_change.candidate_rejected',
    'Regulatory change candidate rejected',
    jsonb_build_object('status', v_candidate.status, 'review_notes_present', true)
  );

  return v_candidate;
end;
$$;

create or replace function public.approve_regulatory_change_gate_a(
  p_candidate_id uuid,
  p_regulation_key text,
  p_version integer,
  p_title text,
  p_jurisdiction text,
  p_effective_from date,
  p_effective_date date default null,
  p_deadline_date date default null,
  p_category text default null,
  p_legal_status text default 'gate_a_verified',
  p_penalty_ceiling_gbp numeric default null,
  p_notes text default null,
  p_demo_mode boolean default true
)
returns public.regulatory_change
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_candidate public.regulatory_change_candidate%rowtype;
  v_change public.regulatory_change%rowtype;
begin
  v_uid := public.regulatory_intake_require_root_operator();

  if p_demo_mode is not true then
    raise exception 'Monitoring VS-1 is demo-only; p_demo_mode must be true';
  end if;

  select * into v_candidate
    from public.regulatory_change_candidate
   where id = p_candidate_id
   for update;

  if not found then
    raise exception 'regulatory_change_candidate not found';
  end if;

  if v_candidate.status <> 'needs_legal_review' then
    raise exception 'candidate must be in needs_legal_review before Gate A approval';
  end if;

  if exists (
    select 1 from public.regulatory_change
     where regulation_key = p_regulation_key
       and version = p_version
  ) then
    raise exception 'regulatory_change %, version % already exists; use an isolated diagnostic key or an explicit new version',
      p_regulation_key, p_version;
  end if;

  insert into public.regulatory_change (
    regulation_key,
    version,
    source_name,
    source_title,
    retrieved_at,
    source_hash,
    title,
    jurisdiction,
    category,
    legal_status,
    source_url,
    effective_from,
    effective_date,
    deadline_date,
    penalty_ceiling_gbp,
    notes,
    validity_approved_by,
    validity_approved_at,
    active,
    candidate_id,
    intake_origin
  )
  values (
    p_regulation_key,
    p_version,
    'manual regulatory intake',
    v_candidate.source_title,
    v_candidate.source_retrieved_at,
    v_candidate.source_hash,
    p_title,
    p_jurisdiction,
    p_category,
    p_legal_status,
    v_candidate.source_url,
    p_effective_from,
    coalesce(p_effective_date, p_effective_from),
    p_deadline_date,
    p_penalty_ceiling_gbp,
    coalesce(p_notes, v_candidate.candidate_summary),
    v_uid,
    now(),
    false,
    v_candidate.id,
    'monitoring_vs1_gate_a'
  )
  returning * into v_change;

  update public.regulatory_change_candidate
     set status = 'gate_a_approved',
         gate_a_approved_by = v_uid,
         gate_a_approved_at = now()
   where id = v_candidate.id
   returning * into v_candidate;

  perform public.regulatory_intake_record_event(
    v_candidate.account_id,
    'regulatory_change',
    v_change.id,
    'regulatory_change.gate_a_approved',
    'Regulatory change approved at Gate A',
    jsonb_build_object(
      'candidate_id', v_candidate.id,
      'regulation_key', v_change.regulation_key,
      'version', v_change.version,
      'active', v_change.active,
      'intake_origin', v_change.intake_origin
    )
  );

  return v_change;
end;
$$;

create or replace function public.approve_impact_rule_gate_b(
  p_regulatory_change_id uuid,
  p_rule_key text,
  p_version integer,
  p_predicate_ref text,
  p_title text,
  p_result_domain text[] default array['affected','not_affected','deferred','needs_data'],
  p_evidence_requirement jsonb default '{}'::jsonb,
  p_deferral_logic jsonb default '{}'::jsonb,
  p_legal_source_ref text default null,
  p_rule_metadata jsonb default '{}'::jsonb,
  p_demo_mode boolean default true
)
returns public.impact_rule
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_change public.regulatory_change%rowtype;
  v_candidate public.regulatory_change_candidate%rowtype;
  v_rule public.impact_rule%rowtype;
begin
  v_uid := public.regulatory_intake_require_root_operator();

  if p_demo_mode is not true then
    raise exception 'Monitoring VS-1 is demo-only; p_demo_mode must be true';
  end if;

  select * into v_change
    from public.regulatory_change
   where id = p_regulatory_change_id
   for update;

  if not found then
    raise exception 'regulatory_change not found';
  end if;

  if v_change.candidate_id is null or v_change.intake_origin <> 'monitoring_vs1_gate_a' then
    raise exception 'Gate B requires a Monitoring VS-1 Gate-A regulatory_change';
  end if;

  select * into v_candidate
    from public.regulatory_change_candidate
   where id = v_change.candidate_id
   for update;

  if not found or v_candidate.status <> 'gate_a_approved' then
    raise exception 'Gate B requires a Gate-A-approved candidate';
  end if;

  if exists (
    select 1 from public.impact_rule
     where rule_key = p_rule_key
       and version = p_version
  ) then
    raise exception 'impact_rule %, version % already exists; use an isolated diagnostic key or the next version',
      p_rule_key, p_version;
  end if;

  if coalesce(array_length(p_result_domain, 1), 0) = 0 then
    raise exception 'result_domain is required';
  end if;

  insert into public.impact_rule (
    regulatory_change_id,
    rule_key,
    version,
    predicate_ref,
    evidence_requirement,
    deferral_logic,
    legal_source_ref,
    authored_by,
    title,
    result_domain,
    demo_mode_only,
    correctness_approved_by,
    correctness_approved_at,
    active,
    rule_metadata
  )
  values (
    v_change.id,
    p_rule_key,
    p_version,
    p_predicate_ref,
    coalesce(p_evidence_requirement, '{}'::jsonb),
    coalesce(p_deferral_logic, '{}'::jsonb),
    p_legal_source_ref,
    v_uid,
    p_title,
    p_result_domain,
    true,
    v_uid,
    now(),
    false,
    coalesce(p_rule_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'monitoring_vs1_candidate_id', v_candidate.id,
        'monitoring_vs1_demo_only', true
      )
  )
  returning * into v_rule;

  perform public.regulatory_intake_record_event(
    v_candidate.account_id,
    'impact_rule',
    v_rule.id,
    'impact_rule.gate_b_approved',
    'Impact rule approved at Gate B in demo mode',
    jsonb_build_object(
      'candidate_id', v_candidate.id,
      'regulatory_change_id', v_change.id,
      'rule_key', v_rule.rule_key,
      'version', v_rule.version,
      'active', v_rule.active,
      'demo_mode_only', v_rule.demo_mode_only
    )
  );

  return v_rule;
end;
$$;

create or replace function public.list_regulatory_change_candidates(
  p_account_id uuid,
  p_status text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  account_id uuid,
  source_title text,
  source_url text,
  source_retrieved_at timestamptz,
  source_hash text,
  candidate_summary text,
  status text,
  review_notes text,
  created_by uuid,
  demo_mode boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.regulatory_intake_require_root_operator();

  if p_status is not null
     and p_status <> all (array['new','triaged','needs_legal_review','gate_a_approved','rejected']) then
    raise exception 'invalid candidate status';
  end if;

  return query
  select
    c.id,
    c.account_id,
    c.source_title,
    c.source_url,
    c.source_retrieved_at,
    c.source_hash,
    c.candidate_summary,
    c.status,
    c.review_notes,
    c.created_by,
    c.demo_mode,
    c.created_at,
    c.updated_at
  from public.regulatory_change_candidate c
  where c.account_id = p_account_id
    and (p_status is null or c.status = p_status)
  order by c.updated_at desc, c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke all on function public.regulatory_intake_require_root_operator() from public, anon, authenticated;
revoke all on function public.regulatory_intake_record_event(uuid, text, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.regulatory_intake_touch_candidate_updated_at() from public, anon, authenticated;

revoke all on function public.create_regulatory_change_candidate(uuid, text, text, timestamptz, text, text, boolean) from public, anon, authenticated;
revoke all on function public.triage_regulatory_change_candidate(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.mark_candidate_needs_legal_review(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.reject_regulatory_change_candidate(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.approve_regulatory_change_gate_a(uuid, text, integer, text, text, date, date, date, text, text, numeric, text, boolean) from public, anon, authenticated;
revoke all on function public.approve_impact_rule_gate_b(uuid, text, integer, text, text, text[], jsonb, jsonb, text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.list_regulatory_change_candidates(uuid, text, integer, integer) from public, anon, authenticated;

grant execute on function public.create_regulatory_change_candidate(uuid, text, text, timestamptz, text, text, boolean) to authenticated;
grant execute on function public.triage_regulatory_change_candidate(uuid, text, boolean) to authenticated;
grant execute on function public.mark_candidate_needs_legal_review(uuid, text, boolean) to authenticated;
grant execute on function public.reject_regulatory_change_candidate(uuid, text, boolean) to authenticated;
grant execute on function public.approve_regulatory_change_gate_a(uuid, text, integer, text, text, date, date, date, text, text, numeric, text, boolean) to authenticated;
grant execute on function public.approve_impact_rule_gate_b(uuid, text, integer, text, text, text[], jsonb, jsonb, text, jsonb, boolean) to authenticated;
grant execute on function public.list_regulatory_change_candidates(uuid, text, integer, integer) to authenticated;

commit;
