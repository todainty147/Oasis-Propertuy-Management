-- RPE B-prereq-1 capacity-safe closure report.
--
-- Run after recording both capacity-safe diagnostic evaluations.
-- This report reads country_subdivision from the recorded input snapshot,
-- because both diagnostic leases intentionally reuse the same source property
-- and that property is flipped between Wales and null during the test.

with target_cases as (
  select
    'RPE_DIAG_WALES_FAST_FAIL'::text as case,
    '9f7e9d23-0000-4e1a-9000-000000000301'::uuid as tenancy_id,
    'not_affected'::text as expected_result
  union all
  select
    'RPE_DIAG_JURISDICTION_GUARD'::text as case,
    '9f7e9d23-0000-4e1a-9000-000000000302'::uuid as tenancy_id,
    'needs_data'::text as expected_result
),
latest_eval as (
  select distinct on (tc.case)
    tc.case,
    re.*
  from target_cases tc
  join public.rule_evaluation re
    on re.tenancy_id = tc.tenancy_id
   and re.result = tc.expected_result
  order by tc.case, re.evaluated_at desc
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
  tc.case,
  l.property_id,
  tc.tenancy_id,
  (re.input_snapshot -> 'jurisdiction' ->> 'value') as country_subdivision,
  (re.input_snapshot -> 'jurisdiction' ->> 'classification') as jurisdiction_classification,
  (re.input_snapshot -> 'jurisdiction' ->> 'value') as jurisdiction_value,
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
left join latest_eval re on re.case = tc.case
left join latest_event le on le.evaluation_id = re.id
order by tc.case;
