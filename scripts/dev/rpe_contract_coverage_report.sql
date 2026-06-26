-- RPE contract test Part A coverage report.
--
-- Purpose:
--   Hard-gate report for the 14 pinned RPE Contract Test v0.3.2 coverage
--   records. This report is pass/fail. Any false contract_row_pass is a
--   finding; diagnose the decision_path and the seed/preparation state first.
--
-- Freshness rule:
--   Reads the latest recorded evaluation per target tenancy, without filtering
--   by expected result. A wrong latest result must fail visibly.

with target_cases as (
  select *
  from (
    values
      ('C1', '9f7e9d26-0000-4e1a-9000-000000000501'::uuid, 'affected'::text, array['AFF_INFO_SHEET']::text[], 'known_end_date'::text, 'medium'::text, array[]::text[], 'information_sheet'::text, 7000::numeric),
      ('C2', '9f7e9d26-0000-4e1a-9000-000000000502'::uuid, 'affected'::text, array['AFF_WRITTEN_STATEMENT']::text[], 'time_qualified_periodic_indicator'::text, 'medium'::text, array[]::text[], 'written_statement'::text, 7000::numeric),
      ('C3', '9f7e9d26-0000-4e1a-9000-000000000503'::uuid, 'not_affected'::text, array['EXCL_CLASS_COMPANY_LET']::text[], 'known_end_date'::text, 'medium'::text, array[]::text[], null::text, null::numeric),
      ('C4', '9f7e9d26-0000-4e1a-9000-000000000504'::uuid, 'not_affected'::text, array['EXCL_CLASS_PBSA']::text[], 'time_qualified_periodic_indicator'::text, 'medium'::text, array[]::text[], null::text, null::numeric),
      ('C5', '9f7e9d26-0000-4e1a-9000-000000000505'::uuid, 'not_affected'::text, array['EXCL_CLASS_LODGER']::text[], 'known_end_date'::text, 'medium'::text, array[]::text[], null::text, null::numeric),
      ('C6', '9f7e9d26-0000-4e1a-9000-000000000506'::uuid, 'not_affected'::text, array['EXCL_CLASS_RENT_ACT_1977']::text[], 'known_end_date'::text, 'medium'::text, array[]::text[], null::text, null::numeric),
      ('C7', '9f7e9d26-0000-4e1a-9000-000000000507'::uuid, 'not_affected'::text, array['EXCL_JURISDICTION']::text[], 'not_reached'::text, 'high'::text, array[]::text[], null::text, null::numeric),
      ('C8', '9f7e9d26-0000-4e1a-9000-000000000508'::uuid, 'not_affected'::text, array['EXCL_JURISDICTION']::text[], 'not_reached'::text, 'high'::text, array[]::text[], null::text, null::numeric),
      ('C9', '9f7e9d26-0000-4e1a-9000-000000000509'::uuid, 'not_affected'::text, array['EXCL_NOT_AST']::text[], 'known_end_date'::text, 'medium'::text, array[]::text[], null::text, null::numeric),
      ('C10', '9f7e9d26-0000-4e1a-9000-000000000510'::uuid, 'needs_data'::text, array[]::text[], 'not_reached'::text, null::text, array['jurisdiction']::text[], null::text, null::numeric),
      ('C11', '9f7e9d26-0000-4e1a-9000-000000000511'::uuid, 'needs_data'::text, array[]::text[], 'missing'::text, null::text, array['active_on_qualifying_date']::text[], null::text, null::numeric),
      ('C12', '9f7e9d26-0000-4e1a-9000-000000000512'::uuid, 'needs_data'::text, array[]::text[], 'missing'::text, null::text, array['active_on_qualifying_date']::text[], null::text, null::numeric),
      ('C13', '9f7e9d26-0000-4e1a-9000-000000000513'::uuid, 'needs_data'::text, array[]::text[], 'time_qualified_periodic_indicator'::text, null::text, array['tenancy_class']::text[], null::text, null::numeric),
      ('C14', '9f7e9d26-0000-4e1a-9000-000000000514'::uuid, 'needs_data'::text, array[]::text[], 'known_end_date'::text, null::text, array['tenancy_class']::text[], null::text, null::numeric)
  ) as cases(
    case_name,
    tenancy_id,
    expected_result,
    expected_reason_codes,
    expected_aod_branch,
    expected_confidence,
    expected_missing_fields,
    expected_obligation_kind,
    expected_exposure_gbp_ceiling
  )
),
latest_eval as (
  select distinct on (tc.case_name)
    tc.*,
    re.id as recorded_evaluation_id,
    re.result,
    re.reason_codes,
    re.missing_fields,
    re.decision_path,
    re.obligation_kind,
    re.exposure_gbp_ceiling,
    re.evaluation_confidence,
    re.demo_mode,
    re.evaluated_at,
    re.input_snapshot
  from target_cases tc
  left join public.rule_evaluation re
    on re.tenancy_id = tc.tenancy_id
  order by tc.case_name, re.evaluated_at desc nulls last
),
derived as (
  select
    le.*,
    case
      when le.recorded_evaluation_id is null then null
      when not ('active_on_qualifying_date' = any(coalesce(le.decision_path, array[]::text[]))) then 'not_reached'
      when le.input_snapshot -> 'active_on_qualifying_date' ->> 'classification' = 'missing' then 'missing'
      when exists (
        select 1
        from jsonb_array_elements_text(coalesce(
          le.input_snapshot -> 'active_on_qualifying_date' -> 'source_fields',
          '[]'::jsonb
        )) as source_field(value)
        where source_field.value in (
          'leases.term_type',
          'leases.term_type_effective_from',
          'leases.term_type_evidence_basis'
        )
      ) then 'time_qualified_periodic_indicator'
      when lower(coalesce(le.input_snapshot -> 'active_on_qualifying_date' ->> 'admissibility_reason', '')) like '%periodic%'
        or lower(coalesce(le.input_snapshot -> 'active_on_qualifying_date' ->> 'admissibility_reason', '')) like '%open-ended%'
        or lower(coalesce(le.input_snapshot -> 'active_on_qualifying_date' ->> 'admissibility_reason', '')) like '%open_ended%'
        or lower(coalesce(le.input_snapshot -> 'active_on_qualifying_date' ->> 'admissibility_reason', '')) like '%time-qualified%'
        then 'time_qualified_periodic_indicator'
      else 'known_end_date'
    end as actual_aod_branch
  from latest_eval le
),
events as (
  select distinct on (pe.entity_id)
    pe.entity_id as evaluation_id,
    pe.id as provenance_event_id,
    pe.metadata ->> 'inputSnapshotHash' as input_snapshot_hash
  from public.provenance_events pe
  join derived d on d.recorded_evaluation_id = pe.entity_id
  where pe.entity_type = 'rule_evaluation'
    and pe.event_type = 'evaluation_run'
  order by pe.entity_id, pe.recorded_at desc
),
detail as (
  select
    d.case_name,
    d.tenancy_id,
    d.expected_result,
    d.result as actual_result,
    d.expected_reason_codes,
    coalesce(d.reason_codes, array[]::text[]) as actual_reason_codes,
    d.expected_aod_branch,
    d.actual_aod_branch,
    d.expected_confidence,
    d.evaluation_confidence as actual_confidence,
    d.expected_missing_fields,
    coalesce(d.missing_fields, array[]::text[]) as actual_missing_fields,
    d.expected_obligation_kind,
    d.obligation_kind as actual_obligation_kind,
    d.expected_exposure_gbp_ceiling,
    d.exposure_gbp_ceiling as actual_exposure_gbp_ceiling,
    coalesce(d.decision_path, array[]::text[]) as decision_path,
    d.demo_mode,
    d.evaluated_at,
    d.recorded_evaluation_id,
    (e.provenance_event_id is not null) as evaluation_run_event_exists,
    e.input_snapshot_hash,
    (
      d.recorded_evaluation_id is not null
      and e.provenance_event_id is not null
      and e.input_snapshot_hash ~ '^[a-f0-9]{64}$'
      and d.demo_mode is true
      and d.result = d.expected_result
      and coalesce(d.reason_codes, array[]::text[]) = d.expected_reason_codes
      and d.actual_aod_branch = d.expected_aod_branch
      and d.evaluation_confidence is not distinct from d.expected_confidence
      and coalesce(d.missing_fields, array[]::text[]) = d.expected_missing_fields
      and d.obligation_kind is not distinct from d.expected_obligation_kind
      and d.exposure_gbp_ceiling is not distinct from d.expected_exposure_gbp_ceiling
    ) as contract_row_pass
  from derived d
  left join events e on e.evaluation_id = d.recorded_evaluation_id
)
select
  detail.*,
  count(*) over () as coverage_case_count,
  count(*) filter (where contract_row_pass) over () as coverage_pass_count,
  bool_and(contract_row_pass) over () as coverage_contract_pass,
  array_agg(actual_aod_branch) filter (where actual_aod_branch is not null) over () as observed_aod_branches,
  array_agg(actual_result) filter (where actual_result is not null) over () as observed_results,
  array_agg(actual_confidence) filter (where actual_confidence is not null) over () as observed_non_null_confidences
from detail
order by case_name;
