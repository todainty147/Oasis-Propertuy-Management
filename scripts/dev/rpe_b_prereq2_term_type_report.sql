-- RPE B-prereq-2 term-type diagnostic report.
--
-- Run after:
--   1. scripts/dev/rpe_b_prereq2_term_type_seed.sql
--   2. "Run + record" in the RPE manual diagnostic UI for each seeded lease.

with target_cases as (
  select *
  from (
    values
      ('A_known_end_regression', '9f7e9d24-0000-4e1a-9000-000000000301'::uuid, 'needs_data'::text),
      ('B_admissible_periodic', '9f7e9d24-0000-4e1a-9000-000000000302'::uuid, 'needs_data'::text),
      ('C_no_indicator', '9f7e9d24-0000-4e1a-9000-000000000303'::uuid, 'needs_data'::text),
      ('C_bad_1_no_effective_date', '9f7e9d24-0000-4e1a-9000-000000000304'::uuid, 'needs_data'::text),
      ('C_bad_2_effective_after', '9f7e9d24-0000-4e1a-9000-000000000305'::uuid, 'needs_data'::text),
      ('C_bad_3_no_evidence_basis', '9f7e9d24-0000-4e1a-9000-000000000306'::uuid, 'needs_data'::text),
      ('C_bad_4_fixed_null_end', '9f7e9d24-0000-4e1a-9000-000000000307'::uuid, 'needs_data'::text)
  ) as cases(case_name, tenancy_id, expected_result)
),
latest_eval as (
  select distinct on (tc.case_name)
    tc.case_name,
    re.*
  from target_cases tc
  join public.rule_evaluation re
    on re.tenancy_id = tc.tenancy_id
   and re.result = tc.expected_result
  order by tc.case_name, re.evaluated_at desc
),
latest_event as (
  select distinct on (pe.entity_id)
    pe.entity_id as evaluation_id,
    pe.id as provenance_event_id,
    pe.metadata
  from public.provenance_events pe
  join latest_eval re on re.id = pe.entity_id
  where pe.entity_type = 'rule_evaluation'
    and pe.event_type = 'evaluation_run'
  order by pe.entity_id, pe.recorded_at desc
)
select
  tc.case_name,
  l.property_id,
  tc.tenancy_id,
  l.lease_start_date,
  l.lease_end_date,
  l.term_type,
  l.term_type_effective_from,
  l.term_type_evidence_basis,
  (re.input_snapshot -> 'jurisdiction' ->> 'classification') as jurisdiction_classification,
  (re.input_snapshot -> 'jurisdiction' ->> 'value') as jurisdiction_value,
  (re.input_snapshot -> 'active_on_qualifying_date' ->> 'classification') as active_on_qualifying_date_classification,
  (re.input_snapshot -> 'active_on_qualifying_date' ->> 'value') as active_on_qualifying_date_value,
  (re.input_snapshot -> 'active_on_qualifying_date' ->> 'admissibility_reason') as active_on_qualifying_date_reason,
  re.result,
  coalesce(re.reason_codes, array[]::text[]) as reason_codes,
  coalesce(re.missing_fields, array[]::text[]) as missing_fields,
  coalesce(re.decision_path, array[]::text[]) as decision_path,
  re.evaluation_confidence,
  re.demo_mode,
  re.id as recorded_evaluation_id,
  (le.provenance_event_id is not null) as evaluation_run_event_exists,
  le.metadata ->> 'inputSnapshotHash' as "inputSnapshotHash"
from target_cases tc
left join public.leases l on l.id = tc.tenancy_id
left join latest_eval re on re.case_name = tc.case_name
left join latest_event le on le.evaluation_id = re.id
order by tc.case_name;
