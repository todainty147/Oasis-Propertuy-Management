-- supabase/regulatory_proof_engine_vs1.sql
--
-- Regulatory Proof Engine VS-1: RRA Information Sheet rule/evaluation layer.
--
-- Depends on VS-0 data readiness. This file persists evaluation results and
-- appends an evaluation_run event to the existing provenance ledger. It does
-- not create obligations, proof packs, or write verdicts to renters_rights_tasks.

begin;

create table if not exists public.regulatory_change (
  id uuid primary key default gen_random_uuid(),
  regulation_key text not null,
  version int not null,
  source_name text,
  source_title text,
  published_date date,
  retrieved_at timestamptz,
  source_hash text,
  source_excerpt_hash text,
  pdf_hash text,
  title text not null,
  jurisdiction text not null,
  category text,
  legal_status text,
  source_url text,
  effective_from date not null,
  effective_date date,
  deadline_date date,
  penalty_ceiling_gbp numeric,
  notes text,
  validity_approved_by uuid references auth.users(id) on delete set null,
  validity_approved_at timestamptz,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (regulation_key, version)
);

alter table public.regulatory_change
  add column if not exists source_name text,
  add column if not exists source_title text,
  add column if not exists published_date date,
  add column if not exists retrieved_at timestamptz,
  add column if not exists source_hash text,
  add column if not exists source_excerpt_hash text,
  add column if not exists pdf_hash text,
  add column if not exists category text,
  add column if not exists legal_status text,
  add column if not exists effective_date date,
  add column if not exists deadline_date date,
  add column if not exists penalty_ceiling_gbp numeric,
  add column if not exists validity_approved_by uuid references auth.users(id) on delete set null,
  add column if not exists validity_approved_at timestamptz;

create table if not exists public.impact_rule (
  id uuid primary key default gen_random_uuid(),
  regulatory_change_id uuid not null references public.regulatory_change(id) on delete cascade,
  rule_key text not null,
  version int not null,
  predicate_ref text,
  evidence_requirement jsonb,
  deferral_logic jsonb,
  legal_source_ref text,
  authored_by uuid references auth.users(id) on delete set null,
  title text not null,
  result_domain text[] not null default array['affected','not_affected','deferred','needs_data'],
  demo_mode_only boolean not null default true,
  correctness_approved_by uuid references auth.users(id) on delete set null,
  correctness_approved_at timestamptz,
  active boolean not null default false,
  rule_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (rule_key, version)
);

alter table public.impact_rule
  add column if not exists predicate_ref text,
  add column if not exists evidence_requirement jsonb,
  add column if not exists deferral_logic jsonb,
  add column if not exists legal_source_ref text,
  add column if not exists authored_by uuid references auth.users(id) on delete set null;

create table if not exists public.rule_evaluation (
  id uuid primary key default gen_random_uuid(),
  impact_rule_id uuid not null references public.impact_rule(id),
  impact_rule_version int not null,
  tenancy_id uuid not null references public.leases(id) on delete cascade,
  input_snapshot jsonb not null,
  decision_path text[] not null default '{}',
  result text not null check (result in ('affected','not_affected','deferred','needs_data')),
  obligation_kind text check (obligation_kind in ('information_sheet','written_statement')),
  exposure_gbp_ceiling numeric,
  reason_codes text[] not null default '{}',
  missing_fields text[] not null default '{}',
  deferred_until date,
  deferred_until_basis text,
  evaluation_confidence text check (evaluation_confidence in ('high','medium','low')),
  demo_mode boolean not null default true,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint rule_eval_needs_data_confidence_null check (
    (result = 'needs_data' and evaluation_confidence is null)
    or
    (result <> 'needs_data' and evaluation_confidence is not null)
  ),
  constraint rule_eval_deferred_basis_required check (
    result <> 'deferred'
    or deferred_until is not null
    or deferred_until_basis is not null
  )
);

alter table public.rule_evaluation
  add column if not exists deferred_until_basis text,
  add column if not exists exposure_gbp_ceiling numeric,
  add column if not exists input_snapshot_hash text;

do $$ begin
  alter table public.rule_evaluation
    add constraint rule_eval_deferred_basis_required check (
      result <> 'deferred'
      or deferred_until is not null
      or deferred_until_basis is not null
    );
exception when duplicate_object then null;
end $$;

-- Backfill input_snapshot_hash for pre-remediation rows that lack it.
update public.rule_evaluation
   set input_snapshot_hash = encode(
     extensions.digest(convert_to(input_snapshot::text, 'UTF8'), 'sha256'),
     'hex'
   )
 where input_snapshot_hash is null
   and input_snapshot is not null;

create index if not exists rule_eval_tenancy_time_idx
  on public.rule_evaluation(tenancy_id, evaluated_at desc);

create index if not exists rule_eval_rule_result_idx
  on public.rule_evaluation(impact_rule_id, result, evaluation_confidence);

create or replace function public.rule_evaluation_require_provenance_event()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.provenance_events pe
    where pe.entity_type = 'rule_evaluation'
      and pe.entity_id = new.id
      and pe.event_type = 'evaluation_run'
  ) then
    raise exception 'rule_evaluation % has no corresponding evaluation_run provenance event; persist via the RPC only', new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_rule_evaluation_require_provenance on public.rule_evaluation;
create constraint trigger trg_rule_evaluation_require_provenance
  after insert on public.rule_evaluation
  deferrable initially deferred
  for each row
  execute function public.rule_evaluation_require_provenance_event();

alter table public.regulatory_change enable row level security;
alter table public.impact_rule enable row level security;
alter table public.rule_evaluation enable row level security;

revoke all on table public.regulatory_change from public;
revoke all on table public.impact_rule from public;
revoke all on table public.rule_evaluation from public;

grant select on table public.regulatory_change to authenticated;
grant select on table public.impact_rule to authenticated;
grant select on table public.rule_evaluation to authenticated;

grant all on table public.regulatory_change to service_role;
grant all on table public.impact_rule to service_role;
grant all on table public.rule_evaluation to service_role;

drop policy if exists regulatory_change_select_authenticated on public.regulatory_change;
create policy regulatory_change_select_authenticated
on public.regulatory_change
for select
to authenticated
using (true);

drop policy if exists regulatory_change_no_direct_write on public.regulatory_change;
create policy regulatory_change_no_direct_write
on public.regulatory_change
for all
to authenticated
using (false)
with check (false);

drop policy if exists impact_rule_select_authenticated on public.impact_rule;
create policy impact_rule_select_authenticated
on public.impact_rule
for select
to authenticated
using (true);

drop policy if exists impact_rule_no_direct_write on public.impact_rule;
create policy impact_rule_no_direct_write
on public.impact_rule
for all
to authenticated
using (false)
with check (false);

drop policy if exists rule_evaluation_select_account_managers on public.rule_evaluation;
create policy rule_evaluation_select_account_managers
on public.rule_evaluation
for select
to authenticated
using (
  exists (
    select 1
    from public.leases l
    where l.id = rule_evaluation.tenancy_id
      and public.user_can_manage_account(l.account_id)
  )
);

drop policy if exists rule_evaluation_no_direct_write on public.rule_evaluation;
create policy rule_evaluation_no_direct_write
on public.rule_evaluation
for all
to authenticated
using (false)
with check (false);

with upsert_change as (
  insert into public.regulatory_change (
    regulation_key,
    version,
    source_name,
    source_title,
    published_date,
    retrieved_at,
    source_hash,
    source_excerpt_hash,
    pdf_hash,
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
    active
  )
  values (
    'renters_rights_act_2026',
    1,
    'GOV.UK',
    'Renters'' Rights Act information sheet guidance',
    null,
    null,
    null,
    null,
    null,
    'Renters'' Rights Act 2026 — Information Sheet',
    'GB-ENG',
    'housing',
    'gate_a_verified',
    null,
    '2026-05-01',
    '2026-05-01',
    '2026-05-31',
    7000,
    'VS-1 seed for the RRA information-sheet proof-pack rule. Demo-only until Gate-B approval.',
    null,
    null,
    false
  )
  on conflict (regulation_key, version) do update
  set
    title = excluded.title,
    source_name = excluded.source_name,
    source_title = excluded.source_title,
    published_date = excluded.published_date,
    retrieved_at = excluded.retrieved_at,
    source_hash = excluded.source_hash,
    source_excerpt_hash = excluded.source_excerpt_hash,
    pdf_hash = excluded.pdf_hash,
    jurisdiction = excluded.jurisdiction,
    category = excluded.category,
    legal_status = excluded.legal_status,
    source_url = excluded.source_url,
    effective_from = excluded.effective_from,
    effective_date = excluded.effective_date,
    deadline_date = excluded.deadline_date,
    penalty_ceiling_gbp = excluded.penalty_ceiling_gbp,
    validity_approved_by = excluded.validity_approved_by,
    validity_approved_at = excluded.validity_approved_at,
    notes = excluded.notes
  returning id
)
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
select
  id,
  'rra_info_sheet_v1',
  1,
  'evaluateRraInfoSheetV1',
  jsonb_build_object('obligation', 'information_sheet_or_written_statement', 'evidence', 'per-tenant service evidence required in VS-3'),
  jsonb_build_object('s21_s8_pre_commencement_with_unconcluded_proceedings', true),
  'RPE-spec-v0.3.1 §6',
  null,
  'RRA information-sheet evaluation v1',
  array['affected','not_affected','deferred','needs_data'],
  true,
  null,
  null,
  false,
  jsonb_build_object(
    'spec_version', '0.3.1',
    'commencement', '2026-05-01',
    'closed_reason_codes', array[
      'EXCL_JURISDICTION',
      'EXCL_NOT_AST',
      'EXCL_ENTERED_AFTER',
      'EXCL_NOT_ACTIVE_ON_DATE',
      'EXCL_HIGH_RENT',
      'EXCL_CLASS_LODGER',
      'EXCL_CLASS_COMPANY_LET',
      'EXCL_CLASS_RENT_ACT_1977',
      'EXCL_CLASS_PBSA',
      'DEFER_PENDING_S21',
      'DEFER_PENDING_S8',
      'AFF_INFO_SHEET',
      'AFF_WRITTEN_STATEMENT'
    ],
    'gate_b_questions', array[
      'Tenancy_class value set and reason-code de-duplication for regulated_rent_act versus rent_act_1977.',
      'Exposure presentation: confirm up to £7,000 per affected tenancy as statutory ceiling, not prediction.',
      'Resident_landlord to EXCL_CLASS_LODGER reason-code naming.',
      'Oral tenancy: written statement only, or information sheet as well?',
      'No-notice default: confirm absence of recorded S21/S8 means no deferral.',
      'Excluded-class completeness and rent boundary treatment.'
    ]
  )
from upsert_change
on conflict (rule_key, version) do update
set
  title = excluded.title,
  predicate_ref = excluded.predicate_ref,
  evidence_requirement = excluded.evidence_requirement,
  deferral_logic = excluded.deferral_logic,
  legal_source_ref = excluded.legal_source_ref,
  authored_by = excluded.authored_by,
  result_domain = excluded.result_domain,
  rule_metadata = excluded.rule_metadata;

drop function if exists public.record_rra_info_sheet_rule_evaluation(
  uuid, uuid, jsonb, text[], text, text, text[], text[], date, text, boolean, text, timestamptz
);
drop function if exists public.record_rra_info_sheet_rule_evaluation(
  uuid, uuid, jsonb, text[], text, text, text[], text[], date, text, text, boolean, timestamptz
);
drop function if exists public.record_rra_info_sheet_rule_evaluation(
  uuid, uuid, jsonb, text[], text, text, numeric, text[], text[], date, text, text, boolean, timestamptz
);

create or replace function public.record_rra_info_sheet_rule_evaluation(
  p_account_id uuid,
  p_tenancy_id uuid,
  p_input_snapshot jsonb,
  p_decision_path text[],
  p_result text,
  p_obligation_kind text default null,
  p_exposure_gbp_ceiling numeric default null,
  p_reason_codes text[] default '{}',
  p_missing_fields text[] default '{}',
  p_deferred_until date default null,
  p_deferred_until_basis text default null,
  p_evaluation_confidence text default null,
  p_demo_mode boolean default true,
  p_evaluated_at timestamptz default now()
)
returns public.rule_evaluation
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule public.impact_rule%rowtype;
  v_lease public.leases%rowtype;
  v_evaluation public.rule_evaluation%rowtype;
  v_approved boolean;
  v_snapshot_hash text;
begin
  if p_input_snapshot is null or jsonb_typeof(p_input_snapshot) <> 'object' then
    raise exception 'input_snapshot must be a JSON object';
  end if;

  if coalesce(array_length(p_decision_path, 1), 0) = 0 then
    raise exception 'decision_path is required';
  end if;

  if not public.user_can_manage_account(p_account_id) then
    raise exception 'Not authorized for account';
  end if;

  select *
    into v_lease
    from public.leases l
   where l.id = p_tenancy_id
     and l.account_id = p_account_id;

  if not found then
    raise exception 'Tenancy not found for account';
  end if;

  select *
    into v_rule
    from public.impact_rule ir
   where ir.rule_key = 'rra_info_sheet_v1'
     and ir.version = 1;

  if not found then
    raise exception 'RRA information-sheet impact rule v1 not found';
  end if;

  v_approved := v_rule.active
    and v_rule.correctness_approved_by is not null
    and coalesce(v_rule.demo_mode_only, true) = false;

  if not v_approved and p_demo_mode is not true then
    raise exception 'RRA information-sheet rule v1 is not Gate-B approved; demo_mode is required';
  end if;

  if p_result = 'needs_data' and p_evaluation_confidence is not null then
    raise exception 'needs_data evaluations must have null confidence';
  end if;

  if p_result <> 'needs_data' and p_evaluation_confidence is null then
    raise exception 'non-needs_data evaluations require confidence';
  end if;

  v_snapshot_hash := encode(
    extensions.digest(convert_to(p_input_snapshot::text, 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.rule_evaluation (
    impact_rule_id,
    impact_rule_version,
    tenancy_id,
    input_snapshot,
    input_snapshot_hash,
    decision_path,
    result,
    obligation_kind,
    exposure_gbp_ceiling,
    reason_codes,
    missing_fields,
    deferred_until,
    deferred_until_basis,
    evaluation_confidence,
    demo_mode,
    evaluated_at
  )
  values (
    v_rule.id,
    v_rule.version,
    p_tenancy_id,
    p_input_snapshot,
    v_snapshot_hash,
    p_decision_path,
    p_result,
    p_obligation_kind,
    p_exposure_gbp_ceiling,
    coalesce(p_reason_codes, array[]::text[]),
    coalesce(p_missing_fields, array[]::text[]),
    p_deferred_until,
    p_deferred_until_basis,
    p_evaluation_confidence,
    (p_demo_mode or not v_approved),
    coalesce(p_evaluated_at, now())
  )
  returning * into v_evaluation;

  perform public.record_provenance_event(
    p_account_id,
    'rule_evaluation',
    v_evaluation.id,
    'evaluation_run',
    'human',
    v_evaluation.evaluated_at,
    'RRA information-sheet rule evaluation run',
    v_lease.property_id,
    p_tenancy_id,
    public.account_member_effective_role(p_account_id, auth.uid()),
    null,
    jsonb_build_object(
      'ruleId', v_rule.id,
      'ruleVersion', v_rule.version,
      'tenancyId', p_tenancy_id,
      'result', v_evaluation.result,
      'obligationKind', v_evaluation.obligation_kind,
      'exposureGbpCeiling', v_evaluation.exposure_gbp_ceiling,
      'reasonCodes', v_evaluation.reason_codes,
      'decisionPath', v_evaluation.decision_path,
      'confidence', v_evaluation.evaluation_confidence,
      'inputSnapshotHash', v_snapshot_hash,
      'demoMode', v_evaluation.demo_mode,
      'evaluatedAt', v_evaluation.evaluated_at
    ),
    null,
    null,
    'regulatory_proof_engine',
    v_rule.id,
    null,
    null,
    v_evaluation.id,
    null,
    'internal',
    'rra_info_sheet:evaluation_run:' || v_evaluation.id::text,
    1
  );

  return v_evaluation;
end;
$$;

drop function if exists public.list_rra_info_sheet_rule_evaluations(uuid, integer, integer);

create or replace function public.list_rra_info_sheet_rule_evaluations(
  p_account_id uuid,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  tenancy_id uuid,
  result text,
  aod_branch text,
  evaluation_confidence text,
  decision_path text[],
  reason_codes text[],
  missing_fields text[],
  obligation_kind text,
  exposure_gbp_ceiling numeric,
  deferred_until_basis text,
  demo_mode boolean,
  evaluated_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.user_can_manage_account(p_account_id) then
    raise exception 'Not authorized for account';
  end if;

  return query
  select
    re.id,
    re.tenancy_id,
    re.result,
    case
      when not ('active_on_qualifying_date' = any(re.decision_path)) then 'not_reached'
      when re.input_snapshot -> 'active_on_qualifying_date' ->> 'classification' = 'missing' then 'missing'
      when exists (
        select 1
        from jsonb_array_elements_text(coalesce(
          re.input_snapshot -> 'active_on_qualifying_date' -> 'source_fields',
          '[]'::jsonb
        )) as source_field(value)
        where source_field.value in (
          'leases.term_type',
          'leases.term_type_effective_from',
          'leases.term_type_evidence_basis'
        )
      ) then 'time_qualified_periodic_indicator'
      when lower(coalesce(re.input_snapshot -> 'active_on_qualifying_date' ->> 'admissibility_reason', '')) like '%periodic%'
        or lower(coalesce(re.input_snapshot -> 'active_on_qualifying_date' ->> 'admissibility_reason', '')) like '%open-ended%'
        or lower(coalesce(re.input_snapshot -> 'active_on_qualifying_date' ->> 'admissibility_reason', '')) like '%open_ended%'
        or lower(coalesce(re.input_snapshot -> 'active_on_qualifying_date' ->> 'admissibility_reason', '')) like '%time-qualified%'
        then 'time_qualified_periodic_indicator'
      else 'known_end_date'
    end as aod_branch,
    re.evaluation_confidence,
    re.decision_path,
    re.reason_codes,
    re.missing_fields,
    re.obligation_kind,
    re.exposure_gbp_ceiling,
    re.deferred_until_basis,
    re.demo_mode,
    re.evaluated_at
  from public.rule_evaluation re
  join public.leases l on l.id = re.tenancy_id
  join public.impact_rule ir on ir.id = re.impact_rule_id
  where l.account_id = p_account_id
    and ir.rule_key = 'rra_info_sheet_v1'
    and ir.version = 1
  order by re.evaluated_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

create or replace function public.rra_info_sheet_evaluation_summary(
  p_account_id uuid
)
returns table (
  result text,
  evaluation_confidence text,
  evaluation_count bigint,
  latest_evaluated_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.user_can_manage_account(p_account_id) then
    raise exception 'Not authorized for account';
  end if;

  return query
  select
    re.result,
    re.evaluation_confidence,
    count(*)::bigint as evaluation_count,
    max(re.evaluated_at) as latest_evaluated_at
  from public.rule_evaluation re
  join public.leases l on l.id = re.tenancy_id
  join public.impact_rule ir on ir.id = re.impact_rule_id
  where l.account_id = p_account_id
    and ir.rule_key = 'rra_info_sheet_v1'
    and ir.version = 1
  group by re.result, re.evaluation_confidence
  order by re.result, re.evaluation_confidence nulls first;
end;
$$;

revoke all on function public.record_rra_info_sheet_rule_evaluation(
  uuid, uuid, jsonb, text[], text, text, numeric, text[], text[], date, text, text, boolean, timestamptz
) from public;
revoke all on function public.list_rra_info_sheet_rule_evaluations(uuid, integer, integer) from public;
revoke all on function public.rra_info_sheet_evaluation_summary(uuid) from public;

grant execute on function public.record_rra_info_sheet_rule_evaluation(
  uuid, uuid, jsonb, text[], text, text, numeric, text[], text[], date, text, text, boolean, timestamptz
) to authenticated;
grant execute on function public.list_rra_info_sheet_rule_evaluations(uuid, integer, integer) to authenticated;
grant execute on function public.rra_info_sheet_evaluation_summary(uuid) to authenticated;

commit;
