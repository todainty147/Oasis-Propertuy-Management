-- RPE full A/B/C/D + C-bad contract report.
--
-- Purpose:
--   Produce the Section-B closure split that decides the VS-2 opening posture:
--     - B-shaped / evaluable
--     - C-shaped / needs capture
--     - not_reached / disposed before active-on-date
--     - affected / not_affected / needs_data / deferred
--
-- Freshness rule:
--   This report intentionally reads the latest recorded evaluation per target
--   tenancy, without filtering by expected result. A wrong latest result must be
--   visible as a failed row, not hidden behind an older matching row.
--
-- Expected prerequisites:
--   1. B-prereq-1 capacity-safe records seeded and recorded.
--   2. B-prereq-2 term-type records seeded and recorded.
--   3. B-prereq-3 tier-4 records seeded and recorded.
--   4. regulatory_proof_engine_vs1.sql reapplied after B-prereq-4.

with target_cases as (
  select *
  from (
    values
      -- A/B/C/D + C-bad active-on-date branch coverage.
      ('D_not_reached_wales', 'B-prereq-1', '9f7e9d23-0000-4e1a-9000-000000000301'::uuid, 'not_affected'::text, 'not_reached'::text, 'not_reached'::text),
      ('A_known_end', 'B-prereq-2', '9f7e9d24-0000-4e1a-9000-000000000301'::uuid, 'needs_data'::text, 'known_end_date'::text, 'B_shaped_evaluable'::text),
      ('B_periodic_indicator', 'B-prereq-2', '9f7e9d24-0000-4e1a-9000-000000000302'::uuid, 'needs_data'::text, 'time_qualified_periodic_indicator'::text, 'B_shaped_evaluable'::text),
      ('C_no_indicator', 'B-prereq-2', '9f7e9d24-0000-4e1a-9000-000000000303'::uuid, 'needs_data'::text, 'missing'::text, 'C_shaped_needs_capture'::text),
      ('C_bad_1_no_effective_date', 'B-prereq-2', '9f7e9d24-0000-4e1a-9000-000000000304'::uuid, 'needs_data'::text, 'missing'::text, 'C_shaped_needs_capture'::text),
      ('C_bad_2_effective_after', 'B-prereq-2', '9f7e9d24-0000-4e1a-9000-000000000305'::uuid, 'needs_data'::text, 'missing'::text, 'C_shaped_needs_capture'::text),
      ('C_bad_3_no_evidence_basis', 'B-prereq-2', '9f7e9d24-0000-4e1a-9000-000000000306'::uuid, 'needs_data'::text, 'missing'::text, 'C_shaped_needs_capture'::text),
      ('C_bad_4_fixed_null_end', 'B-prereq-2', '9f7e9d24-0000-4e1a-9000-000000000307'::uuid, 'needs_data'::text, 'missing'::text, 'C_shaped_needs_capture'::text),

      -- Tier-4 and first-affected coverage; all are known-end evaluable rows.
      ('company_let_exclusion', 'B-prereq-3', '9f7e9d25-0000-4e1a-9000-000000000401'::uuid, 'not_affected'::text, 'known_end_date'::text, 'B_shaped_evaluable'::text),
      ('resident_landlord_exclusion', 'B-prereq-3', '9f7e9d25-0000-4e1a-9000-000000000402'::uuid, 'not_affected'::text, 'known_end_date'::text, 'B_shaped_evaluable'::text),
      ('rent_act_1977_exclusion', 'B-prereq-3', '9f7e9d25-0000-4e1a-9000-000000000403'::uuid, 'not_affected'::text, 'known_end_date'::text, 'B_shaped_evaluable'::text),
      ('pbsa_exclusion', 'B-prereq-3', '9f7e9d25-0000-4e1a-9000-000000000404'::uuid, 'not_affected'::text, 'known_end_date'::text, 'B_shaped_evaluable'::text),
      ('ordering_company_without_class', 'B-prereq-3', '9f7e9d25-0000-4e1a-9000-000000000405'::uuid, 'not_affected'::text, 'known_end_date'::text, 'B_shaped_evaluable'::text),
      ('company_null_needs_data', 'B-prereq-3', '9f7e9d25-0000-4e1a-9000-000000000406'::uuid, 'needs_data'::text, 'known_end_date'::text, 'B_shaped_evaluable'::text),
      ('tenancy_class_regulated', 'B-prereq-3', '9f7e9d25-0000-4e1a-9000-000000000407'::uuid, 'not_affected'::text, 'known_end_date'::text, 'B_shaped_evaluable'::text),
      ('tenancy_class_null', 'B-prereq-3', '9f7e9d25-0000-4e1a-9000-000000000408'::uuid, 'needs_data'::text, 'known_end_date'::text, 'B_shaped_evaluable'::text),
      ('is_wholly_oral_null', 'B-prereq-3', '9f7e9d25-0000-4e1a-9000-000000000409'::uuid, 'needs_data'::text, 'known_end_date'::text, 'B_shaped_evaluable'::text),
      ('affected_information_sheet', 'B-prereq-3', '9f7e9d25-0000-4e1a-9000-000000000410'::uuid, 'affected'::text, 'known_end_date'::text, 'B_shaped_evaluable'::text),
      ('affected_written_statement', 'B-prereq-3', '9f7e9d25-0000-4e1a-9000-000000000411'::uuid, 'affected'::text, 'known_end_date'::text, 'B_shaped_evaluable'::text)
  ) as cases(case_name, source_prereq, tenancy_id, expected_result, expected_aod_branch, expected_split_bucket)
),
latest_eval as (
  select distinct on (tc.case_name)
    tc.case_name,
    tc.source_prereq,
    tc.expected_result,
    tc.expected_aod_branch,
    tc.expected_split_bucket,
    tc.tenancy_id as target_tenancy_id,
    re.*
  from target_cases tc
  left join public.rule_evaluation re
    on re.tenancy_id = tc.tenancy_id
  order by tc.case_name, re.evaluated_at desc nulls last
),
derived as (
  select
    le.case_name,
    le.source_prereq,
    le.target_tenancy_id as tenancy_id,
    le.expected_result,
    le.expected_aod_branch,
    le.expected_split_bucket,
    le.id as recorded_evaluation_id,
    le.result,
    le.reason_codes,
    le.missing_fields,
    le.decision_path,
    le.obligation_kind,
    le.exposure_gbp_ceiling,
    le.evaluation_confidence,
    le.demo_mode,
    le.evaluated_at,
    le.input_snapshot,
    case
      when le.id is null then null
      when not ('active_on_qualifying_date' = any(le.decision_path)) then 'not_reached'
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
    d.source_prereq,
    d.tenancy_id,
    d.expected_result,
    d.result as actual_result,
    (d.result = d.expected_result) as result_pass,
    d.expected_aod_branch,
    d.actual_aod_branch,
    (d.actual_aod_branch = d.expected_aod_branch) as branch_pass,
    d.expected_split_bucket,
    case
      when d.actual_aod_branch in ('known_end_date', 'time_qualified_periodic_indicator') then 'B_shaped_evaluable'
      when d.actual_aod_branch = 'missing' then 'C_shaped_needs_capture'
      when d.actual_aod_branch = 'not_reached' then 'not_reached'
      else null
    end as actual_split_bucket,
    coalesce(d.reason_codes, array[]::text[]) as reason_codes,
    coalesce(d.missing_fields, array[]::text[]) as missing_fields,
    coalesce(d.decision_path, array[]::text[]) as decision_path,
    d.obligation_kind,
    d.exposure_gbp_ceiling,
    d.evaluation_confidence,
    d.demo_mode,
    d.evaluated_at,
    d.recorded_evaluation_id,
    (e.provenance_event_id is not null) as evaluation_run_event_exists,
    e.input_snapshot_hash,
    (
      d.recorded_evaluation_id is not null
      and e.provenance_event_id is not null
      and d.demo_mode is true
      and d.result = d.expected_result
      and d.actual_aod_branch = d.expected_aod_branch
      and (
        case
          when d.actual_aod_branch in ('known_end_date', 'time_qualified_periodic_indicator') then 'B_shaped_evaluable'
          when d.actual_aod_branch = 'missing' then 'C_shaped_needs_capture'
          when d.actual_aod_branch = 'not_reached' then 'not_reached'
          else null
        end
      ) = d.expected_split_bucket
    ) as contract_row_pass
  from derived d
  left join events e on e.evaluation_id = d.recorded_evaluation_id
)
select
  detail.*,
  count(*) filter (where actual_split_bucket = 'B_shaped_evaluable') over () as b_shaped_evaluable_count,
  count(*) filter (where actual_split_bucket = 'C_shaped_needs_capture') over () as c_shaped_needs_capture_count,
  count(*) filter (where actual_split_bucket = 'not_reached') over () as not_reached_count,
  count(*) filter (where actual_result = 'affected') over () as affected_count,
  count(*) filter (where actual_result = 'not_affected') over () as not_affected_count,
  count(*) filter (where actual_result = 'needs_data') over () as needs_data_count,
  count(*) filter (where actual_result = 'deferred') over () as deferred_count,
  array_agg(actual_aod_branch) filter (where actual_aod_branch is not null) over () as observed_aod_branches,
  bool_and(contract_row_pass) over () as full_contract_pass
from detail
order by source_prereq, case_name;
